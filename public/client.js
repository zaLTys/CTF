const $ = id => document.getElementById(id);
const canvas = $('battle'), ctx = canvas.getContext('2d');
const radar = $('radar'), rctx = radar.getContext('2d');
const lobby = $('lobby'), hud = $('hud');
let ws, world, game, previous, selfId, selfTeam, code, receivedAt = 0;
let vw = 1, vh = 1, dpr = 1, zoom = 1, camera = { x: 1200, y: 720 };
let background, lastToast = 0, mouseWorld = null, touchRange = 650;
const sprites = {};
for (const team of ['blue', 'red']) for (const type of ['tank','tank-hull','tank-turret','jeep','heli','asv','arty','fpv','drone']) {
  const img = new Image(); img.src = `/assets/${team}-${type}.svg`; sprites[`${team}-${type}`] = img;
}
const keyboard = new Set();
const input = { dx: 0, dy: 0, aim: 0, fire: false, driveMode: 'classic' };
let lastModeChange = 0;
const touch = { moving: false, aiming: false, dx: 0, dy: 0 };
const colors = { blue: '#68c8db', red: '#f17f6c' };
const rgb = { blue: '#1f6a7e', red: '#a7463e' };
const params = new URLSearchParams(location.search);

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  zoom = (matchMedia('(pointer: coarse)').matches ? (vw < 600 ? .65 : .78) : 0.93);
  if (vh < 640) zoom *= .87;
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
      world = data.world; selfId = data.id; selfTeam = data.team; code = data.code; input.aim=selfTeam==='blue'?0:Math.PI;
      lobby.classList.add('hidden'); hud.classList.remove('hidden');
      $('roomLabel').textContent = `ROOM ${code} · ${world.mapName}`;
      history.replaceState(null, '', `?room=${encodeURIComponent(code)}`);
      background = buildBackground();
      toast(`${world.mapName} · ${selfTeam.toUpperCase()} TEAM — ${selfTeam === 'blue' ? 'LEFT' : 'RIGHT'} BASE`);
    }
    if (data.type === 'state') {
      previous = game;
      game = data;
      receivedAt = performance.now();
      updateHud();
    }
  };
}
connect();
$('createBtn').onclick = () => { if (ws?.readyState === WebSocket.OPEN) send({ type: 'create', mapId:$('mapSelect').value }); };
$('joinBtn').onclick = () => { if (ws?.readyState === WebSocket.OPEN) send({ type: 'join', code: $('roomCode').value.trim().toUpperCase() }); };
$('roomCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
$('copyLink').onclick = async () => {
  const url = `${location.origin}/?room=${code}`;
  try { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
  catch { prompt('Copy room link:', url); }
};
for (const btn of document.querySelectorAll('[data-vehicle]')) {
  btn.onclick = () => chooseVehicle(btn.dataset.vehicle);
}
function chooseVehicle(type) {
  const p = self();
  if (!p?.alive) return toast('Respawn before switching vehicles');
  const base = world.bases[selfTeam];
  if (Math.hypot(p.x - base.x, p.y - base.y) > 155) return toast('Return to your base to change vehicles');
  send({ type: 'vehicle', vehicle: type });
}
const vehicleKeys = { 'Digit1': 'jeep', 'Digit2': 'tank', 'Digit3': 'heli', 'Digit4': 'asv', 'Digit5': 'arty', 'Digit6': 'fpv' };
window.addEventListener('keydown', e => {
  if (document.activeElement === $('roomCode')) return;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  keyboard.add(e.code);
  if (vehicleKeys[e.code] && !e.repeat) chooseVehicle(vehicleKeys[e.code]);
  if (e.code === 'KeyC' && !e.repeat && world) { input.driveMode=input.driveMode==='classic'?'vector':'classic'; toast(input.driveMode==='classic'?'HULL DRIVE: WASD FOLLOWS THE VEHICLE NOSE':'SCREEN DRIVE: WASD POINTS ALONG THE MAP'); }
});
window.addEventListener('keyup', e => keyboard.delete(e.code));
window.addEventListener('blur', () => { keyboard.clear(); input.fire = false; touch.moving = false; touch.aiming = false; });
function screenToWorld(x, y) {
  return { x: (x - vw / 2) / zoom + camera.x, y: (y - vh / 2) / zoom + camera.y };
}
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch' || !world) return;
  mouseWorld = screenToWorld(e.clientX, e.clientY);
  const p = self(); if (!p) return;
  const origin = game?.drones?.find(d => d.ownerId === selfId) || p;
  const aim = Math.atan2(mouseWorld.y - origin.y, mouseWorld.x - origin.x);
  if (Number.isFinite(aim)) input.aim = aim;
});
canvas.addEventListener('pointerdown', e => {
  if (!world || e.pointerType === 'touch') return;
  mouseWorld = screenToWorld(e.clientX, e.clientY);
  input.fire = true;
});
window.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') input.fire = false; });
window.addEventListener('pointercancel', () => input.fire = false);
const action = $('actionButton');
if (action) {
  action.addEventListener('pointerdown', e => { e.preventDefault(); action.setPointerCapture(e.pointerId); input.fire = true; });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) action.addEventListener(event, () => { input.fire = false; });
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
  if (touch.aiming) input.aim = Math.atan2(dy, dx);
  // Artillery and FPV use the separate FIRE button, so aiming never triggers an accidental strike.
  if (!['arty','fpv'].includes(self()?.type)) input.fire = touch.aiming;
  touchRange = 145 + magnitude * 820;
}, () => { touch.aiming = false; if (!['arty','fpv'].includes(self()?.type)) input.fire = false; });
function self() { return game?.players.find(p => p.id === selfId); }
function updateHud() {
  if (!game || !world) return;
  $('blueScore').textContent = game.scores.blue;
  $('redScore').textContent = game.scores.red;
  const p = self(); if (!p) return;
  const t = world.types[p.type];
  const remoteDrone = game.drones?.find(d => d.ownerId === selfId);
  $('actionButton').textContent = p.type === 'fpv' ? (remoteDrone ? 'DETONATE' : 'LAUNCH') : p.type === 'arty' ? 'STRIKE' : 'FIRE';
  $('unitStatus').textContent = p.type === 'fpv' ? (remoteDrone ? `DRONE LIVE · ${Math.ceil((remoteDrone.expiresAt - game.time)/1000)}s` : 'READY TO LAUNCH · 8s FLIGHT') : p.type === 'arty' ? 'INDIRECT FIRE · 1.2s IMPACT' : p.type === 'jeep' ? 'ONLY VEHICLE THAT CAN CAPTURE A FLAG' : 'RETURN TO BASE FOR REPAIR + RESUPPLY';
  const speed=Math.round(Math.hypot(p.vx||0,p.vy||0));
  $('physicsStatus').textContent=`${world.mapName} · ${p.type==='heli'?'AIRBORNE':(p.surface||'GRASS').toUpperCase()} · SPEED ${speed} · ${input.driveMode==='classic'?'HULL':'SCREEN'} DRIVE`;
  $('vehicleName').textContent = t.label.toUpperCase();
  for (const [name, max, curr] of [['hp',t.hp,p.hp],['ammo',t.ammo,p.ammo],['fuel',t.fuel,p.fuel]]) {
    const pct = Math.max(0, Math.round(curr / max * 100));
    $(`${name}Bar`).style.width = `${pct}%`;
    $(`${name}Value`).textContent = `${pct}%`;
  }
  document.querySelectorAll('[data-vehicle]').forEach(b => b.classList.toggle('selected', b.dataset.vehicle === p.type));
  const banner = $('banner');
  if (game.announcement) { banner.textContent = game.announcement; banner.classList.remove('hidden'); }
  else if (!p.alive) { banner.textContent = 'VEHICLE DESTROYED — RESPAWNING'; banner.classList.remove('hidden'); }
  else banner.classList.add('hidden');
}
function rand(seed) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; }
function rect(x,y,w,h,fill) { ctx.fillStyle=fill;ctx.fillRect(x,y,w,h); }
function poly(points, color) { ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(const p of points.slice(1))ctx.lineTo(p[0],p[1]);ctx.closePath();ctx.fillStyle=color;ctx.fill(); }
// All terrain and effects are procedurally drawn; vehicle sprites are original local SVGs.
function buildBackground() {
  const b = document.createElement('canvas'); b.width = world.width; b.height = world.height;
  const g = b.getContext('2d'), rnd = rand(7201995);
  g.fillStyle = world.biome==='arid' ? '#97846a' : world.biome==='wetlands' ? '#728d72' : '#7e8c64'; g.fillRect(0, 0, b.width, b.height);
  // Organic grassland and arid patches instead of a flat repeated texture.
  for (let i = 0; i < 2200; i++) {
    const x=rnd()*b.width, y=rnd()*b.height, r=3+rnd()*39;
    const palette=world.biome==='arid'?['#a98a6a','#caab83','#776b52','#aa9574','#9d795e']:world.biome==='wetlands'?['#45684e','#90ab79','#779978','#395e4e','#9cba88']:['#657b55','#9ba379','#a79d75','#586f53','#98a17a'];
    g.fillStyle = palette[Math.floor(rnd()*5)]+'45';
    g.beginPath();g.ellipse(x,y,r,r*(.25+rnd()*.6),rnd()*6.28,0,Math.PI*2);g.fill();
  }
  for (let i=0;i<4200;i++) {
    const x=rnd()*b.width,y=rnd()*b.height;
    g.fillStyle=rnd()>.55?'#d0bd8641':'#2e4a3354';
    g.fillRect(x,y,1+rnd()*4,1+rnd()*3);
  }
  // Territory boundaries are subtle and the map retains wide traversable lanes.
  g.fillStyle='#64add008';g.fillRect(0,0,510,b.height);
  g.fillStyle='#ef866108';g.fillRect(1890,0,510,b.height);
  for (let i=0;i<64;i++) {
    const x=rnd()*b.width,y=rnd()*b.height;
    const r=12+rnd()*55;
    g.fillStyle='#b4a6781c';g.beginPath();g.ellipse(x,y,r,r*.55,rnd()*7,0,Math.PI*2);g.fill();
  }
  // Mud is a physics surface, not just scenery: tires lose traction and top speed.
  for(const m of world.mud||[]){
    g.save();g.translate(m.x,m.y);g.rotate(.08);
    g.fillStyle='#665c3f8c';g.beginPath();g.ellipse(0,0,m.rx,m.ry,0,0,6.283);g.fill();
    g.fillStyle='#483f3042';
    for(let j=0;j<90;j++){const a=rnd()*6.283,rd=Math.sqrt(rnd());g.beginPath();g.ellipse(Math.cos(a)*m.rx*rd,Math.sin(a)*m.ry*rd,3+rnd()*9,1+rnd()*4,a,0,6.283);g.fill();}
    g.restore();
  }
  // Roads are map geometry; rendering matches the server's road-traction zones.
  for(const road of world.roads||[]){
    const horizontal=road.w>=road.h;
    g.fillStyle='#303e38';g.fillRect(road.x-5,road.y-5,road.w+10,road.h+10);
    g.fillStyle=world.biome==='arid'?'#706b57':'#59645a';g.fillRect(road.x,road.y,road.w,road.h);
    g.fillStyle='#87917f';
    if(horizontal){
      g.fillRect(road.x,road.y+6,road.w,3);g.fillRect(road.x,road.y+road.h-9,road.w,3);
      g.fillStyle='#cfc4a18b';for(let x=road.x+25;x<road.x+road.w;x+=120)g.fillRect(x,road.y+road.h/2-2,55,4);
    }else{
      g.fillRect(road.x+5,road.y,3,road.h);g.fillRect(road.x+road.w-8,road.y,3,road.h);
      g.fillStyle='#cfc4a18b';for(let y=road.y+25;y<road.y+road.h;y+=100)g.fillRect(road.x+road.w/2-2,y,4,41);
    }
  }
  // Water channels have depth, banks, foam and reeds.
  for(const w of world.water){
    g.fillStyle='#65735e';g.fillRect(w.x-18,w.y-18,w.w+36,w.h+36);
    g.fillStyle='#b8aa78';g.fillRect(w.x-9,w.y-9,w.w+18,w.h+18);
    const grad=g.createLinearGradient(w.x,0,w.x+w.w,0);
    grad.addColorStop(0,'#3f7e7c');grad.addColorStop(.25,'#235962');grad.addColorStop(.75,'#275c67');grad.addColorStop(1,'#5a9084');
    g.fillStyle=grad;g.fillRect(w.x,w.y,w.w,w.h);
    for(let i=0;i<160;i++){
      const x=w.x+rnd()*w.w, y=Math.max(0,w.y)+rnd()*w.h;
      g.strokeStyle=rnd()>.5?'#c5dbca32':'#244b5e73';g.lineWidth=1+rnd()*3;
      g.beginPath();g.moveTo(x,y);g.lineTo(x+10+rnd()*35,y-rnd()*3);g.stroke();
    }
    g.fillStyle='#c8c6a5';g.fillRect(w.x-3,Math.max(w.y,0),3,w.h);g.fillRect(w.x+w.w,Math.max(w.y,0),3,w.h);
  }
  // Utility outposts and home bases, drawn once.
  for(const [team,base] of Object.entries(world.bases)){
    g.save();g.translate(base.x,base.y);
    const ac=team==='blue'?'#5fcce0':'#ec8e6f';
    g.fillStyle='#24322a88';g.fillRect(-171,-143,356,300);
    g.fillStyle='#343d34';g.fillRect(-169,-150,338,300);
    g.fillStyle='#586452';g.fillRect(-155,-137,310,274);
    g.strokeStyle='#a7aa87';g.lineWidth=5;g.strokeRect(-155,-137,310,274);
    // Fuel pads and garages sit behind the central command plaza.
    for(const y of [-98,99]){
      g.fillStyle='#27392e';g.fillRect(-126,y-22,70,44);g.strokeStyle='#7b927f';g.lineWidth=3;g.strokeRect(-126,y-22,70,44);
      for(let x=-112;x<-62;x+=13){g.fillStyle='#9ead8a';g.fillRect(x,y-15,4,30);}
      g.fillStyle='#acac83';g.fillRect(68,y-19,69,38);
      g.fillStyle='#415d51';for(let x=73;x<135;x+=20){g.fillRect(x,y-13,13,28);}
    }
    g.fillStyle='#182f2c';g.fillRect(-57,-64,114,128);
    g.fillStyle=team==='blue'?'#35616c':'#724a42';g.fillRect(-50,-57,100,114);
    g.fillStyle='#93a49a';g.fillRect(-40,-47,80,94);
    g.fillStyle='#253d37';g.fillRect(-32,-39,64,78);
    g.fillStyle=ac;g.fillRect(-28,-35,56,5);
    g.strokeStyle='#e6e9c1';g.lineWidth=2;g.strokeRect(-34,-41,68,82);
    g.fillStyle=ac;g.font='900 21px system-ui';g.textAlign='center';g.fillText(team==='blue'?'B / HQ':'R / HQ',0,-83);
    g.fillStyle='#c9c49a';for(let x=-145;x<147;x+=30){g.fillRect(x,-146,12,5);g.fillRect(x,141,12,5);}
    g.restore();
  }
  // Small ground texture only: actual trees, bushes and boulders are server entities,
  // drawn separately so that every one can block, break, or leave a stump.
  for(let i=0;i<350;i++){
    const x=40+rnd()*(b.width-80),y=20+rnd()*(b.height-40),size=2+rnd()*5;
    if(Math.abs(y-720)<113)continue;
    g.fillStyle=rnd()>.5?'#324c324f':'#cab38351';
    g.beginPath();g.ellipse(x,y,size*1.7,size*.55,rnd()*3,0,6.283);g.fill();
  }
  g.strokeStyle='#1a3a2a82';g.lineWidth=12;g.strokeRect(5,5,b.width-10,b.height-10);
  return b;
}
function drawFlag(flag, team, time){
  ctx.save();ctx.translate(flag.x,flag.y);
  const wave=Math.sin(time/155)*5;
  ctx.fillStyle='#1428218b';ctx.beginPath();ctx.ellipse(7,11,18,7,0,0,6.283);ctx.fill();
  ctx.strokeStyle='#e7e7bf';ctx.lineWidth=3.8;ctx.beginPath();ctx.moveTo(0,7);ctx.lineTo(0,-44);ctx.stroke();
  poly([[0,-43],[29,-39+wave],[24,-18+wave],[0,-23]],colors[team]);
  ctx.strokeStyle='#f6f2d5';ctx.lineWidth=1.5;ctx.stroke();
  ctx.restore();
}
function drawBridge(b,time){
  const stage=b.stage??(b.hp>0?0:3),cX=b.x+b.w/2,cY=b.y+b.h/2;
  const whole=stage<3;
  ctx.save();
  // Steel pillars and abutments remain even when the bridge span falls into the river.
  ctx.fillStyle='#313b38';
  for(const x of [b.x+11,b.x+b.w-30]){
    rect(x,b.y-14,19,b.h+28,'#252f31');
    rect(x+4,b.y-11,11,b.h+22,'#8e9181');
  }
  if(whole){
    rect(b.x+12,b.y+8,b.w-24,b.h-16,'#2a3735');
    rect(b.x+19,b.y+13,b.w-38,b.h-26,stage===0?'#77796c':stage===1?'#62665e':'#494d48');
    // Plank seams, center lane and guard rail. Cracks grow through three damage states.
    for(let x=b.x+23;x<b.x+b.w-22;x+=20){
      rect(x,b.y+15,2,b.h-30,stage===0?'#565e57':'#353c38');
    }
    ctx.strokeStyle='#d7d4b3a0';ctx.lineWidth=2;ctx.setLineDash([20,16]);
    ctx.beginPath();ctx.moveTo(b.x+20,cY);ctx.lineTo(b.x+b.w-20,cY);ctx.stroke();ctx.setLineDash([]);
    for(const y of [b.y+5,b.y+b.h-7]){rect(b.x+13,y,b.w-26,4,'#c3c0a1');}
    if(stage>=1){
      ctx.strokeStyle='#242c2c';ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(cX-58,b.y+15);ctx.lineTo(cX-25,cY+6);ctx.lineTo(cX+11,cY-10);ctx.stroke();
    }
    if(stage>=2){
      rect(cX-27,cY-19,61,32,'#142e31');
      ctx.strokeStyle='#b3ad8e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cX-31,cY-19);ctx.lineTo(cX+32,cY+17);ctx.stroke();
      for(let j=0;j<3;j++)rect(cX+50+j*29,b.y+16+(j%2)*15,15,13,'#263333');
    }
  } else {
    // Entire center deck collapses. River stays visible and non-traversable.
    ctx.fillStyle='#333b39b8';rect(b.x+10,b.y+12,52,b.h-24,'#454943');
    rect(b.x+b.w-62,b.y+12,52,b.h-24,'#454943');
    ctx.fillStyle='#9c9b83';
    for(let i=0;i<7;i++){
      const a=i*2.4,px=cX+Math.cos(a)*(35+i*15),py=cY+Math.sin(a)*(17+i*4);
      ctx.save();ctx.translate(px,py);ctx.rotate(a);
      rect(-14,-4,29,9,i%2?'#5d655d':'#7e806c');ctx.restore();
    }
    ctx.strokeStyle='#d6b89490';ctx.lineWidth=4;ctx.setLineDash([9,10]);
    ctx.beginPath();ctx.moveTo(b.x+65,cY);ctx.lineTo(b.x+b.w-65,cY);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.fillStyle=whole?'#e0ddbb':'#f3ae86';ctx.font='900 12px system-ui';ctx.textAlign='center';
  ctx.fillText(whole?b.name:'BRIDGE DOWN',cX,b.y-17);
  ctx.restore();
}
function drawObstacle(c){
  const hp=c.hp/c.maxHp;
  if(c.kind==='crate'){
    ctx.save();ctx.translate(c.x,c.y);
    if(hp<=0){
      rect(2,5,c.w-3,c.h-4,'#241f18a5');
      ctx.strokeStyle='#8d8163';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(3,3);ctx.lineTo(c.w-7,c.h-5);ctx.moveTo(c.w-6,3);ctx.lineTo(5,c.h-6);ctx.stroke();
    } else {
      rect(4,6,c.w,c.h,'#1c291f85');rect(0,0,c.w,c.h,'#746e4c');
      ctx.strokeStyle='#c4b78b';ctx.lineWidth=3;ctx.strokeRect(3,3,c.w-6,c.h-6);
      ctx.beginPath();ctx.moveTo(5,5);ctx.lineTo(c.w-5,c.h-5);ctx.moveTo(c.w-5,5);ctx.lineTo(5,c.h-5);ctx.stroke();
      rect(c.w*.42,0,6,c.h,'#424637c4');
    }
    ctx.restore();return;
  }
  if(c.kind==='building'){
    ctx.save();
    rect(c.x+8,c.y+9,c.w,c.h,'#16261f90');
    rect(c.x,c.y,c.w,c.h,'#343c37');
    if(hp>0){
      rect(c.x+5,c.y+5,c.w-10,c.h-10,'#807e6b');
      // Progressive roof loss reveals blackened floors and crossbeams.
      rect(c.x+13,c.y+12,c.w-26,c.h-24,hp>.67?'#677c71':hp>.34?'#48584d':'#222b29');
      if(hp>.34){
        for(let x=c.x+18;x<c.x+c.w-20;x+=23)rect(x,c.y+13,6,c.h-26,'#9d9e82');
      }else{
        for(let i=0;i<4;i++){
          ctx.save();ctx.translate(c.x+16+i*24,c.y+20+i%2*12);ctx.rotate(i*.7);
          rect(0,0,44,7,'#898474');ctx.restore();
        }
      }
      if(hp<.68){
        ctx.strokeStyle='#1f2c29';ctx.lineWidth=5;
        ctx.beginPath();ctx.moveTo(c.x+7,c.y+22);ctx.lineTo(c.x+c.w*.48,c.y+c.h*.53);ctx.lineTo(c.x+c.w*.37,c.y+c.h-12);ctx.stroke();
      }
      if(hp<.34){rect(c.x+c.w*.38,c.y+c.h*.24,c.w*.27,c.h*.35,'#101c1b');}
    }else{
      rect(c.x+4,c.y+4,c.w-8,c.h-8,'#3b4136');
      for(let i=0;i<11;i++)rect(c.x+6+(i*31)%(c.w-20),c.y+6+(i*17)%(c.h-20),12,8,i%3?'#8e8c79':'#5e695d');
      ctx.strokeStyle='#afa98b';ctx.lineWidth=4;ctx.strokeRect(c.x+4,c.y+4,c.w-8,c.h-8);
    }
    ctx.restore();return;
  }
  if(hp<=0){
    ctx.fillStyle='#1728237a';ctx.fillRect(c.x+7,c.y+7,c.w-8,c.h-8);
    ctx.strokeStyle='#bca984b5';ctx.lineWidth=3;ctx.strokeRect(c.x+2,c.y+2,c.w-4,c.h-4);
    for(let i=0;i<7;i++){ctx.fillStyle=i%2?'#606759':'#82876b';ctx.fillRect(c.x+10+(i*17)%(c.w-20),c.y+10+(i*27)%(c.h-20),9,7);}
    return;
  }
  ctx.fillStyle='#18281e88';ctx.fillRect(c.x+10,c.y+12,c.w,c.h);
  ctx.fillStyle='#2c3930';ctx.fillRect(c.x,c.y,c.w,c.h);
  ctx.fillStyle='#748071';ctx.fillRect(c.x+6,c.y+4,c.w-12,c.h-11);
  ctx.fillStyle='#46594e';ctx.fillRect(c.x+13,c.y+12,c.w-26,c.h-28);
  ctx.fillStyle='#9bad8a';ctx.fillRect(c.x+15,c.y+14,c.w-30,5);
  ctx.strokeStyle='#b4bd9d';ctx.lineWidth=2;ctx.strokeRect(c.x+8,c.y+6,c.w-16,c.h-16);
  ctx.strokeStyle='#2a3a30a8';ctx.lineWidth=2;
  for(let x=c.x+27;x<c.x+c.w-15;x+=23){ctx.beginPath();ctx.moveTo(x,c.y+28);ctx.lineTo(x,c.y+c.h-21);ctx.stroke();}
  if(hp<.67){ctx.strokeStyle='#1d2d20';ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(c.x+13,c.y+13);ctx.lineTo(c.x+c.w*.56,c.y+c.h*.47);ctx.lineTo(c.x+c.w*.39,c.y+c.h-10);ctx.stroke();}
  if(hp<.35){
    ctx.fillStyle='#191e1ba8';ctx.fillRect(c.x+20,c.y+20,c.w-40,c.h-40);
    ctx.strokeStyle='#a9a28b';ctx.lineWidth=5;ctx.beginPath();
    ctx.moveTo(c.x+10,c.y+c.h-12);ctx.lineTo(c.x+c.w-12,c.y+16);ctx.stroke();
  }
}
function drawScenery(o,time){
  const r=o.radius;
  ctx.save();ctx.translate(o.x,o.y);
  const phase=(o.id*19%43)*.028;
  if(o.kind==='rock'){
    ctx.fillStyle='#16271b83';ctx.beginPath();ctx.ellipse(5,9,r*1.2,r*.8,-.2,0,6.283);ctx.fill();
    poly([[-r*.9,r*.15],[-r*.7,-r*.7],[-r*.18,-r*.98],[r*.7,-r*.64],[r,r*.22],[r*.22,r*.84]],'#69756b');
    poly([[-r*.7,-r*.7],[-r*.18,-r*.98],[r*.7,-r*.64],[r*.16,-r*.05]],'#a8a98e');
    ctx.restore();return;
  }
  if(o.hp<=0){
    ctx.fillStyle='#1d2e2196';ctx.beginPath();ctx.ellipse(7,7,r*.92,r*.53,.3,0,6.283);ctx.fill();
    if(o.kind==='tree'){
      ctx.save();ctx.rotate(o.rot*.0174533);
      rect(-r*.24,-r*.29,r*.48,r*.65,'#705438');
      rect(-r*.15,-r*.18,r*.30,r*.34,'#b8a075');
      ctx.strokeStyle='#493d2b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r*.19,0,6.283);ctx.stroke();
      ctx.restore();
    } else circleCanvas(0,0,r*.35,'#42452e');
    ctx.restore();return;
  }
  ctx.fillStyle='#102b1b83';ctx.beginPath();ctx.ellipse(6,9,r*1.35,r*.73,.24,0,6.283);ctx.fill();
  if(o.kind==='bush'){
    for(let i=0;i<5;i++){
      const a=i*6.283/5+phase;
      circleCanvas(Math.cos(a)*r*.45,Math.sin(a)*r*.42,r*.65,i%2?'#47633b':'#688048');
    }
    circleCanvas(0,0,r*.45,'#839361');
  }else{
    // Mixed palm and broadleaf canopies: damage affects visible foliage.
    rect(-r*.23,-r*.23,r*.46,r*.75,'#6e5135');
    const canopy=r*(.62+.38*Math.max(.2,o.hp/o.maxHp));
    if(o.id%5===0){
      ctx.save();ctx.rotate(phase);
      for(let i=0;i<7;i++){
        const a=i*6.283/7;
        ctx.save();ctx.rotate(a);
        poly([[0,-3],[canopy*.57,-7],[canopy*1.55,-1],[canopy*.57,7],[0,3]],['#507c42','#72965a','#315f3b'][i%3]);
        ctx.strokeStyle='#b7b58c6d';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(canopy*1.2,0);ctx.stroke();
        ctx.restore();
      }
      circleCanvas(0,0,r*.18,'#b29b62');ctx.restore();
    }else{
      for(let i=0;i<8;i++){
        const a=i*6.283/8+phase;
        const scale=i%3===0?.75:1;
        circleCanvas(Math.cos(a)*r*.5,Math.sin(a)*r*.53,canopy*scale,['#355733','#3e693f','#588249','#436939'][i%4]);
      }
      circleCanvas(-r*.13,-r*.13,r*.7,'#6a8b4a');
      circleCanvas(-r*.31,-r*.3,r*.32,'#8ba566');
      circleCanvas(r*.27,r*.12,r*.25,'#2d5933');
    }
    if(o.hp/o.maxHp<.55){ctx.strokeStyle='#c9b48a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-r*.2,-r*.35);ctx.lineTo(r*.16,r*.3);ctx.stroke();}
  }
  ctx.restore();
}
function drawTrail(t,now){
  const life=Math.max(0,1-(game.time-t.bornAt)/12500);
  ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.angle);
  ctx.globalAlpha=life*.3;
  if(t.type==='fall'){
    ctx.globalAlpha=life*.48;
    rect(-5,-4,43,9,'#3f3827');
    circleCanvas(30,0,6,'#785e3f');
  } else {
    ctx.fillStyle=t.type==='skid'?'#1b291b':'#2a3329';
    ctx.fillRect(-16,-17,33,3);ctx.fillRect(-16,14,33,3);
    if(t.type==='skid'){ctx.fillRect(-23,-19,23,2);ctx.fillRect(-23,16,23,2);}
  }
  ctx.restore();
}
function drawTurret(t){
  ctx.save();ctx.translate(t.x,t.y);
  ctx.fillStyle='#1a2924a8';ctx.fillRect(-24,-22,55,55);
  ctx.fillStyle=t.hp>0?'#293a33':'#383c34';ctx.fillRect(-25,-25,50,50);
  ctx.strokeStyle=t.hp>0?colors[t.team]:'#8d8a7a';ctx.lineWidth=3;ctx.strokeRect(-23,-23,46,46);
  ctx.fillStyle='#819380';for(const x of [-18,18])for(const y of [-18,18])ctx.fillRect(x-2,y-2,4,4);
  if(t.hp>0){ctx.rotate(t.angle);rect(0,-5,36,10,'#1b3027');rect(19,-3,21,6,'#d1d3b1');
    ctx.fillStyle='#526b5a';ctx.beginPath();ctx.arc(0,0,16,0,6.283);ctx.fill();
    ctx.strokeStyle='#c3c9a4';ctx.lineWidth=2;ctx.stroke();circleCanvas(0,0,7,'#283b31');}
  else{ctx.strokeStyle='#212820';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-12,-10);ctx.lineTo(10,12);ctx.moveTo(12,-10);ctx.lineTo(-10,12);ctx.stroke();}
  ctx.restore();
}
function circleCanvas(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function drawWreck(w,time){
  ctx.save();ctx.translate(w.x,w.y);ctx.rotate(w.angle||0);
  const intact=w.hp>0,sz={tank:82,jeep:68,heli:96,asv:84,arty:88,fpv:78}[w.type]??78;
  ctx.fillStyle='#101d19a5';ctx.beginPath();ctx.ellipse(5,11,sz*.48,sz*.35,0,0,Math.PI*2);ctx.fill();
  const sprite=sprites[`${w.team}-${w.type==='tank'?'tank-hull':w.type}`];
  ctx.filter='grayscale(1) brightness(.35) sepia(.3)';
  if(sprite?.complete&&sprite.naturalWidth)ctx.drawImage(sprite,-sz/2,-sz/2,sz,sz);
  else rect(-sz*.4,-sz*.25,sz*.8,sz*.5,'#3d433e');
  ctx.filter='none';
  ctx.strokeStyle='#b0a07a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-14,-15);ctx.lineTo(10,9);ctx.lineTo(18,-3);ctx.stroke();
  for(let i=0;i<5;i++)rect(-sz*.35+i*11,sz*.15+(i%2)*5,8,5,i%2?'#777363':'#232e2d');
  if(intact){
    const blink=(Math.sin(time/235+w.x)*.5+.5);
    circleCanvas(-6,5,5+blink*5,`rgba(241,114,40,${.56+blink*.2})`);
  }
  ctx.restore();
  if(w.hp>0){
    const age=Math.max(0,(game.time-w.bornAt)/1000),rise=(time*.015+w.x*.04)%24;
    circleCanvas(w.x+Math.sin(time/450+w.x)*8,w.y-22-rise,10+rise*.42,'#2a332c4a');
  }
}
function drawVehicle(p,me,time){
  if(!p.alive)return;
  const teamColor=colors[p.team];
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='#0e281da9';ctx.beginPath();ctx.ellipse(5,12,p.type==='heli'?43:33,22,0,0,Math.PI*2);ctx.fill();
  const sizes={tank:91,jeep:80,heli:106,asv:94,arty:97,fpv:90};
  const size=sizes[p.type]??90, bodyAngle=Number.isFinite(p.bodyAngle)?p.bodyAngle:p.angle;
  ctx.rotate(bodyAngle);
  const hull=sprites[`${p.team}-${p.type==='tank'?'tank-hull':p.type}`];
  if(hull?.complete && hull.naturalWidth)ctx.drawImage(hull,-size/2,-size/2,size,size);
  else{rect(-23,-17,46,34,teamColor);rect(0,-4,32,8,'#263b32');}
  if(p.type==='heli'){
    ctx.save();ctx.rotate(time/67);ctx.globalAlpha=.53;
    ctx.strokeStyle='#d8e2c8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-47,0);ctx.lineTo(47,0);ctx.moveTo(0,-45);ctx.lineTo(0,45);ctx.stroke();ctx.restore();
  }
  if(p.type==='tank'){
    ctx.rotate(p.angle-bodyAngle);
    const gun=sprites[`${p.team}-tank-turret`];
    if(gun?.complete&&gun.naturalWidth)ctx.drawImage(gun,-size/2,-size/2,size,size);
  }
  ctx.restore();
  if(me){ctx.strokeStyle='#eef6c8a9';ctx.lineWidth=1.5;ctx.setLineDash([9,8]);ctx.beginPath();ctx.arc(p.x,p.y,46,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
  rect(p.x-27,p.y-52,54,6,'#162922da');
  rect(p.x-26,p.y-51,52*Math.max(0,p.hp/world.types[p.type].hp),4,teamColor);
  ctx.fillStyle=me?'#efffc5':teamColor;ctx.font='900 11px system-ui';ctx.textAlign='center';
  ctx.fillText(me?'YOU':'ENEMY',p.x,p.y-61);
}
function drawDrone(d,time){
  ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.angle);
  ctx.fillStyle='#0a251e66';ctx.beginPath();ctx.ellipse(5,13,14,6,0,0,6.283);ctx.fill();
  const sprite=sprites[`${d.team}-drone`];
  if(sprite?.complete&&sprite.naturalWidth)ctx.drawImage(sprite,-28,-28,56,56);
  else circleCanvas(0,0,9,colors[d.team]);
  ctx.restore();
  ctx.strokeStyle=colors[d.team]+'b0';ctx.lineWidth=1;ctx.beginPath();ctx.arc(d.x,d.y,23+Math.sin(time/140)*3,0,Math.PI*2);ctx.stroke();
}
function drawTarget(p,time){
  if(p.type!=='arty'||!p.alive)return;
  let targetX,targetY;
  if(matchMedia('(pointer: coarse)').matches){targetX=p.x+Math.cos(input.aim)*touchRange;targetY=p.y+Math.sin(input.aim)*touchRange;}
  else if(mouseWorld){targetX=mouseWorld.x;targetY=mouseWorld.y;}
  else{targetX=p.x+Math.cos(input.aim)*500;targetY=p.y+Math.sin(input.aim)*500;}
  const d=Math.hypot(targetX-p.x,targetY-p.y);
  const valid=d>=145&&d<=world.types.arty.range;
  const color=valid?'#f4d48a':'#e98777';
  ctx.strokeStyle=color+'b0';ctx.lineWidth=1.8;ctx.setLineDash([7,9]);
  ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(targetX,targetY);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle=color;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(targetX,targetY,world.types.arty.blastRadius,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(targetX,targetY,17+Math.sin(time/150)*3,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(targetX-31,targetY);ctx.lineTo(targetX+31,targetY);ctx.moveTo(targetX,targetY-31);ctx.lineTo(targetX,targetY+31);ctx.stroke();
  ctx.fillStyle=color;ctx.font='900 12px system-ui';ctx.textAlign='center';ctx.fillText(valid?'FIRE MISSION · 1.2s':'OUT OF RANGE',targetX,targetY-133);
}
function drawStrike(s,time){
  const remaining=Math.max(0,s.impactAt-game.time),pulse=1+Math.sin(time/90)*.05;
  ctx.strokeStyle='#ffd58b';ctx.lineWidth=3;ctx.setLineDash([7,7]);
  ctx.beginPath();ctx.arc(s.x,s.y,s.radius*pulse,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  circleCanvas(s.x,s.y,5,'#f4d58d');
  ctx.font='900 12px system-ui';ctx.fillStyle='#fff0b8';ctx.textAlign='center';ctx.fillText(`INCOMING · ${(remaining/1000).toFixed(1)}s`,s.x,s.y-s.radius-12);
}
function drawExplosion(e,time){
  const duration=e.until-e.bornAt,progress=Math.max(0,Math.min(1,(game.time-e.bornAt)/Math.max(1,duration)));
  const s=e.scale||1;
  const radius=(14+progress*66)*s;
  const gl=ctx.createRadialGradient(e.x,e.y,1,e.x,e.y,radius);
  gl.addColorStop(0,`rgba(255,244,182,${.9*(1-progress)})`);
  gl.addColorStop(.27,`rgba(255,163,63,${.78*(1-progress)})`);
  gl.addColorStop(.65,`rgba(171,72,40,${.56*(1-progress)})`);
  gl.addColorStop(1,'rgba(55,52,42,0)');
  circleCanvas(e.x,e.y,radius,gl);
  ctx.strokeStyle=`rgba(245,222,174,${.8*(1-progress)})`;ctx.lineWidth=5*(1-progress);
  ctx.beginPath();ctx.arc(e.x,e.y,radius*.65,0,6.283);ctx.stroke();
  for(let j=0;j<8;j++){
    const a=j*6.283/8+(e.x*.002),dist=(20+progress*75)*s;
    circleCanvas(e.x+Math.cos(a)*dist,e.y+Math.sin(a)*dist,(8+progress*13)*(1-progress)*s,`rgba(41,47,41,${.52*(1-progress)})`);
  }
}

function render(time) {
  requestAnimationFrame(render);
  if(!world||!game||!background)return;
  const p=self();if(!p)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,vw,vh);
  const lerp=(a,b,t)=>a+(b-a)*t;
  const clampValue=(v,lo,hi)=>hi<lo?(lo+hi)/2:Math.max(lo,Math.min(hi,v));
  const alpha=clampValue((time-receivedAt)/50,0,1);
  const prev=previous?.players.find(old=>old.id===selfId);
  const drone=game.drones?.find(d=>d.ownerId===selfId);
  const playerX=prev&&prev.alive&&p.alive?lerp(prev.x,p.x,alpha):p.x;
  const playerY=prev&&prev.alive&&p.alive?lerp(prev.y,p.y,alpha):p.y;
  const focusX=drone?.x??playerX,focusY=drone?.y??playerY;
  const halfW=vw/(zoom*2),halfH=vh/(zoom*2);
  camera.x=clampValue(focusX,halfW,world.width-halfW);camera.y=clampValue(focusY,halfH,world.height-halfH);
  ctx.save();ctx.translate(vw/2-camera.x*zoom,vh/2-camera.y*zoom);ctx.scale(zoom,zoom);
  ctx.drawImage(background,0,0);
  for(const c of game.craters??[]){
    ctx.fillStyle='#1c2f257a';ctx.beginPath();ctx.ellipse(c.x+3,c.y+5,c.r*1.2,c.r*.85,0,0,6.283);ctx.fill();
    ctx.fillStyle='#25372bb8';ctx.beginPath();ctx.ellipse(c.x,c.y,c.r*.77,c.r*.6,0,0,6.283);ctx.fill();
    ctx.strokeStyle='#baa87896';ctx.lineWidth=4;ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,6.283);ctx.stroke();
  }
  for(const track of game.trails??[])drawTrail(track,time);
  for(const bridge of game.bridges??[])drawBridge(bridge,time);
  for(const c of game.obstacles??[])drawObstacle(c);
  for(const obj of game.scenery??[])drawScenery(obj,time);
  for(const w of game.wrecks??[])drawWreck(w,time);
  for(const t of game.turrets)drawTurret(t);
  for(const s of game.strikes??[])drawStrike(s,time);
  for(const team of ['blue','red'])drawFlag(game.flags[team],team,time);
  for(const bullet of game.bullets){
    const a=Math.atan2(bullet.vy??0,bullet.vx??1);
    ctx.save();ctx.translate(bullet.x,bullet.y);ctx.rotate(a);
    if(bullet.kind==='asv'){
      ctx.fillStyle='#f28a47aa';ctx.beginPath();ctx.moveTo(-31,0);ctx.lineTo(-7,-6);ctx.lineTo(-7,6);ctx.closePath();ctx.fill();
      circleCanvas(0,0,7,'#ffe1a3');circleCanvas(2,0,4,'#ffffff');
    } else {rect(-21,-2,25,4,'#fcbd7c98');circleCanvas(3,0,4,'#fff4c4');}
    ctx.restore();
  }
  for(const pl of game.players){
    const old=previous?.players.find(q=>q.id===pl.id);
    const d=(old&&old.alive&&pl.alive)?{...pl,x:lerp(old.x,pl.x,alpha),y:lerp(old.y,pl.y,alpha)}:pl;
    drawVehicle(d,pl.id===selfId,time);
  }
  for(const d of game.drones??[])drawDrone(d,time);
  if(p.type==='arty')drawTarget(p,time);
  for(const effect of game.explosions??[])drawExplosion(effect,time);
  ctx.restore();
  if(drone){
    // Lightweight overlay distinguishes drone camera mode from the operator's ground view.
    ctx.fillStyle='#172a211a';for(let y=0;y<vh;y+=7)ctx.fillRect(0,y,vw,1);
    ctx.strokeStyle='#a9e9be6b';ctx.lineWidth=1.5;
    ctx.strokeRect(25,76,vw-50,Math.max(20,vh-185));
    ctx.fillStyle='#ddf5c6';ctx.font='900 12px system-ui';ctx.textAlign='left';
    ctx.fillText(`FPV TELEMETRY  //  ${(Math.max(0,drone.expiresAt-Date.now())/1000).toFixed(1)}s BATTERY`,35,100);
    ctx.strokeStyle='#e9f0b69c';ctx.beginPath();ctx.moveTo(vw/2-19,vh/2);ctx.lineTo(vw/2+19,vh/2);ctx.moveTo(vw/2,vh/2-19);ctx.lineTo(vw/2,vh/2+19);ctx.stroke();
  }
  drawRadar();
  if(time-lastToast>2400)$('toast').classList.remove('visible');
}

function drawRadar(){
  const x=radar.width/world.width,y=radar.height/world.height;
  rctx.fillStyle='#182f2a';rctx.fillRect(0,0,radar.width,radar.height);
  rctx.fillStyle='#527f83';for(const w of world.water)rctx.fillRect(w.x*x,w.y*y,w.w*x,w.h*y);
  for(const b of game.bridges??[]){rctx.fillStyle=b.hp>0?'#c4be8e':'#6c4740';rctx.fillRect(b.x*x,b.y*y,b.w*x,b.h*y);}
  rctx.fillStyle='#7f9276';for(const c of game.obstacles??[])if(c.hp>0)rctx.fillRect(c.x*x,c.y*y,c.w*x,c.h*y);
  for(const o of game.scenery??[]){if(o.hp<=0)continue;rctx.fillStyle=o.kind==='rock'?'#9da797':'#335b38';rctx.fillRect(o.x*x-1,o.y*y-1,3,3);}
  for(const w of game.wrecks??[]){rctx.fillStyle=w.hp>0?'#e6a275':'#716459';rctx.fillRect(w.x*x-2,w.y*y-2,4,4);}
  for(const side of ['blue','red']){
    rctx.fillStyle=colors[side];const b=world.bases[side];rctx.fillRect(b.x*x-4,b.y*y-4,8,8);
    const f=game.flags[side];rctx.beginPath();rctx.arc(f.x*x,f.y*y,3,0,Math.PI*2);rctx.fill();
  }
  for(const t of game.turrets){if(t.hp<=0)continue;rctx.fillStyle=colors[t.team];rctx.fillRect(t.x*x-1,t.y*y-1,3,3);}
  for(const d of game.drones??[]){rctx.fillStyle=d.ownerId===selfId?'#fcfaab':colors[d.team];rctx.beginPath();rctx.arc(d.x*x,d.y*y,4,0,6.283);rctx.fill();}
  for(const s of game.strikes??[]){rctx.strokeStyle='#ffca72';rctx.beginPath();rctx.arc(s.x*x,s.y*y,5,0,6.283);rctx.stroke();}
  for(const p of game.players){if(!p.alive)continue;rctx.fillStyle=p.id===selfId?'#ffffff':colors[p.team];rctx.beginPath();rctx.arc(p.x*x,p.y*y,p.id===selfId?4:3,0,Math.PI*2);rctx.fill();}
  rctx.strokeStyle='#e4e7d090';rctx.lineWidth=1;rctx.strokeRect((camera.x-vw/(2*zoom))*x,(camera.y-vh/(2*zoom))*y,vw/zoom*x,vh/zoom*y);
}
setInterval(()=>{
  if(!world||!game)return;
  const k=keyboard;
  input.dx=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0);
  input.dy=(k.has('KeyS')||k.has('ArrowDown')?1:0)-(k.has('KeyW')||k.has('ArrowUp')?1:0);
  if(touch.moving){input.dx=touch.dx;input.dy=touch.dy;}
  const magnitude=Math.hypot(input.dx,input.dy);
  if(magnitude>1){input.dx/=magnitude;input.dy/=magnitude;}
  const p = self();
  let targetX = p?.x ?? 1200, targetY = p?.y ?? 720;
  if (p) {
    if (matchMedia('(pointer: coarse)').matches) { targetX += Math.cos(input.aim) * touchRange; targetY += Math.sin(input.aim) * touchRange; }
    else if (mouseWorld) { targetX = mouseWorld.x; targetY = mouseWorld.y; }
    else { targetX += Math.cos(input.aim) * 500; targetY += Math.sin(input.aim) * 500; }
  }
  send({type:'input',...input,targetX,targetY,fire:input.fire||k.has('Space')});
},50);
requestAnimationFrame(render);
