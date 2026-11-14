package sim

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math"
	"time"
)

// Object is any damageable map feature: bunkers, buildings, crates, trees,
// bushes, rocks, bridge decks and vehicle wrecks.
type Object struct {
	ID          int     `json:"id"`
	Kind        string  `json:"kind"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	W           float64 `json:"w,omitempty"`
	H           float64 `json:"h,omitempty"`
	Radius      float64 `json:"radius,omitempty"`
	HP          float64 `json:"hp"`
	MaxHP       float64 `json:"maxHp"`
	Stage       int     `json:"stage"`
	Rot         float64 `json:"rot,omitempty"`
	Name        string  `json:"name,omitempty"`
	CollapsedAt float64 `json:"collapsedAt,omitempty"`
	Team        string  `json:"team,omitempty"`
	Type        string  `json:"type,omitempty"`
	Angle       float64 `json:"angle,omitempty"`
	BornAt      float64 `json:"bornAt,omitempty"`
}

func (o *Object) rect() Rect { return Rect{o.X, o.Y, o.W, o.H} }

type Input struct {
	DX, DY, Aim      float64
	Fire, Mine       bool
	TargetX, TargetY float64
	DriveMode        string
}

type Player struct {
	ID        string
	Team      string
	Slot      int
	X, Y      float64
	Type      string
	Angle     float64
	BodyAngle float64
	VX, VY    float64
	Surface   string
	HP        float64
	Ammo      float64
	Fuel      float64
	Mines     float64
	Alive     bool
	RespawnAt float64
	NextFire  float64
	NextMine  float64
	LastTrail float64
	LastRamAt float64
	FireLatch bool
	MineLatch bool
	Input     Input
	// Artillery only: "" (mobile), Deploying, Deployed or Packing.
	Deploy        string
	DeployUntil   float64
	DeployedSince float64
	// NextType is the vehicle this player respawns in (their last choice).
	NextType string
	// DrownAt counts down while a jeep is out past the island's safe waters.
	DrownAt float64
	room    *Room
}

const (
	RespawnMs             = 2400.0
	SelfDestructRespawnMs = 6000.0
	// SeaMargin is how far past the world rectangle a swimming jeep may go;
	// out there it has OffshoreGraceMs to turn back before it is swamped.
	SeaMargin       = 340.0
	OffshoreGraceMs = 5000.0
)

// VehicleLimits caps each vehicle per team; the jeep is unlimited.
var VehicleLimits = map[string]int{"tank": 1, "heli": 1, "asv": 1, "arty": 1, "fpv": 1}

func (p *Player) occupies() string {
	if p.Alive {
		return p.Type
	}
	return p.NextType
}

// VehicleTaken reports whether p's teammates already use up the limit for kind.
func VehicleTaken(r *Room, p *Player, kind string) bool {
	limit, capped := VehicleLimits[kind]
	if !capped {
		return false
	}
	used := 0
	for _, q := range r.Players {
		if q != p && q.Team == p.Team && q.occupies() == kind {
			used++
		}
	}
	return used >= limit
}

func (r *Room) carrying(p *Player) bool {
	for _, f := range r.Flags {
		if f.CarriedBy == p.ID {
			return true
		}
	}
	return false
}

const (
	Deploying     = "deploying"
	Deployed      = "deployed"
	Packing       = "packing"
	ArtyDeployMs  = 1800.0
	ArtyPackMs    = 1400.0
	artyMoveInput = .15
)

type Flag struct {
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	CarriedBy string  `json:"carriedBy"`
	Dropped   bool    `json:"dropped"`
	ReturnAt  float64 `json:"returnAt"`
}

type Turret struct {
	ID       int     `json:"id"`
	Team     string  `json:"team"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	HP       float64 `json:"hp"`
	Angle    float64 `json:"angle"`
	NextFire float64 `json:"nextFire"`
}

type Bullet struct {
	ID       string
	Team     string
	Kind     string
	OwnerID  string
	X, Y     float64
	VX, VY   float64
	Damage   float64
	Radius   float64
	EndAt    float64
	BornAt   float64
	ImpactAt float64
	SX, SY   float64
	TX, TY   float64
}

type Explosion struct {
	ID     string  `json:"id"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	BornAt float64 `json:"bornAt"`
	Until  float64 `json:"until"`
	Scale  float64 `json:"scale"`
	Kind   string  `json:"kind,omitempty"`
}

type Crater struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	R      float64 `json:"r"`
	BornAt float64 `json:"bornAt"`
}

type Trail struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Angle  float64 `json:"angle"`
	Type   string  `json:"type"`
	BornAt float64 `json:"bornAt"`
}

type Strike struct {
	ID         string  `json:"id"`
	OwnerID    string  `json:"ownerId"`
	Team       string  `json:"team"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	LaunchedAt float64 `json:"launchedAt"`
	ImpactAt   float64 `json:"impactAt"`
	Radius     float64 `json:"radius"`
}

type Drone struct {
	ID        string  `json:"id"`
	OwnerID   string  `json:"ownerId"`
	Team      string  `json:"team"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Angle     float64 `json:"angle"`
	ExpiresAt float64 `json:"expiresAt"`
	BornAt    float64 `json:"bornAt"`
}

type Mine struct {
	ID      string
	Team    string
	X, Y    float64
	ArmedAt float64
}

type Room struct {
	Code              string
	MapID             string
	Map               *MapDef
	Players           []*Player
	Bullets           []*Bullet
	Explosions        []Explosion
	Strikes           []Strike
	Drones            []*Drone
	Mines             []Mine
	Craters           []Crater
	Trails            []Trail
	Wrecks            []*Object
	Bridges           []*Object
	Scenery           []*Object
	Obstacles         []*Object
	Turrets           []*Turret
	Scores            map[string]int
	Flags             map[string]*Flag
	Announcement      string
	AnnouncementUntil float64
	PauseUntil        float64
	UpdatedAt         float64
	nextWreckID       int
}

func clamp(v, a, b float64) float64 { return math.Max(a, math.Min(b, v)) }
func hypot(x, y float64) float64    { return math.Hypot(x, y) }
func dist2(ax, ay, bx, by float64) float64 {
	return (ax-bx)*(ax-bx) + (ay-by)*(ay-by)
}
func near(ax, ay, bx, by, r float64) bool { return dist2(ax, ay, bx, by) < r*r }
func angleDelta(a, b float64) float64     { return math.Atan2(math.Sin(b-a), math.Cos(b-a)) }
func approach(v, goal, maxChange float64) float64 {
	return v + clamp(goal-v, -maxChange, maxChange)
}
func sign(v float64) float64 {
	switch {
	case v > 0:
		return 1
	case v < 0:
		return -1
	}
	return 0
}

// jsRound matches Math.round for the positive values the map generator produces.
func jsRound(v float64) float64 { return math.Floor(v + .5) }

func enemyOf(team string) string {
	if team == "blue" {
		return "red"
	}
	return "blue"
}

func circleRect(x, y, r float64, rc Rect) bool {
	cx := clamp(x, rc.X, rc.X+rc.W)
	cy := clamp(y, rc.Y, rc.Y+rc.H)
	return (x-cx)*(x-cx)+(y-cy)*(y-cy) < r*r
}

func NewID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	h := hex.EncodeToString(b[:])
	return fmt.Sprintf("%s-%s-%s-%s-%s", h[0:8], h[8:12], h[12:16], h[16:20], h[20:32])
}

func ObstacleStage(o *Object) int {
	switch {
	case o.HP <= 0:
		return 3
	case o.HP/o.MaxHP <= .34:
		return 2
	case o.HP/o.MaxHP <= .67:
		return 1
	}
	return 0
}

func newObstacles(m *MapDef) []*Object {
	var out []*Object
	for i, c := range m.Cover {
		out = append(out, &Object{ID: i + 1, Kind: "bunker", X: c.X, Y: c.Y, W: c.W, H: c.H, HP: 195, MaxHP: 195})
	}
	for i, c := range m.Buildings {
		out = append(out, &Object{ID: 100 + i, Kind: "building", X: c.X, Y: c.Y, W: c.W, H: c.H, HP: 300, MaxHP: 300})
	}
	for i, c := range supplyCrates {
		out = append(out, &Object{ID: 200 + i, Kind: "crate", X: c.X, Y: c.Y, W: c.W, H: c.H, HP: 65, MaxHP: 65})
	}
	id := 300
	for _, team := range []string{"blue", "red"} {
		for _, p := range baseWalls[team] {
			kind, hp := "wall", 240.0
			if p.gate {
				kind, hp = "gate", 320
			}
			out = append(out, &Object{ID: id, Kind: kind, Team: team, X: p.X, Y: p.Y, W: p.W, H: p.H, HP: hp, MaxHP: hp})
			id++
		}
	}
	return out
}

func newBridges(m *MapDef) []*Object {
	out := make([]*Object, len(m.Bridges))
	for i, b := range m.Bridges {
		out[i] = &Object{ID: i + 1, Kind: "bridge", X: b.X, Y: b.Y, W: b.W, H: b.H, Name: b.Name, HP: 310, MaxHP: 310}
	}
	return out
}

func newScenery(mapID string) []*Object {
	src := scenery[mapID]
	out := make([]*Object, len(src))
	for i := range src {
		c := src[i]
		out[i] = &c
	}
	return out
}

func newTurrets() []*Turret {
	out := make([]*Turret, len(turretPositions))
	for i, t := range turretPositions {
		out[i] = &Turret{ID: i + 1, Team: t.team, X: t.x, Y: t.y, HP: 135}
	}
	return out
}

func nowMs() float64 { return float64(time.Now().UnixNano()) / 1e6 }

func CreateRoom(code, mapID string) *Room {
	m := mapFor(mapID)
	return &Room{
		Code: code, MapID: m.ID, Map: m,
		Bridges: newBridges(m), Scenery: newScenery(m.ID), Obstacles: newObstacles(m),
		Scores: map[string]int{"blue": 0, "red": 0},
		Flags: map[string]*Flag{
			"blue": {X: Bases["blue"].X, Y: Bases["blue"].Y},
			"red":  {X: Bases["red"].X, Y: Bases["red"].Y},
		},
		Turrets:   newTurrets(),
		UpdatedAt: nowMs(),
	}
}

func (r *Room) Player(id string) *Player {
	for _, p := range r.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func spawn(r *Room, p *Player) {
	base := Bases[p.Team]
	kind := p.NextType
	for _, fallback := range []string{"tank", "jeep"} {
		if Types[kind] != nil && !VehicleTaken(r, p, kind) {
			break
		}
		kind = fallback
	}
	if p.Team == "blue" {
		p.X = base.X + 70
		p.Angle = 0
	} else {
		p.X = base.X - 70
		p.Angle = math.Pi
	}
	p.Y = base.Y + float64(p.Slot%4)*46 - 69
	p.Type, p.NextType = kind, kind
	p.BodyAngle = p.Angle
	p.VX, p.VY = 0, 0
	p.Deploy = ""
	p.DrownAt = 0
	p.Surface = "road"
	p.LastTrail, p.LastRamAt = 0, 0
	t := Types[kind]
	p.HP, p.Ammo, p.Fuel = t.HP, t.Ammo, t.Fuel
	p.NextFire = 0
	p.FireLatch = false
	p.Mines, p.NextMine, p.MineLatch = t.Mines, 0, false
	p.Input = Input{Aim: p.Angle, TargetX: p.X, TargetY: p.Y, DriveMode: "vector"}
	p.RespawnAt = 0
	p.Alive = true
}

func AddPlayer(r *Room, id string) *Player {
	if len(r.Players) >= 4 {
		return nil
	}
	if id == "" {
		id = NewID()
	}
	blues := 0
	for _, p := range r.Players {
		if p.Team == "blue" {
			blues++
		}
	}
	team := "red"
	if blues <= len(r.Players)-blues {
		team = "blue"
	}
	p := &Player{ID: id, Team: team, Slot: len(r.Players), room: r}
	spawn(r, p)
	r.Players = append(r.Players, p)
	r.UpdatedAt = nowMs()
	return p
}

func resetFlag(r *Room, team string) {
	f := r.Flags[team]
	f.X, f.Y = Bases[team].X, Bases[team].Y
	f.CarriedBy, f.Dropped, f.ReturnAt = "", false, 0
}

func RemovePlayer(r *Room, id string) {
	idx := -1
	for i, p := range r.Players {
		if p.ID == id {
			idx = i
		}
	}
	if idx < 0 {
		return
	}
	for _, team := range []string{"blue", "red"} {
		if r.Flags[team].CarriedBy == id {
			resetFlag(r, team)
		}
	}
	r.Players = append(r.Players[:idx], r.Players[idx+1:]...)
	drones := r.Drones[:0]
	for _, d := range r.Drones {
		if d.OwnerID != id {
			drones = append(drones, d)
		}
	}
	r.Drones = drones
	r.UpdatedAt = nowMs()
}

func number(v any) (float64, bool) {
	f, ok := v.(float64)
	if !ok || math.IsNaN(f) || math.IsInf(f, 0) {
		return 0, false
	}
	return f, true
}

// SetInput validates a decoded client message; untrusted values are clamped or ignored.
func SetInput(p *Player, m map[string]any) {
	if m == nil {
		return
	}
	switch m["type"] {
	case "input":
		dx, okx := number(m["dx"])
		dy, oky := number(m["dy"])
		if !okx {
			dx = 0
		}
		if !oky {
			dy = 0
		}
		dx, dy = clamp(dx, -1, 1), clamp(dy, -1, 1)
		if mag := hypot(dx, dy); mag > 1 {
			dx, dy = dx/mag, dy/mag
		}
		aim, ok := number(m["aim"])
		if !ok {
			aim = p.Angle
		}
		in := Input{DX: dx, DY: dy, Aim: aim, DriveMode: "vector", Fire: m["fire"] == true, Mine: m["mine"] == true}
		if m["driveMode"] == "classic" {
			in.DriveMode = "classic"
		}
		if tx, ok := number(m["targetX"]); ok {
			in.TargetX = clamp(tx, 0, Width)
		} else {
			in.TargetX = p.X + math.Cos(p.Angle)*460
		}
		if ty, ok := number(m["targetY"]); ok {
			in.TargetY = clamp(ty, 0, Height)
		} else {
			in.TargetY = p.Y + math.Sin(p.Angle)*460
		}
		p.Input = in
	case "vehicle":
		kind, _ := m["vehicle"].(string)
		t, ok := Types[kind]
		if !ok || (p.room != nil && VehicleTaken(p.room, p, kind)) {
			return
		}
		if !p.Alive {
			// Waiting to respawn: queue the choice for the next spawn.
			p.NextType = kind
			return
		}
		base := Bases[p.Team]
		if near(p.X, p.Y, base.X, base.Y, 155) {
			p.Type, p.NextType = kind, kind
			p.HP, p.Ammo, p.Fuel = t.HP, t.Ammo, t.Fuel
			p.Mines, p.NextMine, p.MineLatch = t.Mines, 0, false
			p.NextFire, p.FireLatch = 0, false
			p.VX, p.VY = 0, 0
			p.Deploy = ""
		}
	}
}

// SelfDestruct blows up p's vehicle; the respawn wait is longer than a normal death.
func SelfDestruct(r *Room, p *Player, now float64) {
	if !p.Alive {
		return
	}
	kill(r, p, now)
	p.RespawnAt = now + SelfDestructRespawnMs
}

type hit struct {
	kind    string
	obj     *Object
	vehicle *Player
}

func (h *hit) cleared() bool { return h.obj != nil && h.obj.HP == 0 }

func collisionAt(r *Room, p *Player, x, y float64) *hit {
	rad := Types[p.Type].Radius
	lo, hiX, hiY := rad, Width-rad, Height-rad
	if p.Type == "jeep" {
		lo, hiX, hiY = lo-SeaMargin, hiX+SeaMargin, hiY+SeaMargin
	}
	if x < lo || y < lo || x > hiX || y > hiY {
		return &hit{kind: "edge"}
	}
	if p.Type == "heli" {
		return nil
	}
	for _, q := range r.Players {
		if q.ID != p.ID && q.Alive && hypot(q.X-x, q.Y-y) < Types[q.Type].Radius+rad-1 {
			return &hit{kind: "vehicle", vehicle: q}
		}
	}
	for _, w := range r.Wrecks {
		if w.HP > 0 && hypot(w.X-x, w.Y-y) < w.Radius+rad-3 {
			return &hit{kind: w.Kind, obj: w}
		}
	}
	for _, o := range r.Obstacles {
		if o.HP <= 0 || (o.Kind == "gate" && o.Team == p.Team) {
			continue
		}
		if circleRect(x, y, rad, o.rect()) {
			return &hit{kind: o.Kind, obj: o}
		}
	}
	for _, c := range r.Scenery {
		if c.HP > 0 && hypot(c.X-x, c.Y-y) < c.Radius+rad {
			return &hit{kind: c.Kind, obj: c}
		}
	}
	return nil
}

// inWater reports whether a ground vehicle centred at (x, y) would be afloat: out
// at sea or in a river, and not on an intact bridge deck.
func inWater(r *Room, x, y float64) bool {
	wet := !r.Map.OnIsland(x, y, 0)
	for _, w := range r.Map.Water {
		if wet {
			break
		}
		wet = x >= w.X && x <= w.X+w.W && y >= w.Y && y <= w.Y+w.H
	}
	if !wet {
		return false
	}
	for _, b := range r.Bridges {
		if b.HP > 0 && x >= b.X && x <= b.X+b.W && y >= b.Y && y <= b.Y+b.H {
			return false
		}
	}
	return true
}

func destroyScenery(r *Room, o *Object, now float64) {
	if o.HP > 0 {
		return
	}
	o.HP = 0
	scale := .3
	if o.Kind == "tree" {
		scale = .55
	}
	boom(r, o.X, o.Y, now, scale)
	if o.Kind == "tree" {
		r.Trails = append(r.Trails, Trail{X: o.X, Y: o.Y, Angle: o.Rot * math.Pi / 180, Type: "fall", BornAt: now})
	}
}

func damageObject(r *Room, o *Object, damage, now float64) {
	if o == nil || o.HP <= 0 || o.Kind == "rock" {
		return
	}
	before, prevStage := o.HP, ObstacleStage(o)
	o.HP = math.Max(0, o.HP-damage)
	o.Stage = ObstacleStage(o)
	switch {
	case o.Kind == "bridge" && o.Stage == 3 && prevStage < 3:
		o.CollapsedAt = now
		// Ground vehicles on the span fall when the deck gives way; helicopters fly clear.
		for _, p := range r.Players {
			if !p.Alive || p.Type == "heli" || p.X < o.X || p.X > o.X+o.W || p.Y < o.Y || p.Y > o.Y+o.H {
				continue
			}
			for _, w := range r.Map.Water {
				if circleRect(p.X, p.Y, Types[p.Type].Radius*.7, w) {
					kill(r, p, now)
					break
				}
			}
		}
		boom(r, o.X+o.W*.33, o.Y+o.H*.5, now, 2.4)
		boom(r, o.X+o.W*.67, o.Y+o.H*.5, now, 2.4)
		r.Announcement = o.Name + " DESTROYED — FIND ANOTHER ROUTE"
		r.AnnouncementUntil = now + 2700
	case (o.Kind == "building" || o.Kind == "bunker") && o.Stage > prevStage:
		for stage := prevStage + 1; stage <= o.Stage; stage++ {
			fx, scale := .72, .65
			if stage%2 == 1 {
				fx = .28
			}
			if stage == 3 {
				scale = 1.4
			}
			boom(r, o.X+o.W*fx, o.Y+o.H*.5, now, scale)
		}
	case (o.Kind == "wall" || o.Kind == "gate") && o.HP == 0 && before > 0:
		boom(r, o.X+o.W/2, o.Y+o.H/2, now, 1.3)
		r.Announcement = upper(o.Team) + " " + upper(o.Kind) + " BREACHED"
		r.AnnouncementUntil = now + 2000
	case o.Kind == "wreck" && o.HP == 0:
		boom(r, o.X, o.Y, now, .95)
	}
	if before > 0 && o.HP <= 0 {
		if o.Kind == "tree" || o.Kind == "bush" {
			destroyScenery(r, o, now)
		}
		if o.Kind == "crate" {
			boom(r, o.X+o.W/2, o.Y+o.H/2, now, .8)
		}
	}
}

func ramVehicle(r *Room, p *Player, h *hit, now float64) {
	if h == nil || h.kind != "vehicle" {
		return
	}
	other := h.vehicle
	speed := hypot(p.VX, p.VY)
	if speed < 85 || now-p.LastRamAt < 550 {
		return
	}
	p.LastRamAt = now
	other.VX += p.VX * .18
	other.VY += p.VY * .18
	if other.Team != p.Team {
		damage := math.Min(35, (speed-70)*.19)
		other.HP -= damage
		p.HP -= damage * .19
		if other.HP <= 0 {
			kill(r, other, now)
		}
		if p.HP <= 0 {
			kill(r, p, now)
		}
	}
}

func isHeavy(kind string) bool { return kind == "tank" || kind == "asv" || kind == "arty" }

// crushOnContact lets vehicles flatten soft cover; it reports whether the obstacle is gone.
func crushOnContact(r *Room, p *Player, h *hit, dt, now float64) bool {
	speed, heavy := hypot(p.VX, p.VY), isHeavy(p.Type)
	switch {
	case h.kind == "bush" && speed > 65:
		damageObject(r, h.obj, 50, now)
	case h.kind == "tree" && heavy && speed > 5:
		damageObject(r, h.obj, math.Max(12, speed*.65)*dt*30, now)
	case h.kind == "crate" && speed > 10:
		dmg := 26.0
		if heavy {
			dmg = 70
		}
		damageObject(r, h.obj, dmg*dt*30, now)
	case h.kind == "wreck" && heavy && speed > 70:
		damageObject(r, h.obj, speed*.3*dt*30, now)
	}
	return h.cleared()
}

func moveVehicle(r *Room, p *Player, t *VehicleType, dt, now float64) {
	in := p.Input
	magnitude := math.Min(1, hypot(in.DX, in.DY))
	if p.Type == "heli" {
		// Nose tracks the crosshair. Hull drive maps the stick onto that nose
		// (W/S forward and back, A/D strafe) instead of the screen axes.
		rate := 3.0
		if magnitude > .08 {
			rate = 1.55
		}
		damp := math.Exp(-rate * dt)
		wishX, wishY := in.DX, in.DY
		if in.DriveMode == "classic" {
			fx, fy := math.Cos(p.BodyAngle), math.Sin(p.BodyAngle)
			forward, strafe := -in.DY, in.DX
			wishX = fx*forward - fy*strafe
			wishY = fy*forward + fx*strafe
		}
		p.VX = p.VX*damp + wishX*t.Accel*dt
		p.VY = p.VY*damp + wishY*t.Accel*dt
		if sp := hypot(p.VX, p.VY); sp > t.Speed {
			p.VX *= t.Speed / sp
			p.VY *= t.Speed / sp
		}
		p.BodyAngle += clamp(angleDelta(p.BodyAngle, in.Aim), -t.TurnRate*dt, t.TurnRate*dt)
	} else {
		p.Surface = SurfaceAt(p.X, p.Y, r.MapID)
		if inWater(r, p.X, p.Y) {
			p.Surface = "water"
		}
		tSpeed, tAccel, tGrip := .95, .95, 1.0
		switch p.Surface {
		case "water":
			// Only the jeep stays afloat: wheels up, a third of its land pace, loose steering.
			tSpeed, tAccel, tGrip = 1.0/3, .4, .45
		case "road":
			tSpeed, tAccel, tGrip = 1.16, 1.08, 1.25
		case "mud":
			tSpeed, tAccel, tGrip = .61, .68, .58
		}
		if r.carrying(p) {
			tSpeed, tAccel = tSpeed*.82, tAccel*.88
		}
		forwardSpeed := p.VX*math.Cos(p.BodyAngle) + p.VY*math.Sin(p.BodyAngle)
		throttle, steering := 0.0, 0.0
		if in.DriveMode == "classic" {
			throttle, steering = -in.DY, in.DX
		} else if magnitude > .1 {
			diff := angleDelta(p.BodyAngle, math.Atan2(in.DY, in.DX))
			steering = clamp(diff/(math.Pi*.4), -1, 1)
			factor := 1.0
			if math.Abs(diff) > math.Pi*.66 {
				factor = .2
			} else if math.Abs(diff) > math.Pi*.38 {
				factor = .55
			}
			throttle = magnitude * factor
		}
		var turnFactor float64
		if p.Type == "tank" {
			turnFactor = .52 + .48*math.Min(1, math.Abs(forwardSpeed)/55)
		} else {
			turnFactor = .14 + .86*math.Min(1, math.Abs(forwardSpeed)/90)
		}
		speedTurnPenalty := 1 - .30*math.Min(1, math.Abs(forwardSpeed)/math.Max(1, t.Speed))
		dir := 1.0
		if forwardSpeed < -8 {
			dir = -1
		}
		p.BodyAngle += steering * t.TurnRate * turnFactor * speedTurnPenalty * dt * dir
		fx, fy := math.Cos(p.BodyAngle), math.Sin(p.BodyAngle)
		long := p.VX*fx + p.VY*fy
		lat := -p.VX*fy + p.VY*fx
		top := t.Speed * tSpeed
		target := throttle * top
		if throttle < 0 {
			target *= t.Reverse
		}
		if p.Fuel > 0 && math.Abs(throttle) > .08 {
			accel := t.Brake
			if sign(target) == sign(long) {
				accel = t.Accel
			}
			long = approach(long, target, accel*tAccel*dt)
		} else {
			long = approach(long, 0, t.Coast*tGrip*dt)
		}
		lat *= math.Exp(-t.Grip * tGrip * dt)
		p.VX = fx*long - fy*lat
		p.VY = fy*long + fx*lat
		if speed := hypot(p.VX, p.VY); speed > top*1.08 {
			p.VX *= top * 1.08 / speed
			p.VY *= top * 1.08 / speed
		}
	}
	if p.Fuel <= 0 {
		p.VX = approach(p.VX, 0, t.Brake*dt)
		p.VY = approach(p.VY, 0, t.Brake*dt)
	}
	// Swept, sub-stepped circular collision: slides against bunkers, crushes small cover,
	// and never tunnels through obstacles when a fast jeep crosses one in a single tick.
	movement := hypot(p.VX, p.VY) * dt
	substeps := int(math.Max(1, math.Ceil(movement/7)))
	for j := 0; j < substeps; j++ {
		moveX, moveY := p.VX*dt/float64(substeps), p.VY*dt/float64(substeps)
		hitX := collisionAt(r, p, p.X+moveX, p.Y)
		if hitX != nil && p.Type != "heli" && crushOnContact(r, p, hitX, dt, now) {
			hitX = nil
		}
		if hitX == nil {
			p.X += moveX
		} else {
			ramVehicle(r, p, hitX, now)
			p.VX *= -.11
		}
		hitY := collisionAt(r, p, p.X, p.Y+moveY)
		if hitY != nil && p.Type != "heli" && crushOnContact(r, p, hitY, dt, now) {
			hitY = nil
		}
		if hitY == nil {
			p.Y += moveY
		} else {
			ramVehicle(r, p, hitY, now)
			p.VY *= -.11
		}
	}
	speed := hypot(p.VX, p.VY)
	if p.Type != "heli" && p.Surface != "water" && speed > 68 && now-p.LastTrail > 160 {
		kind := "track"
		if speed > t.Speed*.76 {
			kind = "skid"
		}
		r.Trails = append(r.Trails, Trail{X: p.X, Y: p.Y, Angle: p.BodyAngle, Type: kind, BornAt: now})
		p.LastTrail = now
		if len(r.Trails) > 190 {
			r.Trails = r.Trails[len(r.Trails)-190:]
		}
	}
	if speed > 4 {
		burn := 1.0
		if p.Type == "heli" {
			burn = 1.6
		}
		p.Fuel = math.Max(0, p.Fuel-burn*dt*(.25+speed/t.Speed))
	}
}

type shooter struct {
	team, kind, ownerID string
	x, y, angle         float64
	automated           bool
}

func fireBullet(r *Room, s shooter, now float64) {
	speed, damage := 430.0, 14.0
	if t, ok := Types[s.kind]; ok {
		speed, damage = t.BulletSpeed, t.Damage
	}
	if s.automated {
		speed, damage = TurretShellSpeed, TurretDamage
	}
	muzzle, radius, life := 29.0, 5.0, 1550.0
	if s.kind == "heli" {
		muzzle = 33
	}
	if s.kind == "asv" {
		radius, life = 8, 2250
	}
	kind := s.kind
	if s.automated {
		kind = "turret"
	}
	r.Bullets = append(r.Bullets, &Bullet{
		ID: NewID(), Team: s.team, Kind: kind, OwnerID: s.ownerID,
		X: s.x + math.Cos(s.angle)*muzzle, Y: s.y + math.Sin(s.angle)*muzzle,
		VX: math.Cos(s.angle) * speed, VY: math.Sin(s.angle) * speed,
		Damage: damage, Radius: radius, EndAt: now + life,
	})
}

func playerShot(p *Player) shooter {
	angle := p.Angle
	// Rockets leave along the hull. Every other gun uses its own aim angle.
	if p.Type == "asv" {
		angle = p.BodyAngle
	}
	return shooter{team: p.Team, kind: p.Type, ownerID: p.ID, x: p.X, y: p.Y, angle: angle}
}

func throwGrenade(r *Room, p *Player, now float64) {
	t := Types["jeep"]
	dx, dy := p.Input.TargetX-p.X, p.Input.TargetY-p.Y
	dist := hypot(dx, dy)
	if dist < 56 {
		dx, dy, dist = math.Cos(p.Angle)*56, math.Sin(p.Angle)*56, 56
	}
	if dist > t.Range {
		dx *= t.Range / dist
		dy *= t.Range / dist
		dist = t.Range
	}
	tx, ty := clamp(p.X+dx, 16, Width-16), clamp(p.Y+dy, 16, Height-16)
	flight := 300 + dist*1.15
	r.Bullets = append(r.Bullets, &Bullet{
		ID: NewID(), Team: p.Team, Kind: "grenade", OwnerID: p.ID,
		X: p.X, Y: p.Y, SX: p.X, SY: p.Y, TX: tx, TY: ty,
		VX: (tx - p.X) / (flight / 1000), VY: (ty - p.Y) / (flight / 1000),
		Damage: t.Damage, Radius: 6, BornAt: now, ImpactAt: now + flight, EndAt: now + flight,
	})
}

func layMine(r *Room, p *Player, now float64) {
	if p.Type != "jeep" || p.Mines < 1 || now < p.NextMine {
		return
	}
	x := clamp(p.X-math.Cos(p.BodyAngle)*24, 18, Width-18)
	y := clamp(p.Y-math.Sin(p.BodyAngle)*24, 18, Height-18)
	if inWater(r, x, y) {
		return
	}
	r.Mines = append(r.Mines, Mine{ID: NewID(), Team: p.Team, X: x, Y: y, ArmedAt: now + 650})
	friendly, first := 0, -1
	for i, m := range r.Mines {
		if m.Team == p.Team {
			if first < 0 {
				first = i
			}
			friendly++
		}
	}
	if friendly > 10 {
		r.Mines = append(r.Mines[:first], r.Mines[first+1:]...)
	}
	p.Mines--
	p.NextMine = now + 700
}

func boom(r *Room, x, y, now, scale float64) {
	r.Explosions = append(r.Explosions, Explosion{ID: NewID(), X: x, Y: y, BornAt: now, Until: now + 650, Scale: scale})
	if len(r.Explosions) > 35 {
		r.Explosions = r.Explosions[1:]
	}
}

func kill(r *Room, p *Player, now float64) {
	if !p.Alive {
		return
	}
	// Wrecks persist through respawns, block ground vehicles and absorb shots.
	// Do not choke the friendly garage/spawn area with an unavoidable wreck.
	nearBase := false
	for _, b := range Bases {
		if hypot(b.X-p.X, b.Y-p.Y) < 245 {
			nearBase = true
		}
	}
	// Anything that dies over water sinks: a splash, and no wreck left to block the jeep.
	sunk := inWater(r, p.X, p.Y)
	if !nearBase && !sunk {
		r.nextWreckID++
		r.Wrecks = append(r.Wrecks, &Object{ID: 1000 + r.nextWreckID, Kind: "wreck", Team: p.Team, Type: p.Type,
			X: p.X, Y: p.Y, Angle: p.BodyAngle, Radius: math.Max(19, Types[p.Type].Radius),
			HP: 110, MaxHP: 110, BornAt: now})
		if len(r.Wrecks) > 32 {
			r.Wrecks = r.Wrecks[1:]
		}
	}
	p.Alive = false
	p.DrownAt = 0
	p.RespawnAt = now + RespawnMs
	p.HP = 0
	if sunk {
		boom(r, p.X, p.Y, now, 1.6)
		r.Explosions[len(r.Explosions)-1].Kind = "splash"
	} else {
		boom(r, p.X, p.Y, now, 1.9)
	}
	drones := r.Drones[:0]
	for _, d := range r.Drones {
		if d.OwnerID != p.ID {
			drones = append(drones, d)
		}
	}
	r.Drones = drones
	for _, f := range r.Flags {
		if f.CarriedBy == p.ID {
			f.CarriedBy, f.Dropped, f.ReturnAt = "", true, now+18000
			f.X, f.Y = p.X, p.Y
			if f.X < 0 || f.Y < 0 || f.X > Width || f.Y > Height {
				// Lost at sea: nobody could reach it, so it goes straight home.
				f.ReturnAt = now
			}
		}
	}
}

func capture(r *Room, team string, now float64) {
	r.Scores[team]++
	r.Announcement = fmt.Sprintf("%s TEAM CAPTURED THE FLAG", upper(team))
	r.AnnouncementUntil = now + 3300
	r.PauseUntil = now + 2300
	r.Bullets, r.Strikes, r.Drones, r.Mines = nil, nil, nil, nil
	resetFlag(r, "blue")
	resetFlag(r, "red")
	for _, p := range r.Players {
		spawn(r, p)
	}
	r.Turrets = newTurrets()
	r.Obstacles = newObstacles(r.Map)
	r.Scenery = newScenery(r.MapID)
	r.Bridges = newBridges(r.Map)
	r.Wrecks = nil
	r.Craters, r.Trails = nil, nil
}

func upper(team string) string {
	if team == "blue" {
		return "BLUE"
	}
	return "RED"
}

func splash(r *Room, team string, x, y, radius, damage, now float64) {
	boom(r, x, y, now, radius/65)
	r.Craters = append(r.Craters, Crater{X: x, Y: y, R: radius * .46, BornAt: now})
	if len(r.Craters) > 45 {
		r.Craters = r.Craters[1:]
	}
	for _, p := range r.Players {
		if !p.Alive || p.Team == team {
			continue
		}
		reach := radius + Types[p.Type].Radius
		if d := hypot(p.X-x, p.Y-y); d < reach {
			p.HP -= damage * math.Max(.2, 1-d/reach)
			if p.HP <= 0 {
				kill(r, p, now)
			}
		}
	}
	for _, t := range r.Turrets {
		if t.HP <= 0 || t.Team == team {
			continue
		}
		if d := hypot(t.X-x, t.Y-y); d < radius+26 {
			t.HP = math.Max(0, t.HP-damage*math.Max(.2, 1-d/(radius+26)))
			if t.HP <= 0 {
				boom(r, t.X, t.Y, now, 1.5)
			}
		}
	}
	for _, c := range r.Obstacles {
		if c.HP <= 0 || c.Team == team {
			continue
		}
		nx, ny := clamp(x, c.X, c.X+c.W), clamp(y, c.Y, c.Y+c.H)
		if d := hypot(x-nx, y-ny); d <= radius {
			damageObject(r, c, damage*math.Max(.35, 1-d/radius), now)
		}
	}
	for _, b := range r.Bridges {
		if b.HP <= 0 {
			continue
		}
		nx, ny := clamp(x, b.X, b.X+b.W), clamp(y, b.Y, b.Y+b.H)
		if d := hypot(x-nx, y-ny); d < radius {
			damageObject(r, b, damage*math.Max(.32, 1-d/radius), now)
		}
	}
	for _, w := range r.Wrecks {
		if w.HP <= 0 {
			continue
		}
		if d := hypot(x-w.X, y-w.Y); d < radius+w.Radius {
			damageObject(r, w, damage*math.Max(.3, 1-d/(radius+w.Radius)), now)
		}
	}
	for _, c := range r.Scenery {
		if c.HP <= 0 || c.Kind == "rock" {
			continue
		}
		if d := hypot(c.X-x, c.Y-y); d < radius+c.Radius {
			damageObject(r, c, damage*math.Max(.3, 1-d/(radius+c.Radius)), now)
		}
	}
}

func launchDrone(r *Room, p *Player, now float64) {
	r.Drones = append(r.Drones, &Drone{ID: NewID(), OwnerID: p.ID, Team: p.Team,
		X: p.X + math.Cos(p.Angle)*32, Y: p.Y + math.Sin(p.Angle)*32,
		Angle: p.Angle, ExpiresAt: now + 8500, BornAt: now})
	p.Ammo--
	p.NextFire = now + Types["fpv"].FireMs
}

func detonateDrone(r *Room, d *Drone, now float64) {
	t := Types["fpv"]
	splash(r, d.Team, d.X, d.Y, t.BlastRadius, t.Damage, now)
}

func (r *Room) droneOf(id string) *Drone {
	for _, d := range r.Drones {
		if d.OwnerID == id {
			return d
		}
	}
	return nil
}

func Step(r *Room, now, dt float64) {
	r.UpdatedAt = now
	explosions := r.Explosions[:0]
	for _, e := range r.Explosions {
		if e.Until > now {
			explosions = append(explosions, e)
		}
	}
	r.Explosions = explosions
	craters := r.Craters[:0]
	for _, c := range r.Craters {
		if now-c.BornAt < 28000 {
			craters = append(craters, c)
		}
	}
	r.Craters = craters
	trails := r.Trails[:0]
	for _, t := range r.Trails {
		if now-t.BornAt < 12500 {
			trails = append(trails, t)
		}
	}
	r.Trails = trails
	if now < r.PauseUntil {
		return
	}
	stepPlayers(r, now, dt)
	stepDrones(r, now, dt)
	stepStrikes(r, now)
	stepTurrets(r, now)
	stepBullets(r, now, dt)
	stepFlags(r, now)
	stepMines(r, now)
}

func stepPlayers(r *Room, now, dt float64) {
	for _, p := range r.Players {
		if !p.Alive {
			if now >= p.RespawnAt {
				spawn(r, p)
			} else {
				continue
			}
		}
		t := Types[p.Type]
		var activeDrone *Drone
		if p.Type == "fpv" {
			activeDrone = r.droneOf(p.ID)
		}
		justFired := p.Input.Fire && !p.FireLatch
		p.FireLatch = p.Input.Fire
		if p.Type == "arty" {
			stepDeploy(p, justFired, now)
		}
		if activeDrone == nil {
			if p.Type == "arty" && p.Deploy != "" {
				// Planted or (un)limbering: no drive, and the hull settles quickly.
				in := p.Input
				p.Input.DX, p.Input.DY = 0, 0
				moveVehicle(r, p, t, dt, now)
				p.Input = in
				damp := math.Exp(-6 * dt)
				p.VX, p.VY = p.VX*damp, p.VY*damp
			} else {
				moveVehicle(r, p, t, dt, now)
			}
			if p.Type != "heli" && p.Type != "jeep" && inWater(r, p.X, p.Y) {
				kill(r, p, now)
				continue
			}
			if p.Type == "jeep" {
				if p.X < 0 || p.Y < 0 || p.X > Width || p.Y > Height {
					if p.DrownAt == 0 {
						p.DrownAt = now + OffshoreGraceMs
					} else if now >= p.DrownAt {
						kill(r, p, now)
						continue
					}
				} else {
					p.DrownAt = 0
				}
			}
		}
		aim := math.Atan2(math.Sin(p.Input.Aim), math.Cos(p.Input.Aim))
		if p.Type == "tank" {
			p.Angle += clamp(angleDelta(p.Angle, aim), -2.25*dt, 2.25*dt)
		} else {
			p.Angle = aim
		}
		justMine := p.Input.Mine && !p.MineLatch
		p.MineLatch = p.Input.Mine
		if justMine {
			layMine(r, p, now)
		}
		switch {
		case p.Type == "fpv":
			if activeDrone != nil && justFired && now-activeDrone.BornAt > 250 {
				detonateDrone(r, activeDrone, now)
				drones := r.Drones[:0]
				for _, d := range r.Drones {
					if d.ID != activeDrone.ID {
						drones = append(drones, d)
					}
				}
				r.Drones = drones
			} else if activeDrone == nil && justFired && p.Ammo > 0 && now >= p.NextFire {
				launchDrone(r, p, now)
			}
		case p.Type == "arty":
			if p.Deploy == Deployed && p.DeployedSince < now && justFired && p.Ammo > 0 && now >= p.NextFire {
				tx, ty := p.Input.TargetX, p.Input.TargetY
				// Minimum safe range and an enforced maximum to keep artillery counter-play fair.
				if d := hypot(tx-p.X, ty-p.Y); d >= 145 && d <= t.Range {
					p.Ammo--
					p.NextFire = now + t.FireMs
					r.Strikes = append(r.Strikes, Strike{ID: NewID(), OwnerID: p.ID, Team: p.Team,
						X: tx, Y: ty, LaunchedAt: now, ImpactAt: now + 1200, Radius: t.BlastRadius})
				}
			}
		case p.Type == "jeep":
			if justFired && p.Ammo > 0 && now >= p.NextFire {
				p.Ammo--
				p.NextFire = now + t.FireMs
				throwGrenade(r, p, now)
			}
		case p.Input.Fire && p.Ammo > 0 && now >= p.NextFire:
			p.Ammo--
			p.NextFire = now + t.FireMs
			fireBullet(r, playerShot(p), now)
		}
		base := Bases[p.Team]
		if near(p.X, p.Y, base.X, base.Y, 135) {
			p.Fuel = math.Min(t.Fuel, p.Fuel+dt*17)
			p.Ammo = math.Min(t.Ammo, p.Ammo+dt*12)
			p.HP = math.Min(t.HP, p.HP+dt*24)
			if p.Type == "jeep" {
				p.Mines = math.Min(Types["jeep"].Mines, p.Mines+dt*1.2)
			}
		}
	}
}

// stepDeploy runs the artillery cycle: fire while mobile deploys, fire while
// deployed shoots, driving input while deployed packs up, and fire while
// packing re-deploys in the time already spent packing.
func stepDeploy(p *Player, justFired bool, now float64) {
	moving := hypot(p.Input.DX, p.Input.DY) > artyMoveInput
	switch p.Deploy {
	case "":
		if justFired {
			p.Deploy, p.DeployUntil = Deploying, now+ArtyDeployMs
		}
	case Deploying:
		if now >= p.DeployUntil {
			p.Deploy, p.DeployedSince = Deployed, now
		}
	case Deployed:
		if moving && !justFired {
			p.Deploy, p.DeployUntil = Packing, now+ArtyPackMs
		}
	case Packing:
		if justFired {
			packed := 1 - math.Max(0, p.DeployUntil-now)/ArtyPackMs
			p.Deploy, p.DeployUntil = Deploying, now+ArtyDeployMs*packed
		} else if now >= p.DeployUntil {
			p.Deploy = ""
		}
	}
}

func stepDrones(r *Room, now, dt float64) {
	var remaining []*Drone
	fpv := Types["fpv"]
	for _, d := range r.Drones {
		pilot := r.Player(d.OwnerID)
		if pilot == nil || !pilot.Alive || pilot.Type != "fpv" {
			continue
		}
		if now >= d.ExpiresAt {
			detonateDrone(r, d, now)
			continue
		}
		in := pilot.Input
		vx, vy := in.DX, in.DY
		if in.DriveMode == "classic" {
			// W holds the current nose; A/D yaws. Releasing the stick returns to the crosshair.
			mag := hypot(in.DX, in.DY)
			if mag < .13 {
				d.Angle = math.Atan2(math.Sin(in.Aim), math.Cos(in.Aim))
			} else {
				d.Angle += in.DX * 3.6 * dt
			}
			forward := 1.0
			if mag >= .13 && in.DY > .08 {
				forward = -1
			}
			vx, vy = math.Cos(d.Angle)*forward, math.Sin(d.Angle)*forward
		} else {
			if hypot(vx, vy) < .13 {
				vx, vy = math.Cos(in.Aim), math.Sin(in.Aim)
			}
			mag := math.Max(1, hypot(vx, vy))
			vx, vy = vx/mag, vy/mag
			d.Angle = math.Atan2(vy, vx)
		}
		nx := clamp(d.X+vx*450*dt, 14, Width-14)
		ny := clamp(d.Y+vy*450*dt, 14, Height-14)
		lx, ly := nx-pilot.X, ny-pilot.Y
		if link := hypot(lx, ly); link > fpv.Range {
			nx, ny = pilot.X+lx/link*fpv.Range, pilot.Y+ly/link*fpv.Range
		}
		d.X, d.Y = nx, ny
		struck := false
		for _, p := range r.Players {
			if p.Alive && p.Team != d.Team && near(p.X, p.Y, d.X, d.Y, 34) {
				struck = true
				break
			}
		}
		if !struck {
			for _, t := range r.Turrets {
				if t.HP > 0 && t.Team != d.Team && near(t.X, t.Y, d.X, d.Y, 32) {
					struck = true
					break
				}
			}
		}
		if struck {
			detonateDrone(r, d, now)
			continue
		}
		remaining = append(remaining, d)
	}
	r.Drones = remaining
}

func stepStrikes(r *Room, now float64) {
	var remaining []Strike
	for _, s := range r.Strikes {
		if now >= s.ImpactAt {
			splash(r, s.Team, s.X, s.Y, s.Radius, Types["arty"].Damage, now)
		} else {
			remaining = append(remaining, s)
		}
	}
	r.Strikes = remaining
}

const (
	TurretRange      = 420.0
	TurretShellSpeed = 660.0
	TurretReloadMs   = 700.0
	TurretDamage     = 26.0
)

// leadAngle aims where a moving target will be when a shell of the given speed
// arrives, falling back to aiming straight at it when no intercept exists.
func leadAngle(x, y float64, p *Player, speed float64) float64 {
	dx, dy := p.X-x, p.Y-y
	a := p.VX*p.VX + p.VY*p.VY - speed*speed
	b := 2 * (dx*p.VX + dy*p.VY)
	c := dx*dx + dy*dy
	t := -1.0
	if math.Abs(a) < 1e-6 {
		if b < 0 {
			t = -c / b
		}
	} else if disc := b*b - 4*a*c; disc >= 0 {
		s := math.Sqrt(disc)
		for _, cand := range []float64{(-b - s) / (2 * a), (-b + s) / (2 * a)} {
			if cand > 0 && (t < 0 || cand < t) {
				t = cand
			}
		}
	}
	if t < 0 || t > 1.5 {
		return math.Atan2(dy, dx)
	}
	return math.Atan2(dy+p.VY*t, dx+p.VX*t)
}

func stepTurrets(r *Room, now float64) {
	for _, t := range r.Turrets {
		if t.HP <= 0 {
			continue
		}
		var target *Player
		for _, p := range r.Players {
			if !p.Alive || p.Team == t.Team || !near(t.X, t.Y, p.X, p.Y, TurretRange) {
				continue
			}
			if target == nil || dist2(t.X, t.Y, p.X, p.Y) < dist2(t.X, t.Y, target.X, target.Y) {
				target = p
			}
		}
		if target != nil {
			t.Angle = leadAngle(t.X, t.Y, target, TurretShellSpeed)
			if now >= t.NextFire {
				t.NextFire = now + TurretReloadMs
				fireBullet(r, shooter{team: t.Team, kind: "turret", x: t.X, y: t.Y, angle: t.Angle, automated: true}, now)
			}
		}
	}
}

func stepBullets(r *Room, now, dt float64) {
	var next []*Bullet
	for _, b := range r.Bullets {
		if b.Kind == "grenade" {
			span := math.Max(1, b.ImpactAt-b.BornAt)
			flight := math.Min(1, (now-b.BornAt)/span)
			b.X = b.SX + (b.TX-b.SX)*flight
			b.Y = b.SY + (b.TY-b.SY)*flight
			if now >= b.ImpactAt {
				splash(r, b.Team, b.TX, b.TY, Types["jeep"].BlastRadius, b.Damage, now)
			} else {
				next = append(next, b)
			}
			continue
		}
		if now >= b.EndAt {
			continue
		}
		if !advanceBullet(r, b, now, dt) {
			next = append(next, b)
		} else if b.Kind != "asv" {
			boom(r, b.X, b.Y, now, .6)
		}
	}
	r.Bullets = next
}

// advanceBullet sub-steps a projectile and reports whether it struck something.
func advanceBullet(r *Room, b *Bullet, now, dt float64) bool {
	travel := hypot(b.VX, b.VY) * dt
	substeps := int(math.Max(1, math.Ceil(travel/12)))
	for k := 0; k < substeps; k++ {
		b.X += b.VX * dt / float64(substeps)
		b.Y += b.VY * dt / float64(substeps)
		var struck *Object
		for _, c := range r.Obstacles {
			// Defenders fire out over their own walls and through their own gates.
			if c.HP > 0 && c.Team != b.Team && circleRect(b.X, b.Y, b.Radius, c.rect()) {
				struck = c
				break
			}
		}
		if struck == nil {
			for _, c := range r.Scenery {
				if c.HP > 0 && hypot(c.X-b.X, c.Y-b.Y) < c.Radius+b.Radius {
					struck = c
					break
				}
			}
		}
		if struck == nil {
			for _, w := range r.Wrecks {
				if w.HP > 0 && hypot(w.X-b.X, w.Y-b.Y) < w.Radius+b.Radius {
					struck = w
					break
				}
			}
		}
		// Bridge decks are targeted by heavy shells, not captured by small-arms fire.
		if struck == nil && (b.Kind == "tank" || b.Kind == "asv") {
			for _, o := range r.Bridges {
				if o.HP > 0 && b.X >= o.X+o.W*.21 && b.X <= o.X+o.W*.79 && b.Y >= o.Y && b.Y <= o.Y+o.H {
					struck = o
					break
				}
			}
		}
		if struck != nil {
			if b.Kind == "asv" {
				splash(r, b.Team, b.X, b.Y, 82, b.Damage, now)
			} else {
				damageObject(r, struck, b.Damage, now)
			}
			return true
		}
		if b.X < 0 || b.X > Width || b.Y < 0 || b.Y > Height {
			return true
		}
		for _, p := range r.Players {
			if !p.Alive || p.Team == b.Team || !near(b.X, b.Y, p.X, p.Y, b.Radius+Types[p.Type].Radius) {
				continue
			}
			if b.Kind == "asv" {
				splash(r, b.Team, b.X, b.Y, 82, b.Damage, now)
			} else {
				p.HP -= b.Damage
			}
			if p.Alive && p.HP <= 0 {
				kill(r, p, now)
			}
			return true
		}
		for _, t := range r.Turrets {
			if t.Team == b.Team || t.HP <= 0 || !near(b.X, b.Y, t.X, t.Y, b.Radius+26) {
				continue
			}
			if b.Kind == "asv" {
				splash(r, b.Team, b.X, b.Y, 82, b.Damage, now)
			} else {
				t.HP = math.Max(0, t.HP-b.Damage)
			}
			if t.HP == 0 {
				boom(r, t.X, t.Y, now, 1.7)
			}
			return true
		}
	}
	return false
}

func stepFlags(r *Room, now float64) {
	for _, team := range []string{"blue", "red"} {
		f := r.Flags[team]
		if f.CarriedBy != "" {
			carrier := r.Player(f.CarriedBy)
			if carrier == nil || !carrier.Alive {
				resetFlag(r, team)
			} else {
				f.X, f.Y = carrier.X, carrier.Y-35
			}
		} else if f.Dropped && now >= f.ReturnAt {
			resetFlag(r, team)
		}
	}
	for _, p := range r.Players {
		if !p.Alive {
			continue
		}
		own, enemy := r.Flags[p.Team], r.Flags[enemyOf(p.Team)]
		if own.Dropped && near(p.X, p.Y, own.X, own.Y, 43) {
			resetFlag(r, p.Team)
		}
		if p.Type == "jeep" && enemy.CarriedBy == "" && near(p.X, p.Y, enemy.X, enemy.Y, 52) {
			enemy.CarriedBy, enemy.Dropped = p.ID, false
			r.Announcement = upper(p.Team) + " JEEP STOLE THE FLAG"
			r.AnnouncementUntil = now + 2100
		}
		base := Bases[p.Team]
		if enemy.CarriedBy == p.ID && near(p.X, p.Y, base.X, base.Y, 105) && !own.Dropped && own.CarriedBy == "" {
			capture(r, p.Team, now)
			break
		}
	}
}

func stepMines(r *Room, now float64) {
	var live []Mine
	for _, m := range r.Mines {
		triggered := false
		if now >= m.ArmedAt {
			for _, p := range r.Players {
				if p.Alive && p.Team != m.Team && p.Type != "heli" && near(p.X, p.Y, m.X, m.Y, 30) {
					triggered = true
					break
				}
			}
		}
		if triggered {
			splash(r, m.Team, m.X, m.Y, 86, 96, now)
		} else {
			live = append(live, m)
		}
	}
	r.Mines = live
}
