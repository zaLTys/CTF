// Command flagrun serves the browser client and runs authoritative game rooms
// over WebSockets on a single port.
package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"flag"
	"log"
	"math/big"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"

	"flagrun/sim"
)

const roomAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

type client struct {
	conn     *websocket.Conn
	send     chan []byte
	roomCode string
	playerID string
}

type hub struct {
	mu      sync.Mutex
	rooms   map[string]*sim.Room
	clients map[*client]struct{}
}

func newHub() *hub {
	return &hub{rooms: map[string]*sim.Room{}, clients: map[*client]struct{}{}}
}

func randomCode() string {
	b := make([]byte, 5)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(roomAlphabet))))
		b[i] = roomAlphabet[n.Int64()]
	}
	return string(b)
}

func nowMs() float64 { return float64(time.Now().UnixNano()) / 1e6 }

// queue never blocks the game loop: a client that cannot keep up skips snapshots.
func (c *client) queue(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	c.queueRaw(data)
}

func (c *client) queueRaw(data []byte) {
	select {
	case c.send <- data:
	default:
	}
}

func (h *hub) leave(c *client) {
	if c.roomCode == "" {
		return
	}
	if r, ok := h.rooms[c.roomCode]; ok {
		sim.RemovePlayer(r, c.playerID)
		if len(r.Players) == 0 {
			delete(h.rooms, c.roomCode)
		}
	}
	c.roomCode, c.playerID = "", ""
}

func errorMsg(text string) map[string]string {
	return map[string]string{"type": "error", "message": text}
}

func (h *hub) handle(c *client, raw []byte) {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil || m == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	switch m["type"] {
	case "create", "join":
		h.leave(c)
		var code string
		var room *sim.Room
		if m["type"] == "create" {
			for code = randomCode(); h.rooms[code] != nil; code = randomCode() {
			}
			mapID, _ := m["mapId"].(string)
			room = sim.CreateRoom(code, mapID)
			h.rooms[code] = room
		} else {
			requested, _ := m["code"].(string)
			code = sanitizeCode(requested)
			room = h.rooms[code]
			if room == nil {
				c.queue(errorMsg("Room not found. Ask the host for a new code."))
				return
			}
		}
		player := sim.AddPlayer(room, sim.NewID())
		if player == nil {
			c.queue(errorMsg("This room already has four players."))
			return
		}
		c.roomCode, c.playerID = code, player.ID
		c.queue(map[string]any{"type": "welcome", "id": player.ID, "team": player.Team, "code": code, "world": sim.WorldFor(room)})
		c.queue(sim.TakeSnapshot(room, nowMs(), player.Team))
	case "input", "vehicle":
		if r := h.rooms[c.roomCode]; r != nil {
			if p := r.Player(c.playerID); p != nil {
				sim.SetInput(p, m)
			}
		}
	case "leave":
		h.leave(c)
		c.queue(map[string]any{"type": "left"})
	case "team":
		r := h.rooms[c.roomCode]
		p := (*sim.Player)(nil)
		if r != nil {
			p = r.Player(c.playerID)
		}
		if p == nil {
			return
		}
		if text := sim.SwitchTeam(r, p); text != "" {
			c.queue(errorMsg(text))
			return
		}
		c.queue(map[string]any{"type": "welcome", "id": p.ID, "team": p.Team, "code": c.roomCode, "world": sim.WorldFor(r)})
		c.queue(sim.TakeSnapshot(r, nowMs(), p.Team))
	case "selfdestruct":
		if r := h.rooms[c.roomCode]; r != nil {
			if p := r.Player(c.playerID); p != nil {
				sim.SelfDestruct(r, p, nowMs())
			}
		}
	}
}

func sanitizeCode(s string) string {
	var b strings.Builder
	for _, ch := range strings.ToUpper(s) {
		if (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') {
			b.WriteRune(ch)
			if b.Len() == 5 {
				break
			}
		}
	}
	return b.String()
}

func (h *hub) serveWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	conn.SetReadLimit(2048)
	c := &client{conn: conn, send: make(chan []byte, 16)}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go c.writeLoop(ctx, cancel)
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			break
		}
		h.handle(c, data)
	}
	h.mu.Lock()
	h.leave(c)
	delete(h.clients, c)
	h.mu.Unlock()
	conn.CloseNow()
}

func (c *client) writeLoop(ctx context.Context, cancel context.CancelFunc) {
	defer cancel()
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case data := <-c.send:
			wctx, done := context.WithTimeout(ctx, 5*time.Second)
			err := c.conn.Write(wctx, websocket.MessageText, data)
			done()
			if err != nil {
				return
			}
		case <-ping.C:
			pctx, done := context.WithTimeout(ctx, 10*time.Second)
			err := c.conn.Ping(pctx)
			done()
			if err != nil {
				return
			}
		}
	}
}

func (h *hub) simulate() {
	tick := time.NewTicker(time.Second / 30)
	for range tick.C {
		now := nowMs()
		h.mu.Lock()
		for _, r := range h.rooms {
			sim.Step(r, now, sim.Tick)
		}
		h.mu.Unlock()
	}
}

// broadcast sends each team its own view: enemy mines never leave the server.
func (h *hub) broadcast() {
	tick := time.NewTicker(time.Second / 20)
	for range tick.C {
		now := nowMs()
		h.mu.Lock()
		views := map[string][]byte{}
		for c := range h.clients {
			r := h.rooms[c.roomCode]
			if r == nil {
				continue
			}
			p := r.Player(c.playerID)
			if p == nil {
				continue
			}
			key := c.roomCode + "/" + p.Team
			data, ok := views[key]
			if !ok {
				var err error
				if data, err = json.Marshal(sim.TakeSnapshot(r, now, p.Team)); err != nil {
					continue
				}
				views[key] = data
			}
			c.queueRaw(data)
		}
		h.mu.Unlock()
	}
}

type staticFiles struct{ root string }

func (s staticFiles) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := r.URL.Path
	if name == "/" {
		name = "/index.html"
	}
	full := filepath.Join(s.root, filepath.FromSlash(filepath.Clean("/"+name)))
	if !strings.HasPrefix(full, s.root+string(filepath.Separator)) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	data, err := os.ReadFile(full)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	ctype := mime.TypeByExtension(filepath.Ext(full))
	switch filepath.Ext(full) {
	case ".js", ".mjs":
		ctype = "text/javascript; charset=utf-8"
	case ".svg":
		ctype = "image/svg+xml"
	}
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(data)
}

func main() {
	publicDir := flag.String("public", "public", "directory with the browser client")
	flag.Parse()
	root, err := filepath.Abs(*publicDir)
	if err != nil {
		log.Fatal(err)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	h := newHub()
	go h.simulate()
	go h.broadcast()
	files := staticFiles{root: root}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			h.serveWS(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})
	srv := &http.Server{Addr: "0.0.0.0:" + port, Handler: handler, ReadHeaderTimeout: 10 * time.Second}
	log.Printf("Flag Run listening at http://localhost:%s", port)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
