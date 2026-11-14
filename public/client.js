import { Renderer3D, deployProgress } from './render3d.js';
import { Sound } from './sound.js';

const $ = id => document.getElementById(id);
const canvas = $('battle');
const overlay = $('overlay'), octx = overlay.getContext('2d');
const radar = $('radar'), rctx = radar.getContext('2d');
const lobby = $('lobby'), hud = $('hud');
let ws, world, game, previous, selfId, selfTeam, code, receivedAt = 0, serverOffset = 0;
// Recent snapshots; the scene is drawn slightly in the past so there is always a pair to blend between.
const snapshots = [];
const INTERP_DELAY_MS = 80;
function interpolationPair(renderTime) {
  for (let i = snapshots.length - 1; i > 0; i--) {
    const a = snapshots[i - 1], b = snapshots[i];
    if (a.time <= renderTime) return { from: a, to: b, alpha: Math.max(0, Math.min(1, (renderTime - a.time) / Math.max(1, b.time - a.time))) };
  }
  return { from: snapshots[0] || game, to: snapshots[1] || game, alpha: 0 };
}
let vw = 1, vh = 1, dpr = 1;
let lastToast = 0, mouseWorld = null, pointerScreen = null, touchRange = 650, lastFrame = 0;
const keyboard = new Set();
const input = { dx: 0, dy: 0, aim: 0, fire: false, driveMode: 'classic' };
const touch = { moving: false, aiming: false, dx: 0, dy: 0, aimX: 1, aimY: 0 };
const colors = { blue: '#68c8db', red: '#f17f6c' };
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const sound = new Sound();
const heard = { bullets: new Set(), explosions: new Set(), strikes: new Set() };
let destructArmedAt = 0, lastWarnSecond = -1;
for (const event of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(event, () => sound.unlock(), { passive: true });

let renderer;
try {
  renderer = new Renderer3D(canvas);
} catch (err) {
  console.error(err);
  $('lobbyMessage').innerHTML = '3D GRAPHICS ARE NOT AVAILABLE ON THIS DEVICE. <a href="/classic.html" style="color:#cfe66b">PLAY THE CLASSIC 2D VIEW →</a>';
  throw err;
}

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  vw = window.innerWidth; vh = window.innerHeight;
  renderer.resize(vw, vh, dpr);
  overlay.width = Math.round(vw * dpr); overlay.height = Math.round(vh * dpr);
}
window.addEventListener('resize', resize);
resize();

function message(s) { $('lobbyMessage').textContent = s; }
function toast(s) {
  $('toast').textContent = s; $('toast').classList.add('visible');
  lastToast = performance.now();
}
function send(obj) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    message('SERVER ONLINE — CREATE A ROOM OR JOIN A FRIEND.');
    if (params.get('room')) {
      const inviteCode = params.get('room').toUpperCase().trim();
      $('roomCode').value = inviteCode;
      send({ type: 'join', code: inviteCode });
    }
  };
  ws.onclose = () => {
    message('CONNECTION LOST. REFRESH TO RECONNECT.');
    if (world) { toast('Connection lost. Reload the game.'); input.fire = false; }
  };
  ws.onerror = () => { message('SERVER UNAVAILABLE. CHECK THAT IT IS RUNNING.'); };
  ws.onmessage = event => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === 'error') { message(data.message.toUpperCase()); toast(data.message); return; }
    if (data.type === 'welcome') {
      snapshots.length = 0;
      world = data.world; selfId = data.id; selfTeam = data.team; code = data.code; input.aim = selfTeam === 'blue' ? 0 : Math.PI;
      lobby.classList.add('hidden'); hud.classList.remove('hidden');
      $('roomLabel').textContent = `ROOM ${code} · ${world.mapName}`;
      history.replaceState(null, '', `?room=${encodeURIComponent(code)}`);
      renderer.setWorld(world, selfTeam);
      toast(`${world.mapName} · ${selfTeam.toUpperCase()} TEAM — Q / E ROTATE CAMERA`);
    }
    if (data.type === 'state') {
      previous = game;
      game = data;
      receivedAt = performance.now();
      // Network jitter makes each sample noisy; the clock estimate drifts toward it slowly.
      const sample = data.time - receivedAt;
      serverOffset = snapshots.length ? serverOffset + (sample - serverOffset) * .06 : sample;
      if (Math.abs(sample - serverOffset) > 250) serverOffset = sample;
      snapshots.push(data);
      if (snapshots.length > 8) snapshots.shift();
      soundEvents(previous, game);
      updateHud();
    }
  };
}
connect();
$('createBtn').onclick = () => { if (ws?.readyState === WebSocket.OPEN) send({ type: 'create', mapId: $('mapSelect').value }); };
$('joinBtn').onclick = () => { if (ws?.readyState === WebSocket.OPEN) send({ type: 'join', code: $('roomCode').value.trim().toUpperCase() }); };
$('roomCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
$('copyLink').onclick = async () => {
  const url = `${location.origin}/?room=${code}`;
  try { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
  catch { prompt('Copy room link:', url); }
};
for (const btn of document.querySelectorAll('[data-vehicle]')) btn.onclick = () => chooseVehicle(btn.dataset.vehicle);
function vehicleTaken(type) {
  const limit = world?.limits?.[type];
  if (!limit || !game) return false;
  return game.players.filter(q => q.id !== selfId && q.team === selfTeam && (q.alive ? q.type : q.nextType) === type).length >= limit;
}
function chooseVehicle(type) {
  const p = self();
  if (!p) return;
  const label = world.types[type].label.toUpperCase();
  if (vehicleTaken(type)) return toast(`A teammate already has the ${label}`);
  sound.click();
  if (!p.alive) { send({ type: 'vehicle', vehicle: type }); return toast(`Respawning as ${label}`); }
  const base = world.bases[selfTeam];
  if (Math.abs(p.x - base.x) > 180 || Math.abs(p.y - base.y) > 162) return toast('Return to your base to change vehicles');
  send({ type: 'vehicle', vehicle: type });
}
const vehicleKeys = { Digit1: 'jeep', Digit2: 'tank', Digit3: 'heli', Digit4: 'asv', Digit5: 'arty', Digit6: 'fpv' };
window.addEventListener('keydown', e => {
  if (document.activeElement === $('roomCode')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keyboard.add(e.code);
  if (vehicleKeys[e.code] && !e.repeat) chooseVehicle(vehicleKeys[e.code]);
  if (e.code === 'KeyK' && !e.repeat && world) selfDestruct();
  if (e.code === 'KeyM' && !e.repeat) toggleSound();
  if (e.code === 'KeyC' && !e.repeat && world) {
    input.driveMode = input.driveMode === 'classic' ? 'vector' : 'classic';
    toast(input.driveMode === 'classic' ? 'HULL DRIVE: WASD FOLLOWS THE VEHICLE NOSE' : 'SCREEN DRIVE: WASD POINTS ALONG THE SCREEN');
  }
});
window.addEventListener('keyup', e => keyboard.delete(e.code));
function selfDestruct() {
  if (!self()?.alive) return;
  if (performance.now() - destructArmedAt < 2200) {
    destructArmedAt = 0;
    send({ type: 'selfdestruct' });
  } else {
    destructArmedAt = performance.now();
    sound.warning();
    toast('Press SELF-DESTRUCT (or K) again to confirm');
  }
}
function toggleSound() {
  sound.unlock();
  sound.setEnabled(!sound.enabled);
  $('soundToggle').textContent = sound.enabled ? 'SOUND ON' : 'SOUND OFF';
}
$('selfDestruct').onclick = selfDestruct;
$('soundToggle').onclick = toggleSound;
$('soundToggle').textContent = sound.enabled ? 'SOUND ON' : 'SOUND OFF';

// Turns snapshot differences into one-shot sounds: shots, blasts, strikes, flags.
function soundEvents(prev, next) {
  const fresh = (list, seen, play) => {
    const ids = new Set();
    for (const item of list || []) { ids.add(item.id); if (prev && !seen.has(item.id)) play(item); }
    seen.clear(); for (const id of ids) seen.add(id);
  };
  fresh(next.bullets, heard.bullets, b => sound.shot(b.kind, b.x, b.y));
  fresh(next.explosions, heard.explosions, e => e.kind === 'splash' ? sound.splash(e.x, e.y) : e.kind === 'airburst' ? sound.airburst(e.x, e.y) : sound.explosion(e.scale, e.x, e.y));
  fresh(next.strikes, heard.strikes, s => {
    const owner = next.players.find(p => p.id === s.ownerId);
    sound.artillery(owner?.x ?? s.x, owner?.y ?? s.y, s.x, s.y, s.impactAt - next.time);
  });
  if (!prev) return;
  for (const team of ['blue', 'red']) {
    if (!prev.flags[team].carriedBy && next.flags[team].carriedBy) sound.pickup();
    if (next.scores[team] > prev.scores[team]) sound.capture(team === selfTeam);
  }
  const was = prev.players.find(p => p.id === selfId), me = next.players.find(p => p.id === selfId);
  if (me && was && me.deploy !== was.deploy && (me.deploy === 'deploying' || me.deploy === 'packing')) sound.deploy();
}
window.addEventListener('blur', () => { keyboard.clear(); input.fire = false; input.secondary = false; touch.moving = false; touch.aiming = false; });

function aimOrigin() {
  const p = self();
  return game?.drones?.find(d => d.ownerId === selfId) || p;
}
function refreshMouseAim() {
  if (!pointerScreen || !world) return;
  mouseWorld = renderer.pickGround(pointerScreen.x, pointerScreen.y);
  const origin = aimOrigin();
  if (!mouseWorld || !origin) return;
  const aim = Math.atan2(mouseWorld.y - origin.y, mouseWorld.x - origin.x);
  if (Number.isFinite(aim)) input.aim = aim;
}
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch' || !world) return;
  pointerScreen = { x: e.clientX, y: e.clientY };
  refreshMouseAim();
});
canvas.addEventListener('pointerdown', e => {
  if (!world || e.pointerType === 'touch') return;
  pointerScreen = { x: e.clientX, y: e.clientY };
  refreshMouseAim();
  if (e.button === 2) input.secondary = true;
  else input.fire = true;
});
// Pointer events only report the first button pressed, so the right button is tracked with mouse events.
canvas.addEventListener('mousedown', e => { if (e.button === 2) input.secondary = true; });
window.addEventListener('mouseup', e => { if (e.button === 2) input.secondary = false; });
window.addEventListener('pointerup', e => { if (e.pointerType !== 'touch' && e.button !== 2) input.fire = false; });
window.addEventListener('pointercancel', () => { input.fire = false; input.secondary = false; });
const action = $('actionButton');
if (action) {
  action.addEventListener('pointerdown', e => { e.preventDefault(); action.setPointerCapture(e.pointerId); input.fire = true; });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) action.addEventListener(event, () => { input.fire = false; });
}
const secondary = $('secondaryButton');
if (secondary) {
  secondary.addEventListener('pointerdown', e => { e.preventDefault(); input.secondary = true; secondary.setPointerCapture(e.pointerId); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) secondary.addEventListener(event, () => { input.secondary = false; });
}
window.addEventListener('contextmenu', e => e.preventDefault());
function bindStick(id, handler, release) {
  const el = $(id), knob = el.querySelector('.stick-knob');
  let pointer = null;
  function move(e) {
    if (e.pointerId !== pointer) return;
    const box = el.getBoundingClientRect();
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    const radius = box.width * .34;
    const magnitude = Math.max(1, Math.hypot(x, y) / radius);
    const dx = x / radius / magnitude, dy = y / radius / magnitude;
    knob.style.transform = `translate(${dx * radius}px,${dy * radius}px)`;
    handler(dx, dy, Math.hypot(dx, dy));
  }
  el.addEventListener('pointerdown', e => { e.preventDefault(); pointer = e.pointerId; el.setPointerCapture(pointer); move(e); });
  el.addEventListener('pointermove', move);
  const end = e => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    knob.style.transform = 'translate(0,0)';
    release();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
bindStick('leftStick', (dx, dy) => { touch.moving = true; touch.dx = dx; touch.dy = dy; }, () => { touch.moving = false; touch.dx = 0; touch.dy = 0; });
bindStick('rightStick', (dx, dy, magnitude) => {
  touch.aiming = magnitude > .15;
  if (touch.aiming) { touch.aimX = dx; touch.aimY = dy; }
  // Artillery and FPV use the separate FIRE button, so aiming never triggers an accidental strike.
  if (!['arty', 'fpv'].includes(self()?.type)) input.fire = touch.aiming;
  touchRange = 145 + magnitude * 820;
}, () => { touch.aiming = false; if (!['arty', 'fpv'].includes(self()?.type)) input.fire = false; });

function self() { return game?.players.find(p => p.id === selfId); }
function updateHud() {
  if (!game || !world) return;
  $('blueScore').textContent = game.scores.blue;
  $('redScore').textContent = game.scores.red;
  const p = self(); if (!p) return;
  const t = world.types[p.type];
  const remoteDrone = game.drones?.find(d => d.ownerId === selfId);
  const artyAction = { deploying: 'DEPLOYING', deployed: 'STRIKE', packing: 'RE-DEPLOY' }[p.deploy] || 'DEPLOY';
  $('actionButton').textContent = p.type === 'fpv' ? (remoteDrone ? 'DETONATE' : 'LAUNCH') : p.type === 'arty' ? artyAction : p.type === 'jeep' ? 'THROW' : 'FIRE';
  const secondaryUse = p.alive && { heli: 'ROCKET', asv: 'MINE' }[p.type];
  const sb = $('secondaryButton');
  sb.classList.toggle('off', !secondaryUse);
  if (secondaryUse) {
    const left = Math.floor(p.mines ?? 0);
    sb.innerHTML = `${secondaryUse}<br>${left}`;
    sb.classList.toggle('empty', left < 1);
  }
  const deployPct = Math.round(deployProgress(p, game.time) * 100);
  const artyStatus = {
    deploying: `DEPLOYING ${deployPct}% · HOLD STILL`,
    deployed: 'DEPLOYED · CLICK TO STRIKE · MOVE TO PACK UP',
    packing: `PACKING UP ${100 - deployPct}% · CLICK TO RE-DEPLOY`,
  }[p.deploy] || 'MOBILE · CLICK TO DEPLOY THE GUN';
  const link = remoteDrone ? Math.max(0, world.types.fpv.range - Math.hypot(remoteDrone.x - p.x, remoteDrone.y - p.y)) : world.types.fpv.range;
  $('unitStatus').textContent = p.type === 'fpv' ? (remoteDrone ? `DRONE LIVE · ${Math.ceil((remoteDrone.expiresAt - game.time) / 1000)}s · LINK ${Math.round(link)}` : `READY TO LAUNCH · LINK ${world.types.fpv.range}`)
    : p.type === 'arty' ? artyStatus
    : p.type === 'jeep' ? 'FLAG CARRIER · GRENADES AIM FREELY'
    : p.type === 'tank' ? 'CANNON FOLLOWS THE TURRET'
    : p.type === 'asv' ? `ROCKETS LEAVE ALONG THE HULL · MINES ${Math.floor(p.mines ?? 0)} (RIGHT CLICK / F)`
    : p.type === 'heli' ? `MACHINE GUN · GROUND ROCKETS ${Math.floor(p.mines ?? 0)} (RIGHT CLICK / F)`
    : 'RETURN TO BASE FOR REPAIR + RESUPPLY';
  const speed = Math.round(Math.hypot(p.vx || 0, p.vy || 0));
  $('physicsStatus').textContent = `${world.mapName} · ${p.type === 'heli' ? 'AIRBORNE' : (p.surface || 'GRASS').toUpperCase()} · SPEED ${speed} · ${input.driveMode === 'classic' ? 'HULL' : 'SCREEN'} DRIVE`;
  $('vehicleName').textContent = t.label.toUpperCase();
  for (const [name, max, curr] of [['hp', t.hp, p.hp], ['ammo', t.ammo, p.ammo], ['fuel', t.fuel, p.fuel]]) {
    const pct = Math.max(0, Math.round(curr / max * 100));
    $(`${name}Bar`).style.width = `${pct}%`;
    $(`${name}Value`).textContent = `${pct}%`;
  }
  const chosen = p.alive ? p.type : p.nextType;
  document.querySelectorAll('[data-vehicle]').forEach(b => {
    b.classList.toggle('selected', b.dataset.vehicle === chosen);
    b.classList.toggle('queued', !p.alive && b.dataset.vehicle === chosen);
    b.classList.toggle('taken', vehicleTaken(b.dataset.vehicle));
  });
  const banner = $('banner');
  let text = '', warning = false;
  if (game.announcement) text = game.announcement;
  else if (!p.alive) {
    const wait = Math.max(0, (p.respawnAt - game.time) / 1000).toFixed(1);
    text = `RESPAWN IN ${wait}s · NEXT: ${world.types[chosen]?.label.toUpperCase() || 'BATTLE TANK'} (1–6 TO CHANGE)`;
  } else if (p.drownAt) {
    text = `TOO FAR OUT — TURN BACK · SINKING IN ${Math.max(0, (p.drownAt - game.time) / 1000).toFixed(1)}s`;
    warning = true;
  }
  banner.textContent = text;
  banner.classList.toggle('hidden', !text);
  banner.classList.toggle('warning', warning);
  $('selfDestruct').disabled = !p.alive;
}

function aimTarget(p) {
  if (!p) return null;
  if (coarse) return { x: p.x + Math.cos(input.aim) * touchRange, y: p.y + Math.sin(input.aim) * touchRange };
  if (mouseWorld) return mouseWorld;
  return { x: p.x + Math.cos(input.aim) * 500, y: p.y + Math.sin(input.aim) * 500 };
}

function render(time) {
  requestAnimationFrame(render);
  const dt = Math.min(64, Math.max(0, time - (lastFrame || time)));
  lastFrame = time;
  if (!world || !game) return;
  const spin = (keyboard.has('KeyE') ? 1 : 0) - (keyboard.has('KeyQ') ? 1 : 0);
  if (spin) { renderer.rotateCamera(spin * 1.9 * dt / 1000); }
  if (coarse && touch.aiming) {
    const [wx, wy] = renderer.screenToWorldVector(touch.aimX, touch.aimY);
    input.aim = Math.atan2(wy, wx);
  } else refreshMouseAim();
  const p = self();
  const renderTime = performance.now() + serverOffset - INTERP_DELAY_MS;
  const pair = interpolationPair(renderTime);
  renderer.frame({ game: pair.to, previous: pair.from, alpha: pair.alpha, serverNow: renderTime, selfId, time, mouseWorld, target: aimTarget(p) });
  sound.setListener(renderer.focus.x, renderer.focus.z, renderer.yaw);
  const myDrone = game.drones?.find(d => d.ownerId === selfId);
  sound.engine({ type: p?.type, alive: !!p?.alive, speed: Math.hypot(p?.vx || 0, p?.vy || 0), top: world.types[p?.type]?.speed, swimming: p?.surface === 'water', drone: !!myDrone });
  if (p?.drownAt) {
    const second = Math.ceil((p.drownAt - serverNow) / 1000);
    if (second !== lastWarnSecond && second >= 0) { lastWarnSecond = second; sound.warning(); }
  } else lastWarnSecond = -1;
  $('selfDestruct').classList.toggle('armed', performance.now() - destructArmedAt < 2200);
  drawDroneOverlay(p);
  drawRadar();
  if (performance.now() - lastToast > 2400) $('toast').classList.remove('visible');
}

function drawDroneOverlay(p) {
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, vw, vh);
  const drone = game.drones?.find(d => d.ownerId === selfId);
  if (!drone || !p) return;
  octx.fillStyle = '#172a2122'; for (let y = 0; y < vh; y += 7) octx.fillRect(0, y, vw, 1);
  octx.strokeStyle = '#a9e9be6b'; octx.lineWidth = 1.5;
  octx.strokeRect(25, 76, vw - 50, Math.max(20, vh - 185));
  octx.fillStyle = '#ddf5c6'; octx.font = '900 12px system-ui'; octx.textAlign = 'left';
  const linkLeft = Math.max(0, world.types.fpv.range - Math.hypot(drone.x - p.x, drone.y - p.y));
  octx.fillText(`FPV TELEMETRY  //  ${(Math.max(0, drone.expiresAt - (performance.now() + serverOffset)) / 1000).toFixed(1)}s BATTERY  //  LINK ${Math.round(linkLeft)}`, 35, 100);
}

function drawRadar() {
  const x = radar.width / world.width, y = radar.height / world.height;
  if (world.coast?.length) {
    rctx.fillStyle = '#16343a'; rctx.fillRect(0, 0, radar.width, radar.height);
    rctx.fillStyle = '#182f2a'; rctx.beginPath();
    world.coast.forEach((c, i) => i ? rctx.lineTo(c.x * x, c.y * y) : rctx.moveTo(c.x * x, c.y * y));
    rctx.closePath(); rctx.fill();
    rctx.strokeStyle = '#b5a77a88'; rctx.lineWidth = 1; rctx.stroke();
  } else { rctx.fillStyle = '#182f2a'; rctx.fillRect(0, 0, radar.width, radar.height); }
  rctx.fillStyle = '#527f83'; for (const w of world.water) rctx.fillRect(w.x * x, w.y * y, w.w * x, w.h * y);
  for (const b of game.bridges ?? []) { rctx.fillStyle = b.hp > 0 ? '#c4be8e' : '#6c4740'; rctx.fillRect(b.x * x, b.y * y, b.w * x, b.h * y); }
  for (const c of game.obstacles ?? []) {
    if (c.hp <= 0) continue;
    rctx.fillStyle = c.kind === 'gate' ? colors[c.team] : c.kind === 'wall' ? '#c9c6b0' : '#7f9276';
    rctx.fillRect(c.x * x, c.y * y, Math.max(1.5, c.w * x), Math.max(1.5, c.h * y));
  }
  for (const o of game.scenery ?? []) { if (o.hp <= 0) continue; rctx.fillStyle = o.kind === 'rock' ? '#9da797' : '#335b38'; rctx.fillRect(o.x * x - 1, o.y * y - 1, 3, 3); }
  for (const w of game.wrecks ?? []) { rctx.fillStyle = w.hp > 0 ? '#e6a275' : '#716459'; rctx.fillRect(w.x * x - 2, w.y * y - 2, 4, 4); }
  for (const side of ['blue', 'red']) {
    rctx.fillStyle = colors[side]; const b = world.bases[side]; rctx.fillRect(b.x * x - 4, b.y * y - 4, 8, 8);
    const f = game.flags[side]; rctx.beginPath(); rctx.arc(f.x * x, f.y * y, 3, 0, Math.PI * 2); rctx.fill();
  }
  for (const t of game.turrets) {
    if (t.hp <= 0) continue;
    rctx.fillStyle = colors[t.team];
    if (t.kind === 'aa') { rctx.beginPath(); rctx.moveTo(t.x * x, t.y * y - 3); rctx.lineTo(t.x * x + 3, t.y * y + 2); rctx.lineTo(t.x * x - 3, t.y * y + 2); rctx.fill(); }
    else rctx.fillRect(t.x * x - 1, t.y * y - 1, 3, 3);
  }
  for (const d of game.drones ?? []) { rctx.fillStyle = d.ownerId === selfId ? '#fcfaab' : colors[d.team]; rctx.beginPath(); rctx.arc(d.x * x, d.y * y, 4, 0, 6.283); rctx.fill(); }
  for (const s of game.strikes ?? []) { rctx.strokeStyle = '#ffca72'; rctx.beginPath(); rctx.arc(s.x * x, s.y * y, 5, 0, 6.283); rctx.stroke(); }
  for (const p of game.players) { if (!p.alive) continue; rctx.fillStyle = p.id === selfId ? '#ffffff' : colors[p.team]; rctx.beginPath(); rctx.arc(p.x * x, p.y * y, p.id === selfId ? 4 : 3, 0, Math.PI * 2); rctx.fill(); }
  for (const m of game.mines ?? []) { rctx.fillStyle = colors[m.team] || '#d7e2a2'; rctx.fillRect(m.x * x - 1, m.y * y - 1, 3, 3); }
  const corners = renderer.groundCorners();
  rctx.strokeStyle = '#e4e7d090'; rctx.lineWidth = 1; rctx.beginPath();
  corners.forEach((c, i) => i ? rctx.lineTo(c.x * x, c.y * y) : rctx.moveTo(c.x * x, c.y * y));
  rctx.closePath(); rctx.stroke();
}

setInterval(() => {
  if (!world || !game) return;
  const k = keyboard;
  let dx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  let dy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
  if (touch.moving) { dx = touch.dx; dy = touch.dy; }
  const magnitude = Math.hypot(dx, dy);
  if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
  // Screen drive follows the screen, so it has to follow the camera when it rotates.
  if (input.driveMode === 'vector') [dx, dy] = renderer.screenToWorldVector(dx, dy);
  input.dx = dx; input.dy = dy;
  const p = self();
  const target = aimTarget(p) || { x: 1200, y: 720 };
  send({ type: 'input', ...input, targetX: target.x, targetY: target.y, fire: input.fire || k.has('Space'), mine: k.has('KeyF') || !!input.secondary });
}, 50);
requestAnimationFrame(render);
