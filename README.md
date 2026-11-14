# FLAG RUN v0.5: Walls, Rockets and Mines

An original top-down multiplayer vehicle capture-the-flag game, inspired by classic 1990s vehicular combat games. Everything is original; no Return Fire art, code, music or other copyrighted assets are used.

**Engine:** an authoritative Go server (simulation, physics and WebSocket rooms in `sim/` and `main.go`) with a cel-shaded three.js client (`public/render3d.js`). It plays in desktop and phone browsers. The old Canvas 2D view is still available at `/classic.html`.

## Run

Requires **Go 1.25+**.

```bash
go test ./...
go run .            # or: go build -o flagrun.exe . && ./flagrun.exe
```

Set `PORT` to change the port (default 3000). `-public <dir>` changes the static file directory. A multi-stage `Dockerfile` is included. The old Node server (`server.js`, `game.js`) is kept only for reference.

Open **http://localhost:3000**, choose a battlefield and create a room. Others join with the five-character room code or the copied link. A room holds up to **4 players (2v2)**. **LEAVE** in the top bar returns you to the lobby; an empty room is deleted. **SWITCH TEAM** (or `T`) moves you to the other side without leaving: you respawn at that HQ, and mines, wrecks and damage stay on the field. This makes it easy to test the other side's view alone, for example driving into your own mines, which are now enemy mines and invisible to you. For a phone on the same Wi-Fi, open `http://COMPUTER_LAN_IP:3000` and allow TCP/3000 through the firewall. Online hosting needs HTTPS with WebSocket upgrades.

## How to win

Each flag flies from the roof of its team's **HQ building** in the middle of the base. First knock the enemy HQ down (380 HP; any enemy fire works, including tank shells, rockets, artillery, drones and grenades). Then steal the exposed flag with a **jeep** (the only vehicle that can carry it) and bring it back to your own HQ while your own flag is at home. Your own fire never damages your own HQ, walls or gates. Every capture resets the round: flags, HQ buildings, turrets, walls, buildings, bridges, wrecks, mines and projectiles.

## Vehicles

Each team may field **one of each vehicle**, except jeeps (unlimited). Taken vehicles are greyed out. Switch at your base, or pick your next vehicle while waiting to respawn.

| Vehicle | Speed / HP | Primary (left click) | Secondary (right click / `F`) | Notes |
| --- | --- | --- | --- | --- |
| **Recon Jeep** | 330 / 90 | Grenades, lobbed to the cursor (up to 360) | — | Flag carrier. Amphibious: swims at 1/3 speed. Carrying the flag cuts top speed by about 18% |
| **Battle Tank** | 195 / 220 | Cannon along the turret, which turns toward the cursor | — | Heavy armour; can crush wrecks |
| **Attack Heli** | 285 / 125 | Machine gun, 7 damage every 0.15 s | **Ground rockets**: 8 per sortie, dive onto the cursor (up to 380), 85 damage in a 64-unit blast | Flies over water, walls and mines |
| **Rocket ASV** | 182 / 270 | Unguided rockets along the hull, with area damage | **Mines**: 4 per sortie | The mine layer |
| **Field Artillery** | 122 / 160 | Area strikes 145 to 980 units away | — | Must deploy first (see controls). The view widens the longer it stays planted |
| **FPV Operator** | 162 / 110 | Launches a remote kamikaze drone (640 link range) | — | Steer the drone, click again to detonate |

Ammo, fuel, health and secondary stock refill inside your own HQ.

## Battlefield

### Islands, water and the amphibious jeep

- Every map is an island with an irregular, seeded coastline (180-degree symmetric and clear of both bases), surrounded by sea.
- Only the **jeep** can enter water: its wheels fold up and it swims at a third of its land speed. Any other ground vehicle that drives into a river or the sea **sinks** and leaves no wreck.
- A jeep may swim up to 340 units beyond the island. Out there a 5-second countdown starts, and it sinks unless it turns back. A flag lost at sea returns home immediately.

### HQ walls, gates and turrets

- Each HQ sits inside a crenellated stone wall with three gates: one facing the centre and one on each flank.
- **Gates** are solid to enemies, but your own vehicles drive straight through and the doors swing open as you approach.
- Walls (240 HP) and gates (320 HP) can be blown open by enemy fire, with a "WALL/GATE BREACHED" announcement. Your own shots pass over your own walls.
- **Gun turrets** guard the approaches. They lead moving targets, reload in 0.7 s and hit for 26.
- **Anti-air rocket sites** sit in the back corners of each HQ.
  - They ignore ground vehicles and engage only helicopters and FPV drones within 640 units.
  - Every 2.6 s they launch a slow (340 u/s) homing missile with a proximity fuse.
  - An airburst does a flat 65 damage to a helicopter (exactly two hits) and destroys drones outright.
  - Only one missile per team chases a given aircraft at a time, and a helicopter flying flat out can outrun one until it burns out.

### Mines

- Laid by the **Rocket ASV** behind its hull; they arm after 0.65 s and can't be laid in water.
- Your team sees them as blinking beacons with a ripple. Enemies never receive their positions: snapshots are built per team, so the data never leaves the server.
- Any enemy ground vehicle that drives over a mine is **destroyed outright**, whatever its health, and the blast damages anything nearby. Helicopters fly over them.

### Three battlefields

Choose the battlefield **before creating a room**; joining players cannot change it.

| Map | Terrain and tactics |
| --- | --- |
| **Old Causeway** | Temperate forests, wide central highway, north and south river bridges, dense base defences |
| **River Delta** | Wider water channels, wetland foliage and mud, long north/south crossings, scattered side pools |
| **Dust & Iron** | Arid quarry, offset lakes, twin shortcut bridges, a different road network and sparse trees |

All maps use 180-degree symmetric routes and cover. A **permanent dry centre route** always remains, even if every bridge is destroyed.

### Destruction

- **Bridges**:
  - Two per map. Tank shells, rockets, artillery, FPV drones and helicopter rockets damage them.
  - They go from intact to cracked to breached to collapsed. A vehicle on the span when it collapses falls and is destroyed.
- **Buildings and bunkers** collapse in stages. Fully destroyed ones stop blocking vehicles and shots.
- **Trees, bushes and crates** can be destroyed. Rocks absorb fire but don't break.
- **Wrecks**: destroyed vehicles leave smoking wrecks that block ground vehicles and absorb fire.
  - Destroying a wreck, or ramming it fast in a heavy vehicle, clears it.
  - At most 32 per room. None form near an HQ or in water.

### Collisions

Vehicles slide along walls instead of sticking to them. A hull pushed straight into a round obstacle (a tree, rock, wreck or building corner) glances off to the side you steer toward. A little overlap is tolerated, so a hull can squeeze through a gap slightly narrower than itself. Light vehicles skip around cover quickly, while heavy ones grind past. Cover is crushed by the impact speed into it, so scraping past a wreck doesn't flatten it.

### Respawning and self-destruct

- The respawn wait is 2.4 s. **Self-destruct** (HUD button or `K` twice) blows up your vehicle with a 6 s wait.
- While waiting, press `1`–`6` or tap a vehicle to choose your next one. You keep that choice afterwards.

## Controls

| Input | Desktop | Phone |
| --- | --- | --- |
| Drive | WASD or arrow keys, relative to the vehicle nose (W forward, S reverse, A/D steer; helicopters strafe). `C` switches to screen-axis steering | Left virtual joystick |
| Aim | Mouse | Right virtual joystick |
| Fire | Left click or Space | Automatic while aiming, or the FIRE button |
| Secondary (heli rocket / ASV mine) | Right click or `F` | ROCKET / MINE button left of FIRE (shows the count) |
| Switch vehicle | `1`–`6` at your base or while respawning | Unit selector along the bottom |
| Rotate camera | `Q` / `E` | — |
| Self-destruct | `K` twice, or the HUD button | HUD button |
| Sound on/off | `M` | SOUND button |
| Switch team | `T` or SWITCH TEAM (only if the other team has a free slot) | SWITCH TEAM button |
| Leave room | LEAVE button | LEAVE button |
| Artillery | The first click deploys (1.8 s, can't move); then each click fires a timed area strike. Driving packs up (1.4 s); click again to re-deploy | Tap DEPLOY, aim with the right stick, tap STRIKE |
| FPV | Click to launch, steer with WASD, click to detonate | LAUNCH, steer with the left stick, DETONATE |

## Look, sound and camera

- **Look**: cel shading with black ink outlines, detailed low-poly vehicles, puffy multi-blob trees, and animated gates, rotors, artillery legs and jeep wheels.
- **Sound**: synthesised in the browser with WebAudio, with no audio files. It covers engines and rotor wash, gunfire, rockets, missiles, grenades, explosions, airbursts, splashes, artillery whistles, and flag and capture jingles.
- **Camera**: a follow camera that zooms out with speed and leads in the direction of travel.
- **Smoothing**: the client keeps a short buffer of snapshots and draws the world about 80 ms in the past, so motion stays smooth despite network jitter.

## Architecture

```text
public/index.html + client.js   input, HUD, radar, touch controls, snapshot buffer
public/render3d.js              three.js scene: toon-shaded vehicles, walls, water,
                                effects, follow camera
public/sound.js                 procedural WebAudio sound
                                 ⇅ WebSocket JSON (30 Hz simulation, 20 Hz snapshots)
main.go                         HTTP static files + WebSocket rooms (coder/websocket)
                                 ⇣
sim/                            server-owned maps, coastline, walls, bridges, obstacles,
                                wrecks, vehicles, collisions, projectiles, turrets,
                                missiles, mines and objectives
```

Message types from the client: `create`, `join`, `leave`, `team`, `input`, `vehicle`, `selfdestruct`. From the server: `welcome` (with the `world` geometry), `state` (per-team snapshots), `left`, `error`.

## Developer testing

```bash
go test ./...                    # 52 simulation tests
node tools/ws-smoke.mjs 3000     # end-to-end protocol check against a running server (needs the `ws` npm package)
python tools/make_previews.py    # optional; needs Python Playwright and Chromium
```

The tests cover:
- maps, coastline and water rules, bridges and destruction stages;
- walls and gates, gun turrets and AA missiles;
- helicopter rockets, mines, artillery deployment, drowning and offshore limits;
- vehicle limits, respawn choice, self-destruct, flag rules and round reset.

The PNGs in `previews/` are older Canvas 2D captures and predate the 3D client.

## Current limitations

This is a gameplay prototype, not a production game.
- Rooms live in memory only, with no accounts or matchmaking.
- There is no client-side prediction or lag compensation; your own vehicle is shown slightly delayed.
- There is no anti-cheat beyond input clamping.
- Bridge and building collapse is a staged switch, not a physics simulation.
