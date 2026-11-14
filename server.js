import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { addPlayer, createRoom, removePlayer, setInput, snapshot, step, WIDTH, HEIGHT, BASES, MAPS, MAP_CHOICES, TYPES, TICK } from './game.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('');

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const requested = path.resolve(publicDir, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!requested.startsWith(publicDir + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(requested);
    res.writeHead(200, { 'Content-Type': mime[path.extname(requested)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const wss = new WebSocketServer({ server, maxPayload: 2048 });

function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function leave(ws) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  if (room) {
    removePlayer(room, ws.playerId);
    if (!room.players.size) rooms.delete(ws.roomCode);
  }
  ws.roomCode = null;
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'create' || msg.type === 'join') {
      if (ws.roomCode) leave(ws);
      let code;
      let room;
      if (msg.type === 'create') {
        do { code = randomCode(); } while (rooms.has(code));
        room = createRoom(code, msg.mapId); rooms.set(code, room);
      } else {
        code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
        room = rooms.get(code);
        if (!room) { send(ws, { type: 'error', message: 'Room not found. Ask the host for a new code.' }); return; }
      }
      const player = addPlayer(room, randomUUID());
      if (!player) { send(ws, { type: 'error', message: 'This room already has four players.' }); return; }
      ws.roomCode = code; ws.playerId = player.id;
      send(ws, { type: 'welcome', id: player.id, team: player.team, code, world: { width: WIDTH, height: HEIGHT, bases: BASES, mapId:room.mapId, mapName:room.map.name, biome:room.map.biome, mapChoices:MAP_CHOICES, water: room.map.water, mud:room.map.mud, roads:room.map.roads, cover: room.map.cover, bridges:room.map.bridges, types: TYPES } });
      send(ws, snapshot(room, Date.now(), player.team));
    } else if (ws.roomCode && (msg.type === 'input' || msg.type === 'vehicle')) {
      const p = rooms.get(ws.roomCode)?.players.get(ws.playerId);
      if (p) setInput(p, msg);
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    step(room, now, TICK);
  }
}, 1000 / 30);
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const ws of wss.clients) {
      if (ws.roomCode !== room.code || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount >= 512_000) continue;
      const viewer = room.players.get(ws.playerId);
      ws.send(JSON.stringify(snapshot(room, now, viewer?.team)));
    }
  }
}, 1000 / 20);
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 25_000);
server.listen(port, '0.0.0.0', () => console.log(`Flag Run listening at http://localhost:${port}`));
