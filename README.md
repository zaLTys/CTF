# FLAG RUN v0.4 — Destructible Battlefields

An original, playable top-down multiplayer vehicle capture-the-flag game, inspired by classic 1990s vehicular combat games. Everything is original (no Return Fire art, code, music or other copyrighted game assets).

**Engine:** custom HTML5 Canvas 2D and plain JavaScript, Node.js authoritative game server, `ws` WebSocket rooms. No Phaser, Unity or Godot required. Designed for browsers on desktop or phone.

## Run

Requires **Node.js 20+** and an npm connection to install `ws`.

```bash
npm install
npm test
npm start
```

Open **http://localhost:3000**. Choose a map and create a room; another player can join using the room code or copied URL. Up to **4 players (2v2)** per room. For a phone on the same Wi-Fi, open `http://COMPUTER_LAN_IP:3000` and allow TCP/3000 through the machine firewall. Online hosting needs a Node-capable server with HTTPS and WebSocket upgrades.

## What is new in v0.4

### Three different playable battlefields

Select the battlefield **before creating a room**. The server validates the map ID and sends the chosen authoritative geometry to all connected players; joining players cannot change the map.

| Map | Terrain and tactics |
| --- | --- |
| **Old Causeway** | Temperate forests, wide central highway, north and south river bridges, dense base defenses |
| **River Delta** | Wider water channels, wetland foliage and mud, long north/south crossings, scattered side pools |
| **Dust & Iron** | Arid quarry, offset lakes, twin shortcut bridges, different road network and sparse trees |

All maps use 180-degree rotationally symmetric routes/cover for fair starts. A **permanent, dry center route** remains traversable on every map even if all optional bridges are destroyed, preventing a no-way-to-score situation.

### Destructible bridges

- Each map has **two solid bridge decks** crossing water obstacles.
- Ground vehicles can cross an intact bridge. Helicopters can fly over water regardless.
- Tank cannon shells, rocket blasts, and artillery/FPV splash cause bridge damage.
- The bridge has **four visual/physical conditions**: intact, cracked, severely breached, and collapsed.
- A collapsed bridge disappears as a traversable surface. Ground units must take another route; a vehicle on the span when it collapses falls and is destroyed. Any flag it carries is dropped according to existing flag rules.
- Broken bridge piers and debris remain until the next flag capture round; the bridge resets when a new round starts.

### Buildings collapse in stages

- Each map includes new warehouses in addition to legacy bunkers, crates, and trees.
- Warehouses transition through **intact → roof damage/cracks → exposed interior → impassable rubble-free footprint** (the final visual rubble is passable).
- Bunkers also display progressive damage states. Every actual state change comes from server-side object HP, not a local-only effect.
- Shells, rockets, artillery, and drone explosions can breach structures. Fully destroyed objects stop blocking ground vehicles and bullets.

### Persistent vehicle wrecks

- Destroyed jeeps, tanks, helicopters, artillery, rocket vehicles, and FPV operator vehicles leave blackened, smoking wrecks on the battlefield.
- Wrecks are solid circular obstacles that ground vehicles must drive around. Shots and explosions damage them; heavy vehicles can crush them when moving fast enough.
- Reducing wreck HP to zero clears the collision, but scrap remains visible until the round ends.
- Wrecks last **through player respawns**, with a server-side cap of 32 per room. Wrecks are not created in spawn pads to prevent spawn blocking. Wrecks are cleared when a flag is captured (the start of the next round).

### Existing v0.3 features retained

- Six vehicles: Jeep (only flag carrier), Tank (rotating turret), Helicopter (strafe and water travel), Rocket ASV, Field Artillery, FPV Drone Operator.
- Vehicle acceleration, forward/reverse handling, coasting, turning-radius constraints, inertia, collision sliding and ramming.
- Ground roads with improved traction and top speed, slow mud, impassable water, 200-ish destructible trees/bushes/rocks on default map, turrets, buildings and supplies.
- Health, fuel, ammunition, flag stealing, team scoring and repair/rearm at bases.
- Browser multiplayer 30 Hz server simulation and 20 Hz snapshots, plus a minimap and phone controls.

## Controls

| Input | Desktop | Phone |
| --- | --- | --- |
| Drive | WASD or arrow keys, relative to the vehicle nose (W forward, S reverse, A/D steer; helicopters strafe). `C` switches to screen-axis steering | Left virtual joystick |
| Aim | Mouse | Right virtual joystick |
| Fire | Click or Space | Automatic on aim / FIRE button |
| Switch vehicle at your base | Keys `1`–`6` | Unit selector along bottom |
| Artillery | Aim target point and click to launch timed area strike | Aim direction with right stick, tap STRIKE |
| FPV | Click to launch, steer with WASD, click to detonate | LAUNCH, steer left stick, DETONATE |

## Architecture

```text
public/index.html + style.css + client.js
        HTML Canvas 2D / original SVG vehicle sprites / touch UI
                                 ⇅ WebSocket JSON
server.js                   HTTP + WebSocket room and player ownership
                                 ⇣
game.js                     Server-owned map, bridges, obstacles, wrecks,
                            vehicles, collisions, projectiles, objectives
```

Data contracts:
- `createRoom(code, mapId)` chooses the map (fallback `causeway`).
- On welcome, `world` includes `mapId`, `mapName`, `biome`, and water/roads/mud/bridge geometry.
- `snapshot(room)` exposes server-owned `bridges`, `wrecks`, `obstacles` (with `hp`, `maxHp`, and `stage`), and existing entities.
- `step(room, now, dt)` controls destruction and collision, authoritative for all room members.

## Developer testing and screenshots

```bash
npm test
python tools/make_previews.py    # optional: needs Python playwright and Chromium
```

**25 simulation tests pass** including map selection, intact and destroyed bridge crossings, staged artillery damage, staged building destruction, vehicle wrecks blocking traffic and taking fire, vehicle falls on bridge collapse, and reset on scoring. Desktop and mobile preview captures render with no JavaScript page errors.

The `previews/` PNGs are **real client Canvas rendering with representative simulated game states**, not live multiplayer captures. Browser preview generation stubs the socket in order to capture repeatable game states. **Live two-device WebSocket integration was not verified in this environment** because npm dependency installation could not complete. Run `npm install` in your normal development environment, then test with two separate browsers/phones.

## Current limitations

This is a gameplay prototype, not a production game. Rooms are ephemeral and kept in memory. No lag compensation, server-to-client state deltas, anti-cheat beyond input clamping, advanced matchmaker, player accounts, persistent inventory, structural physics rigid-body solver, or audio yet. Bridge collapse is a server-authoritative stage switch and sprite change, not a continuous mesh animation. Future releases could add repair vehicles, more destructible infrastructure, map editing, and deployment.
