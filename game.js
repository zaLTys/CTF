import { randomUUID } from 'node:crypto';

export const WIDTH = 2400;
export const HEIGHT = 1440;
export const TICK = 1 / 30;
export const BASES = {
  blue: { x: 235, y: 720 },
  red: { x: 2165, y: 720 },
};
export const TYPES = {
  jeep: { label: 'Recon Jeep', speed: 330, accel: 505, brake: 570, coast: 190, turnRate: 3.65, grip: 5.9, reverse: .43, hp: 90, ammo: 140, fuel: 100, fireMs: 145, damage: 10, bulletSpeed: 760, radius: 17 },
  tank: { label: 'Battle Tank', speed: 195, accel: 290, brake: 410, coast: 160, turnRate: 2.55, grip: 8.4, reverse: .53, hp: 220, ammo: 40, fuel: 100, fireMs: 500, damage: 35, bulletSpeed: 630, radius: 24 },
  heli: { label: 'Attack Heli', speed: 285, accel: 385, brake: 175, coast: 100, turnRate: 2.8, grip: 1.2, reverse: 1, hp: 125, ammo: 150, fuel: 100, fireMs: 125, damage: 12, bulletSpeed: 780, radius: 22 },
  asv:  { label: 'Rocket ASV', speed: 144, accel: 185, brake: 300, coast: 130, turnRate: 1.75, grip: 7.1, reverse: .36, hp: 270, ammo: 25, fuel: 100, fireMs: 800, damage: 65, bulletSpeed: 510, radius: 25 },
  arty: { label: 'Field Artillery', speed: 122, accel: 160, brake: 240, coast: 120, turnRate: 1.55, grip: 7.4, reverse: .35, hp: 160, ammo: 12, fuel: 100, fireMs: 2600, damage: 145, radius: 27, range: 980, blastRadius: 115 },
  fpv:  { label: 'FPV Operator', speed: 162, accel: 300, brake: 360, coast: 165, turnRate: 2.6, grip: 6.7, reverse: .5, hp: 110, ammo: 5, fuel: 100, fireMs: 900, damage: 125, radius: 22, blastRadius: 95 },
};

// Mostly symmetrical cover with a central causeway, keeping both teams fair.
export const WATER = [
  { x: 1020, y: -30, w: 360, h: 505 },
  { x: 1020, y: 965, w: 360, h: 505 },
];
export const COVER = [
  { x: 610, y: 340, w: 92, h: 90 }, { x: 1698, y: 1010, w: 92, h: 90 },
  { x: 610, y: 1010, w: 92, h: 90 }, { x: 1698, y: 340, w: 92, h: 90 },
  { x: 855, y: 605, w: 75, h: 100 }, { x: 1470, y: 735, w: 75, h: 100 },
  { x: 855, y: 735, w: 75, h: 100 }, { x: 1470, y: 605, w: 75, h: 100 },
  { x: 1120, y: 655, w: 160, h: 130 },
];
export const MUD = [
  { x: 850, y: 290, rx: 152, ry: 112 }, { x: 1550, y: 1150, rx: 152, ry: 112 },
  { x: 820, y: 1150, rx: 115, ry: 80 }, { x: 1580, y: 290, rx: 115, ry: 80 },
  { x: 1190, y: 535, rx: 80, ry: 52 }, { x: 1210, y: 905, rx: 80, ry: 52 },
];
// Every battlefield is 180-degree rotationally symmetrical to keep both teams fair.
// Bridge rectangles span water; destroy them to turn a shortcut into an impassable gap.
export const MAPS = {
  causeway: {
    id: 'causeway', name: 'OLD CAUSEWAY', biome: 'temperate', seed: 19950325,
    water: WATER, mud: MUD, cover: COVER,
    roads: [{x:0,y:612,w:WIDTH,h:216},{x:1162,y:0,w:76,h:HEIGHT}],
    bridges: [
      {x:984,y:210,w:432,h:104,name:'NORTH CROSSING'},
      {x:984,y:1126,w:432,h:104,name:'SOUTH CROSSING'},
    ],
    buildings: [
      {x:750,y:260,w:106,h:90},{x:1544,y:1090,w:106,h:90},
      {x:750,y:1090,w:106,h:90},{x:1544,y:260,w:106,h:90},
    ], foliage: 100,
  },
  delta: {
    id: 'delta', name: 'RIVER DELTA', biome: 'wetlands', seed: 428911,
    water: [
      {x:960,y:-25,w:480,h:555},{x:960,y:910,w:480,h:555},
      {x:350,y:180,w:190,h:150},{x:1860,y:1110,w:190,h:150},
    ],
    mud: [
      {x:840,y:435,rx:140,ry:120},{x:1560,y:1005,rx:140,ry:120},
      {x:820,y:1020,rx:130,ry:90},{x:1580,y:420,rx:130,ry:90},
      {x:1210,y:585,rx:110,ry:50},{x:1190,y:855,rx:110,ry:50},
    ],
    cover: [
      {x:600,y:415,w:95,h:105},{x:1705,y:920,w:95,h:105},
      {x:600,y:920,w:95,h:105},{x:1705,y:415,w:95,h:105},
      {x:865,y:595,w:85,h:94},{x:1450,y:751,w:85,h:94},
      {x:865,y:751,w:85,h:94},{x:1450,y:595,w:85,h:94},
    ],
    roads: [{x:0,y:612,w:WIDTH,h:216},{x:1162,y:0,w:76,h:HEIGHT}],
    bridges: [
      {x:929,y:200,w:542,h:100,name:'DELTA NORTH'},
      {x:929,y:1140,w:542,h:100,name:'DELTA SOUTH'},
    ],
    buildings: [
      {x:760,y:275,w:108,h:92},{x:1532,y:1073,w:108,h:92},
      {x:760,y:1073,w:108,h:92},{x:1532,y:275,w:108,h:92},
    ], foliage: 118,
  },
  badlands: {
    id: 'badlands', name: 'DUST & IRON', biome: 'arid', seed: 814072,
    water: [
      {x:650,y:225,w:340,h:255},{x:1410,y:960,w:340,h:255},
      {x:1030,y:15,w:340,h:160},{x:1030,y:1265,w:340,h:160},
    ],
    mud: [
      {x:485,y:365,rx:180,ry:100},{x:1915,y:1075,rx:180,ry:100},
      {x:850,y:1030,rx:200,ry:115},{x:1550,y:410,rx:200,ry:115},
      {x:1210,y:540,rx:110,ry:60},{x:1190,y:900,rx:110,ry:60},
    ],
    cover: [
      {x:590,y:515,w:92,h:95},{x:1718,y:830,w:92,h:95},
      {x:590,y:830,w:92,h:95},{x:1718,y:515,w:92,h:95},
      {x:1040,y:480,w:88,h:90},{x:1272,y:870,w:88,h:90},
      {x:1040,y:870,w:88,h:90},{x:1272,y:480,w:88,h:90},
    ],
    roads: [{x:0,y:632,w:WIDTH,h:176},
      {x:350,y:170,w:95,h:450},{x:1955,y:820,w:95,h:450},
      {x:1152,y:0,w:96,h:HEIGHT}],
    bridges: [
      {x:618,y:306,w:404,h:92,name:'QUARRY PASS'},
      {x:1378,y:1042,w:404,h:92,name:'SOUTH VIADUCT'},
    ],
    buildings: [
      {x:780,y:530,w:112,h:91},{x:1508,y:819,w:112,h:91},
      {x:780,y:819,w:112,h:91},{x:1508,y:530,w:112,h:91},
    ], foliage: 76,
  },
};
export const MAP_CHOICES = Object.values(MAPS).map(({ id,name,biome }) => ({id,name,biome}));
const turretPositions = [
  ['blue', 450, 520], ['blue', 450, 920], ['red', 1950, 520], ['red', 1950, 920],
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const close = (a, b, radius) => dist2(a, b) < radius * radius;
const enemyOf = team => team === 'blue' ? 'red' : 'blue';
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const approach = (value, goal, maxChange) => value + clamp(goal - value, -maxChange, maxChange);
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
export function surfaceAt(x, y, mapId='causeway') {
  const map=typeof mapId==='string' && Object.hasOwn(MAPS,mapId) ? MAPS[mapId] : MAPS.causeway;
  if (map.roads.some(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)) return 'road';
  if (map.mud.some(m => ((x-m.x)/m.rx)**2 + ((y-m.y)/m.ry)**2 < 1)) return 'mud';
  return 'grass';
}
function makeScenery(map) {
  // Mirror clusters to keep multiplayer routes symmetric. Everything is deterministic per map.
  const random = rng(map.seed), props = [];
  const valid = (x, y, r) => x > 65 && x < WIDTH-65 && y > 55 && y < HEIGHT-55
    && !map.roads.some(w => circleRect(x,y,r+15,w))
    && !map.water.some(w => circleRect(x,y,r+20,w))
    && !map.cover.some(w => circleRect(x,y,r+30,w))
    && !map.buildings.some(w=>circleRect(x,y,r+25,w))
    && !map.bridges.some(w=>circleRect(x,y,r+20,w))
    && !Object.values(BASES).some(b => Math.hypot(x-b.x,y-b.y)<220)
    && !turretPositions.some(([,tx,ty]) => Math.hypot(x-tx,y-ty)<75)
    && props.every(c => Math.hypot(c.x-x,c.y-y)>c.radius+r+16);
  let id=1;
  for (let i=0; i<map.foliage; i++) {
    const isRock = i%13===0;
    const isBush = i%5===0 && !isRock;
    const kind = isRock ? 'rock' : isBush ? 'bush' : 'tree';
    const radius = kind==='rock'?14+random()*12:kind==='bush'?10+random()*10:14+random()*13;
    const hp = kind==='rock' ? 9999 : kind==='bush' ? 24 : Math.round(72+radius*2.35);
    for(let tries=0; tries<45; tries++) {
      const x=80+random()*1040,y=75+random()*1290;
      if (!valid(x,y,radius) || !valid(WIDTH-x,HEIGHT-y,radius)) continue;
      for(const [px,py] of [[x,y],[WIDTH-x,HEIGHT-y]])
        props.push({ id: id++, kind, x:Math.round(px), y:Math.round(py), radius:Math.round(radius), hp, maxHp:hp, rot:Math.round(random()*360) });
      break;
    }
  }
  return props;
}
const SCENERY = Object.fromEntries(Object.values(MAPS).map(m=>[m.id,makeScenery(m)]));
const SUPPLY_CRATES = [
  {x:525,y:265,w:40,h:39}, {x:1835,y:1136,w:40,h:39},
  {x:525,y:1136,w:40,h:39}, {x:1835,y:265,w:40,h:39},
  {x:760,y:465,w:52,h:34}, {x:1588,y:941,w:52,h:34},
  {x:763,y:945,w:50,h:38}, {x:1587,y:457,w:50,h:38},
  {x:1010,y:552,w:43,h:40}, {x:1347,y:848,w:43,h:40},
];
function newObstacles(map) {
  const bunkers=map.cover.map((c,i)=>({...c,id:i+1,kind:'bunker',hp:195,maxHp:195,stage:0}));
  const buildings=map.buildings.map((c,i)=>({...c,id:100+i,kind:'building',hp:300,maxHp:300,stage:0}));
  return [...bunkers,...buildings,
    ...SUPPLY_CRATES.map((c,i) => ({ ...c,id:200+i,kind:'crate',hp:65,maxHp:65,stage:0 }))];
}
function newBridges(map) {
  return map.bridges.map((b,i)=>({...b,id:i+1,kind:'bridge',hp:310,maxHp:310,stage:0,collapsedAt:0}));
}
export function obstacleStage(obj) {
  if (obj.hp<=0) return 3;
  if (obj.hp/obj.maxHp<=.34) return 2;
  if (obj.hp/obj.maxHp<=.67) return 1;
  return 0;
}


function circleRect(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
}
export function createRoom(code, mapId='causeway') {
  const map=typeof mapId==='string' && Object.hasOwn(MAPS,mapId) ? MAPS[mapId] : MAPS.causeway;
  return {
    code, mapId:map.id, map, players: new Map(), bullets: [], explosions: [], strikes: [], drones: [], craters: [], trails: [], wrecks: [],
    bridges: newBridges(map), scenery: SCENERY[map.id].map(c => ({...c})), obstacles: newObstacles(map), scores: { blue: 0, red: 0 },
    flags: {
      blue: { ...BASES.blue, carriedBy: null, dropped: false, returnAt: 0 },
      red: { ...BASES.red, carriedBy: null, dropped: false, returnAt: 0 },
    },
    turrets: turretPositions.map(([team, x, y], i) => ({ id: i + 1, team, x, y, hp: 135, angle: 0, nextFire: 0 })),
    announcement: '', announcementUntil: 0, pauseUntil: 0, updatedAt: Date.now(),
  };
}
function spawn(p) {
  const base = BASES[p.team];
  p.x = base.x + (p.team === 'blue' ? 70 : -70);
  p.y = base.y + ((p.slot % 4) * 46 - 69);
  p.type = 'tank';
  p.angle = p.team === 'blue' ? 0 : Math.PI;
  p.bodyAngle = p.angle; p.vx = 0; p.vy = 0; p.surface = 'road'; p.lastTrail = 0; p.lastRamAt = 0;
  p.hp = TYPES.tank.hp;
  p.ammo = TYPES.tank.ammo;
  p.fuel = TYPES.tank.fuel;
  p.nextFire = 0;
  p.fireLatch = false;
  p.input = { dx: 0, dy: 0, aim: p.angle, fire: false, targetX: p.x, targetY: p.y, driveMode:'vector' };
  p.respawnAt = 0;
  p.alive = true;
}
export function addPlayer(room, id = randomUUID()) {
  if (room.players.size >= 4) return null;
  const blues = [...room.players.values()].filter(p => p.team === 'blue').length;
  const reds = room.players.size - blues;
  const team = blues <= reds ? 'blue' : 'red';
  const p = { id, team, slot: room.players.size };
  spawn(p);
  room.players.set(id, p);
  room.updatedAt = Date.now();
  return p;
}
function resetFlag(room, team) {
  Object.assign(room.flags[team], BASES[team], { carriedBy: null, dropped: false, returnAt: 0 });
}
export function removePlayer(room, id) {
  const p = room.players.get(id);
  if (!p) return;
  for (const team of ['blue', 'red']) if (room.flags[team].carriedBy === id) resetFlag(room, team);
  room.players.delete(id);
  room.drones = room.drones.filter(d => d.ownerId !== id);
  room.updatedAt = Date.now();
}
export function setInput(p, m) {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'input') {
    let dx = Number(m.dx), dy = Number(m.dy), aim = Number(m.aim);
    dx = Number.isFinite(dx) ? clamp(dx, -1, 1) : 0;
    dy = Number.isFinite(dy) ? clamp(dy, -1, 1) : 0;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
    const tx = Number(m.targetX), ty = Number(m.targetY);
    p.input = { dx, dy, aim: Number.isFinite(aim) ? aim : p.angle, driveMode: m.driveMode === 'classic' ? 'classic' : 'vector', fire: m.fire === true,
      targetX: Number.isFinite(tx) ? clamp(tx, 0, WIDTH) : p.x + Math.cos(p.angle) * 460,
      targetY: Number.isFinite(ty) ? clamp(ty, 0, HEIGHT) : p.y + Math.sin(p.angle) * 460 };
  }
  if (m.type === 'vehicle' && typeof m.vehicle === 'string') {
    const type = m.vehicle;
    if (TYPES[type] && p.alive && close(p, BASES[p.team], 155)) {
      p.type = type; p.hp = TYPES[type].hp; p.ammo = TYPES[type].ammo; p.fuel = TYPES[type].fuel;
      p.nextFire = 0; p.fireLatch = false; p.vx = 0; p.vy = 0;
      // Switching roles clears any pilot-controlled drone.
    }
  }
}
function collisionAt(room, p, x, y) {
  const r = TYPES[p.type].radius;
  if (x<r || y<r || x>WIDTH-r || y>HEIGHT-r) return {kind:'edge'};
  if (p.type==='heli') return null;
  if (room.map.water.some(rect => circleRect(x,y,r,rect)) && !room.bridges.some(b=>b.hp>0 && x>=b.x && x<=b.x+b.w && y>=b.y+r*.35 && y<=b.y+b.h-r*.35)) return {kind:'water'};
  const other=[...room.players.values()].find(q=>q.id!==p.id&&q.alive&&Math.hypot(q.x-x,q.y-y)<TYPES[q.type].radius+r-1);
  if(other) return {kind:'vehicle',target:other};
  const wreck=room.wrecks.find(w=>w.hp>0 && Math.hypot(w.x-x,w.y-y)<w.radius+r-3);
  if(wreck) return wreck;
  const building=room.obstacles.find(o=>o.hp>0&&circleRect(x,y,r,o));
  if (building) return building;
  return room.scenery.find(c=>c.hp>0&&Math.hypot(c.x-x,c.y-y)<c.radius+r) || null;
}
function destroyScenery(room, obj, now) {
  if (obj.hp>0) return;
  obj.hp=0;
  boom(room,obj.x,obj.y,now,obj.kind==='tree'?.55:.3);
  if (obj.kind==='tree') room.trails.push({x:obj.x,y:obj.y,angle:obj.rot*Math.PI/180,type:'fall',bornAt:now});
}
function damageObject(room, obj, damage, now) {
  if (!obj || obj.hp<=0 || obj.kind==='rock' || obj.kind==='water' || obj.kind==='edge' || obj.kind==='vehicle') return;
  const before=obj.hp, prevStage=obstacleStage(obj);
  obj.hp=Math.max(0,obj.hp-damage);
  obj.stage=obstacleStage(obj);
  if(obj.kind==='bridge' && obj.stage===3 && prevStage<3){
    obj.collapsedAt=now;
    // Ground vehicles on the span fall when the deck gives way; helicopters fly clear.
    for(const p of room.players.values()){
      if(p.alive && p.type!=='heli' && p.x>=obj.x && p.x<=obj.x+obj.w && p.y>=obj.y && p.y<=obj.y+obj.h
        && room.map.water.some(w=>circleRect(p.x,p.y,TYPES[p.type].radius*.7,w))) kill(room,p,now);
    }
    boom(room,obj.x+obj.w*.33,obj.y+obj.h*.5,now,2.4);
    boom(room,obj.x+obj.w*.67,obj.y+obj.h*.5,now,2.4);
    room.announcement=`${obj.name} DESTROYED — FIND ANOTHER ROUTE`;
    room.announcementUntil=now+2700;
  } else if ((obj.kind==='building'||obj.kind==='bunker') && obj.stage>prevStage){
    for(let stage=prevStage+1; stage<=obj.stage;stage++){
      boom(room,obj.x+obj.w*(stage%2?.28:.72),obj.y+obj.h*.5,now,stage===3?1.4:.65);
    }
  } else if(obj.kind==='wreck'&&obj.hp===0) boom(room,obj.x,obj.y,now,.95);
  if(before>0 && obj.hp<=0) {
    if(obj.kind==='tree'||obj.kind==='bush')destroyScenery(room,obj,now);
    if(obj.kind==='crate') boom(room,obj.x+obj.w/2,obj.y+obj.h/2,now,.8);
  }
}
function ramVehicle(room,p,collision,now){
  if(collision?.kind!=='vehicle') return;
  const other=collision.target;
  const speed=Math.hypot(p.vx,p.vy);
  if(speed<85||now-p.lastRamAt<550)return;
  p.lastRamAt=now;
  other.vx+=p.vx*.18;other.vy+=p.vy*.18;
  if(other.team!==p.team){
    const damage=Math.min(35,(speed-70)*.19);
    other.hp-=damage;p.hp-=damage*.19;
    if(other.hp<=0)kill(room,other,now);
    if(p.hp<=0)kill(room,p,now);
  }
}
function moveVehicle(room,p,t,dt,now) {
  const input=p.input, magnitude=Math.min(1,Math.hypot(input.dx,input.dy));
  const oldSpeed=Math.hypot(p.vx,p.vy);
  if (p.type==='heli') {
    // Nose tracks the crosshair. Hull drive maps the stick onto that nose
    // (W/S forward and back, A/D strafe) instead of the screen axes.
    const damp=Math.exp(-(magnitude>.08?1.55:3.0)*dt);
    let wishX=input.dx, wishY=input.dy;
    if(input.driveMode==='classic'){
      const fx=Math.cos(p.bodyAngle), fy=Math.sin(p.bodyAngle);
      const forward=-input.dy, strafe=input.dx;
      wishX=fx*forward-fy*strafe;
      wishY=fy*forward+fx*strafe;
    }
    p.vx=p.vx*damp+wishX*t.accel*dt;
    p.vy=p.vy*damp+wishY*t.accel*dt;
    const sp=Math.hypot(p.vx,p.vy);
    if(sp>t.speed){p.vx*=t.speed/sp;p.vy*=t.speed/sp;}
    p.bodyAngle+=clamp(angleDelta(p.bodyAngle,p.input.aim),-t.turnRate*dt,t.turnRate*dt);
  } else {
    p.surface=surfaceAt(p.x,p.y,room.mapId);
    const terrain=p.surface==='road'?{speed:1.16,accel:1.08,grip:1.25}:
      p.surface==='mud'?{speed:.61,accel:.68,grip:.58}:{speed:.95,accel:.95,grip:1};
    const forwardX=Math.cos(p.bodyAngle),forwardY=Math.sin(p.bodyAngle);
    const forwardSpeed=p.vx*forwardX+p.vy*forwardY;
    let throttle=0, steering=0;
    if(input.driveMode==='classic') {
      throttle=-input.dy;
      steering=input.dx;
    } else if(magnitude>.1) {
      const desired=Math.atan2(input.dy,input.dx);
      const diff=angleDelta(p.bodyAngle,desired);
      steering=clamp(diff/(Math.PI*.4),-1,1);
      throttle=magnitude * (Math.abs(diff)>Math.PI*.66?.2:Math.abs(diff)>Math.PI*.38?.55:1);
    }
    const turnFactor=p.type==='tank'?(.52+.48*Math.min(1,Math.abs(forwardSpeed)/55)):
      .14+.86*Math.min(1,Math.abs(forwardSpeed)/90);
    const speedTurnPenalty=1-.30*Math.min(1,Math.abs(forwardSpeed)/Math.max(1,t.speed));
    p.bodyAngle+=steering*t.turnRate*turnFactor*speedTurnPenalty*dt*(forwardSpeed< -8?-1:1);
    const fx=Math.cos(p.bodyAngle),fy=Math.sin(p.bodyAngle);
    let long=p.vx*fx+p.vy*fy;
    let lat=-p.vx*fy+p.vy*fx;
    const top=t.speed*terrain.speed;
    const target=throttle>=0?throttle*top:throttle*top*t.reverse;
    if(p.fuel>0 && Math.abs(throttle)>.08) {
      const accelerate=Math.sign(target)===Math.sign(long)?t.accel:t.brake;
      long=approach(long,target,accelerate*terrain.accel*dt);
    } else long=approach(long,0,t.coast*terrain.grip*dt);
    lat*=Math.exp(-t.grip*terrain.grip*dt);
    p.vx=fx*long-fy*lat;
    p.vy=fy*long+fx*lat;
    const speed=Math.hypot(p.vx,p.vy);
    if(speed>top*1.08){p.vx*=top*1.08/speed;p.vy*=top*1.08/speed;}
  }
  if(p.fuel<=0){p.vx=approach(p.vx,0,t.brake*dt);p.vy=approach(p.vy,0,t.brake*dt);}
  // Swept, sub-stepped circular collision: slides against bunkers, crushes small cover,
  // and never tunnels through obstacles when a fast jeep crosses one in a single tick.
  const movement=Math.hypot(p.vx,p.vy)*dt;
  const substeps=Math.max(1,Math.ceil(movement/7));
  for(let j=0;j<substeps;j++) {
    const moveX=p.vx*dt/substeps,moveY=p.vy*dt/substeps;
    let hitX=collisionAt(room,p,p.x+moveX,p.y);
    if(hitX && p.type!=='heli') {
      // Roadside shrubs yield immediately; tanks may flatten trees at sufficient speed.
      const speed=Math.hypot(p.vx,p.vy);
      const heavy=['tank','asv','arty'].includes(p.type);
      if(hitX.kind==='bush' && speed>65) damageObject(room,hitX,50,now);
      else if(hitX.kind==='tree' && heavy && speed>5) damageObject(room,hitX,Math.max(12,speed*.65)*dt*30,now);
      else if(hitX.kind==='crate' && speed>10) damageObject(room,hitX,(heavy?70:26)*dt*30,now);
      else if(hitX.kind==='wreck' && heavy && speed>70) damageObject(room,hitX,speed*.3*dt*30,now);
      if(hitX.hp===0) hitX=null;
    }
    if(!hitX) p.x+=moveX;
    else { ramVehicle(room,p,hitX,now); p.vx*=-.11; }
    let hitY=collisionAt(room,p,p.x,p.y+moveY);
    if(hitY && p.type!=='heli') {
      const speed=Math.hypot(p.vx,p.vy), heavy=['tank','asv','arty'].includes(p.type);
      if(hitY.kind==='bush'&&speed>65) damageObject(room,hitY,50,now);
      else if(hitY.kind==='tree'&&heavy&&speed>5) damageObject(room,hitY,Math.max(12,speed*.65)*dt*30,now);
      else if(hitY.kind==='crate'&&speed>10) damageObject(room,hitY,(heavy?70:26)*dt*30,now);
      else if(hitY.kind==='wreck' && heavy && speed>70) damageObject(room,hitY,speed*.3*dt*30,now);
      if(hitY.hp===0) hitY=null;
    }
    if(!hitY) p.y+=moveY;
    else { ramVehicle(room,p,hitY,now); p.vy*=-.11; }
  }
  const speed=Math.hypot(p.vx,p.vy);
  if (p.type!=='heli' && speed>68 && now-p.lastTrail>160) {
    room.trails.push({x:p.x,y:p.y,angle:p.bodyAngle,type:speed>t.speed*.76?'skid':'track',bornAt:now});
    p.lastTrail=now;
    if(room.trails.length>190) room.trails.splice(0,room.trails.length-190);
  }
  if(speed>4) p.fuel=Math.max(0,p.fuel-(p.type==='heli'?1.6:1.0)*dt*(.25+speed/t.speed));
  return {oldSpeed,speed};
}
function fireBullet(room, shooter, now, automated = false) {
  const t = TYPES[shooter.type] || { bulletSpeed: 430, damage: 14 };
  const angle = shooter.angle;
  const muzzle = shooter.type === 'heli' ? 33 : 29;
  room.bullets.push({
    id: randomUUID(), team: shooter.team,
    x: shooter.x + Math.cos(angle) * muzzle, y: shooter.y + Math.sin(angle) * muzzle,
    vx: Math.cos(angle) * t.bulletSpeed, vy: Math.sin(angle) * t.bulletSpeed,
    damage: automated ? 15 : t.damage, radius: shooter.type === 'asv' ? 8 : 5,
    endAt: now + (shooter.type === 'asv' ? 2250 : 1550), ownerId: shooter.id || null,
    kind: automated ? 'turret' : shooter.type,
  });
}
function boom(room, x, y, now, scale = 1) {
  room.explosions.push({ id: randomUUID(), x, y, bornAt: now, until: now + 650, scale });
  if (room.explosions.length > 35) room.explosions.shift();
}
function kill(room, p, now) {
  if(!p.alive)return;
  // Wrecks persist through respawns, block ground vehicles and absorb shots.
  // Do not choke the friendly garage/spawn area with an unavoidable wreck.
  if(!Object.values(BASES).some(base=>Math.hypot(base.x-p.x,base.y-p.y)<175)){
    room.wrecks.push({id:randomUUID(),kind:'wreck',team:p.team,type:p.type,
      x:p.x,y:p.y,angle:p.bodyAngle??p.angle,radius:Math.max(19,TYPES[p.type].radius),
      hp:110,maxHp:110,stage:0,bornAt:now});
    if(room.wrecks.length>32)room.wrecks.shift();
  }
  p.alive = false;
  p.respawnAt = now + 2400;
  p.hp = 0;
  boom(room, p.x, p.y, now, 1.9);
  room.drones = room.drones.filter(d => d.ownerId !== p.id);
  for (const flag of Object.values(room.flags)) {
    if (flag.carriedBy === p.id) {
      flag.carriedBy = null; flag.dropped = true; flag.returnAt = now + 18000;
      flag.x = p.x; flag.y = p.y;
    }
  }
}
function capture(room, team, now) {
  room.scores[team]++;
  room.announcement = `${team.toUpperCase()} TEAM CAPTURED THE FLAG`;
  room.announcementUntil = now + 3300;
  room.pauseUntil = now + 2300;
  room.bullets = []; room.strikes = []; room.drones = [];
  resetFlag(room, 'blue'); resetFlag(room, 'red');
  for (const p of room.players.values()) spawn(p);
  room.turrets = turretPositions.map(([side, x, y], i) => ({ id: i + 1, team: side, x, y, hp: 135, angle: 0, nextFire: 0 }));
  room.obstacles = newObstacles(room.map); room.scenery = SCENERY[room.mapId].map(c => ({...c}));
  room.bridges=newBridges(room.map); room.wrecks=[];
  room.craters = []; room.trails = [];
}
function splash(room, team, x, y, radius, damage, now) {
  boom(room, x, y, now, radius / 65);
  room.craters.push({ x, y, r: radius * 0.46, bornAt: now });
  if (room.craters.length > 45) room.craters.shift();
  for (const p of room.players.values()) {
    if (!p.alive || p.team === team) continue;
    const distance = Math.hypot(p.x - x, p.y - y);
    if (distance < radius + TYPES[p.type].radius) {
      p.hp -= damage * Math.max(0.2, 1 - distance / (radius + TYPES[p.type].radius));
      if (p.hp <= 0) kill(room, p, now);
    }
  }
  for (const t of room.turrets) {
    if (t.hp <= 0 || t.team === team) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < radius + 26) {
      t.hp = Math.max(0, t.hp - damage * Math.max(0.2, 1 - d / (radius + 26)));
      if (t.hp <= 0) boom(room, t.x, t.y, now, 1.5);
    }
  }
  for (const c of room.obstacles) {
    if (c.hp <= 0) continue;
    const nearX = clamp(x, c.x, c.x + c.w), nearY = clamp(y, c.y, c.y + c.h);
    const d = Math.hypot(x - nearX, y - nearY);
    if (d <= radius) damageObject(room,c,damage * Math.max(0.35, 1 - d / radius),now);
  }
  for(const b of room.bridges){
    if(b.hp<=0)continue;
    const nx=clamp(x,b.x,b.x+b.w),ny=clamp(y,b.y,b.y+b.h);
    const d=Math.hypot(x-nx,y-ny);
    if(d<radius)damageObject(room,b,damage*Math.max(.32,1-d/radius),now);
  }
  for(const w of room.wrecks){
    if(w.hp<=0)continue;
    const d=Math.hypot(x-w.x,y-w.y);
    if(d<radius+w.radius)damageObject(room,w,damage*Math.max(.3,1-d/(radius+w.radius)),now);
  }
  for(const c of room.scenery){
    if(c.hp<=0||c.kind==='rock')continue;
    const d=Math.hypot(c.x-x,c.y-y);
    if(d<radius+c.radius)damageObject(room,c,damage*Math.max(.3,1-d/(radius+c.radius)),now);
  }
}
function launchDrone(room, p, now) {
  room.drones.push({ id: randomUUID(), ownerId: p.id, team: p.team,
    x: p.x + Math.cos(p.angle) * 32, y: p.y + Math.sin(p.angle) * 32,
    angle: p.angle, expiresAt: now + 8500, bornAt: now });
  p.ammo--;
  p.nextFire = now + TYPES.fpv.fireMs;
}
function detonateDrone(room, d, now) {
  splash(room, d.team, d.x, d.y, TYPES.fpv.blastRadius, TYPES.fpv.damage, now);
}
export function step(room, now = Date.now(), dt = TICK) {
  room.updatedAt = now;
  room.explosions = room.explosions.filter(e => e.until > now);
  room.craters = room.craters.filter(c => now - c.bornAt < 28000);
  room.trails = room.trails.filter(c => now-c.bornAt<12500);
  if (now < room.pauseUntil) return;
  for (const p of room.players.values()) {
    if (!p.alive) { if (now >= p.respawnAt) spawn(p); else continue; }
    const t = TYPES[p.type];
    const activeDrone = p.type === 'fpv' ? room.drones.find(d => d.ownerId === p.id) : null;
    if (!activeDrone) moveVehicle(room,p,t,dt,now);
    p.angle = Math.atan2(Math.sin(p.input.aim), Math.cos(p.input.aim));
    const justFired = p.input.fire && !p.fireLatch;
    p.fireLatch = p.input.fire;
    if (p.type === 'fpv') {
      if (activeDrone && justFired && now - activeDrone.bornAt > 250) {
        detonateDrone(room, activeDrone, now);
        room.drones = room.drones.filter(d => d.id !== activeDrone.id);
      } else if (!activeDrone && justFired && p.ammo > 0 && now >= p.nextFire) launchDrone(room, p, now);
    } else if (p.type === 'arty') {
      if (justFired && p.ammo > 0 && now >= p.nextFire) {
        const tx = p.input.targetX, ty = p.input.targetY;
        const d = Math.hypot(tx - p.x, ty - p.y);
        // Minimum safe range and an enforced maximum to keep artillery counter-play fair.
        if (d >= 145 && d <= t.range) {
          p.ammo--; p.nextFire = now + t.fireMs;
          room.strikes.push({ id: randomUUID(), ownerId: p.id, team: p.team,
            x: tx, y: ty, launchedAt: now, impactAt: now + 1200, radius: t.blastRadius });
        }
      }
    } else if (p.input.fire && p.ammo > 0 && now >= p.nextFire) {
      p.ammo--;
      p.nextFire = now + t.fireMs;
      fireBullet(room, p, now);
    }
    if (close(p, BASES[p.team], 135)) {
      p.fuel = Math.min(t.fuel, p.fuel + dt * 17);
      p.ammo = Math.min(t.ammo, p.ammo + dt * 12);
      p.hp = Math.min(t.hp, p.hp + dt * 24);
    }
  }
  const remainingDrones = [];
  for (const d of room.drones) {
    const pilot = room.players.get(d.ownerId);
    if (!pilot?.alive || pilot.type !== 'fpv') continue;
    if (now >= d.expiresAt) { detonateDrone(room, d, now); continue; }
    let vx = pilot.input.dx, vy = pilot.input.dy;
    if (pilot.input.driveMode === 'classic') {
      // W holds the current nose; A/D yaws. Releasing the stick returns to the crosshair.
      const mag = Math.hypot(pilot.input.dx, pilot.input.dy);
      if (mag < 0.13) d.angle = Math.atan2(Math.sin(pilot.input.aim), Math.cos(pilot.input.aim));
      else d.angle += pilot.input.dx * 3.6 * dt;
      const forward = mag < 0.13 || pilot.input.dy <= 0.08 ? 1 : -1;
      vx = Math.cos(d.angle) * forward;
      vy = Math.sin(d.angle) * forward;
    } else {
      if (Math.hypot(vx, vy) < 0.13) { vx = Math.cos(pilot.input.aim); vy = Math.sin(pilot.input.aim); }
      const mag = Math.max(1, Math.hypot(vx, vy));
      vx /= mag; vy /= mag;
      d.angle = Math.atan2(vy, vx);
    }
    d.x = clamp(d.x + vx * 450 * dt, 14, WIDTH - 14);
    d.y = clamp(d.y + vy * 450 * dt, 14, HEIGHT - 14);
    const target = [...room.players.values()].find(p => p.alive && p.team !== d.team && close(p, d, 34));
    const defense = room.turrets.find(t => t.hp > 0 && t.team !== d.team && close(t, d, 32));
    if (target || defense) { detonateDrone(room, d, now); continue; }
    remainingDrones.push(d);
  }
  room.drones = remainingDrones;
  const remainingStrikes = [];
  for (const strike of room.strikes) {
    if (now >= strike.impactAt) splash(room, strike.team, strike.x, strike.y, strike.radius, TYPES.arty.damage, now);
    else remainingStrikes.push(strike);
  }
  room.strikes = remainingStrikes;
  for (const turret of room.turrets) {
    if (turret.hp <= 0) continue;
    let target = null;
    for (const p of room.players.values()) {
      if (!p.alive || p.team === turret.team || !close(turret, p, 385)) continue;
      if (!target || dist2(turret, p) < dist2(turret, target)) target = p;
    }
    if (target) {
      turret.angle = Math.atan2(target.y - turret.y, target.x - turret.x);
      if (now >= turret.nextFire) {
        turret.nextFire = now + 1050;
        fireBullet(room, { ...turret, type: 'turret' }, now, true);
      }
    }
  }
  const next = [];
  for (const b of room.bullets) {
    if (now >= b.endAt) continue;
    const travel = Math.hypot(b.vx, b.vy) * dt;
    const substeps = Math.max(1, Math.ceil(travel / 12));
    let hit = false;
    for (let k = 0; k < substeps; k++) {
      b.x += b.vx * dt / substeps;
      b.y += b.vy * dt / substeps;
      const obstacle = room.obstacles.find(c => c.hp > 0 && circleRect(b.x, b.y, b.radius, c));
      const tree = room.scenery.find(c => c.hp>0&&Math.hypot(c.x-b.x,c.y-b.y)<c.radius+b.radius);
      const wreck=room.wrecks.find(w=>w.hp>0&&Math.hypot(w.x-b.x,w.y-b.y)<w.radius+b.radius);
      // Bridge decks are targeted by heavy shells, not captured by small-arms fire.
      const bridge=['tank','asv'].includes(b.kind) ? room.bridges.find(o=>o.hp>0&&
        b.x>=o.x+o.w*.21&&b.x<=o.x+o.w*.79&&b.y>=o.y&&b.y<=o.y+o.h) : null;
      if (obstacle || tree || wreck || bridge) {
        if (b.kind === 'asv') splash(room, b.team, b.x, b.y, 82, b.damage, now);
        else damageObject(room,obstacle||tree||wreck||bridge,b.damage,now);
        hit = true; break;
      }
      if (b.x < 0 || b.x > WIDTH || b.y < 0 || b.y > HEIGHT) { hit = true; break; }
      for (const p of room.players.values()) {
        if (!p.alive || p.team === b.team || !close(b, p, b.radius + TYPES[p.type].radius)) continue;
        if (b.kind === 'asv') splash(room, b.team, b.x, b.y, 82, b.damage, now);
        else p.hp -= b.damage;
        if (p.alive && p.hp <= 0) kill(room, p, now);
        hit = true; break;
      }
      if (hit) break;
      for (const t of room.turrets) {
        if (t.team === b.team || t.hp <= 0 || !close(b, t, b.radius + 26)) continue;
        if (b.kind === 'asv') splash(room, b.team, b.x, b.y, 82, b.damage, now);
        else t.hp = Math.max(0, t.hp - b.damage);
        if (t.hp === 0) boom(room, t.x, t.y, now, 1.7);
        hit = true; break;
      }
      if (hit) break;
    }
    if (hit) { if (b.kind !== 'asv') boom(room, b.x, b.y, now, 0.6); }
    else next.push(b);
  }
  room.bullets = next;
  for (const team of ['blue', 'red']) {
    const flag = room.flags[team];
    if (flag.carriedBy) {
      const carrier = room.players.get(flag.carriedBy);
      if (!carrier || !carrier.alive) resetFlag(room, team);
      else { flag.x = carrier.x; flag.y = carrier.y - 35; }
    } else if (flag.dropped && now >= flag.returnAt) resetFlag(room, team);
  }
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const own = room.flags[p.team];
    const enemy = room.flags[enemyOf(p.team)];
    if (own.dropped && close(p, own, 43)) resetFlag(room, p.team);
    if (p.type === 'jeep' && !enemy.carriedBy && close(p, enemy, 52)) {
      enemy.carriedBy = p.id; enemy.dropped = false;
      room.announcement = `${p.team.toUpperCase()} JEEP STOLE THE FLAG`;
      room.announcementUntil = now + 2100;
    }
    if (enemy.carriedBy === p.id && close(p, BASES[p.team], 105) && !own.dropped && !own.carriedBy) {
      capture(room, p.team, now); break;
    }
  }
}
export function snapshot(room, now = Date.now()) {
  return {
    type: 'state', time: now, scores: room.scores, flags: room.flags, turrets: room.turrets,
    mapId:room.mapId, bridges:room.bridges, wrecks:room.wrecks,
    obstacles: room.obstacles, scenery: room.scenery, trails: room.trails, strikes: room.strikes, drones: room.drones, craters: room.craters,
    bullets: room.bullets.map(({ id, x, y, team, kind, vx, vy }) => ({ id, x, y, team, kind, vx, vy })),
    explosions: room.explosions,
    announcement: room.announcementUntil > now ? room.announcement : '',
    players: [...room.players.values()].map(({ id, team, x, y, type, angle, bodyAngle, vx, vy, surface, hp, ammo, fuel, alive, respawnAt }) =>
      ({ id, team, x, y, type, angle, bodyAngle, vx, vy, surface, hp, ammo, fuel, alive, respawnAt })),
  };
}
