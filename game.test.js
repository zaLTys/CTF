import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, addPlayer, removePlayer, setInput, step, BASES, TYPES, MAPS, MAP_CHOICES, surfaceAt, snapshot } from './game.js';

test('room permits four balanced players across two teams', () => {
  const room=createRoom('ABCDE');
  const a=addPlayer(room,'a'),b=addPlayer(room,'b');
  assert.equal(a.team,'blue');assert.equal(b.team,'red');
  const c=addPlayer(room,'c'),d=addPlayer(room,'d');
  assert.equal(c.team,'blue');assert.equal(d.team,'red');
  assert.equal(addPlayer(room,'e'),null);
  removePlayer(room,'a');assert.equal(room.players.size,3);
});

test('server rejects invalid vehicle names and switches outside base', () => {
  const room=createRoom('ABCDE'),p=addPlayer(room,'a');
  setInput(p,{type:'vehicle',vehicle:'jet'});assert.equal(p.type,'tank');
  p.x=900;setInput(p,{type:'vehicle',vehicle:'jeep'});assert.equal(p.type,'tank');
  p.x=BASES.blue.x;setInput(p,{type:'vehicle',vehicle:'jeep'});assert.equal(p.type,'jeep');
  assert.equal(p.hp,TYPES.jeep.hp);
});

test('input values cannot exceed movement speed or corrupt the game', () => {
  const room=createRoom('ABCDE'),p=addPlayer(room,'a');
  setInput(p,{type:'input',dx:100,dy:100,aim:'invalid',fire:false});
  assert.ok(Math.hypot(p.input.dx,p.input.dy)<=1.00000001);
  assert.equal(Number.isFinite(p.input.aim),true);
  const x=p.x,y=p.y;step(room,Date.now(),1/30);
  assert.ok(Math.hypot(p.x-x,p.y-y)<TYPES.tank.speed/30+0.1);
});

test('only a jeep can steal the opposing flag and score', () => {
  const room=createRoom('ABCDE'),p=addPlayer(room,'a');
  p.x=BASES.red.x;p.y=BASES.red.y;
  const now=Date.now();step(room,now);
  assert.equal(room.flags.red.carriedBy,null);
  p.x=BASES.blue.x; p.y=BASES.blue.y;
  setInput(p,{type:'vehicle',vehicle:'jeep'});
  p.x=BASES.red.x;p.y=BASES.red.y;
  step(room,now+100);
  assert.equal(room.flags.red.carriedBy,'a');
  p.x=BASES.blue.x;p.y=BASES.blue.y;
  step(room,now+200);
  assert.equal(room.scores.blue,1);
  assert.equal(room.flags.red.carriedBy,null);
});

test('projectile collisions are processed by the server', () => {
  const room=createRoom('ABCDE'),a=addPlayer(room,'a'),b=addPlayer(room,'b');
  a.x=650;a.y=720;b.x=780;b.y=720;
  a.angle=0;a.input.aim=0;
  setInput(a,{type:'input',dx:0,dy:0,aim:0,fire:true});
  const hp=b.hp,now=Date.now();
  for(let i=0;i<30;i++)step(room,now+i*33.333,1/30);
  assert.ok(b.hp<hp,'enemy should take projectile damage');
});


test('artillery requires a valid distance and lands with a delay', () => {
  const room=createRoom('ARTY1'), a=addPlayer(room,'a'), b=addPlayer(room,'b');
  a.type='arty';a.hp=TYPES.arty.hp;a.ammo=TYPES.arty.ammo;
  a.x=690;a.y=510;b.x=1010;b.y=510;
  const now=100_000, originalHp=b.hp;
  setInput(a,{type:'input',dx:0,dy:0,aim:0,fire:true,targetX:b.x,targetY:b.y});
  step(room,now);
  assert.equal(room.strikes.length,1);
  assert.equal(a.ammo,TYPES.arty.ammo-1);
  assert.equal(b.hp,originalHp, 'no immediate damage before shell lands');
  step(room,now+1100);
  assert.equal(b.hp,originalHp);
  step(room,now+1300);
  assert.ok(b.hp<originalHp, 'artillery blast damages a target near the impact');
  assert.equal(room.strikes.length,0);
});

test('artillery cannot fire inside minimum range or outside maximum range', () => {
  const room=createRoom('ARTY2'),p=addPlayer(room,'a');
  p.type='arty';p.ammo=12;
  const now=100_000;
  setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:true,targetX:p.x+20,targetY:p.y});
  step(room,now);
  assert.equal(room.strikes.length,0);
  assert.equal(p.ammo,12);
  setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:false});step(room,now+50);
  setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:true,targetX:p.x+1200,targetY:p.y});step(room,now+100);
  assert.equal(room.strikes.length,0);
});

test('FPV drone can be launched and piloted into an enemy', () => {
  const room=createRoom('DRONE'), a=addPlayer(room,'a'), b=addPlayer(room,'b');
  a.type='fpv';a.hp=TYPES.fpv.hp;a.ammo=TYPES.fpv.ammo;a.x=690;a.y=720;
  b.x=960;b.y=720;
  const initialHp=b.hp,now=100_000;
  setInput(a,{type:'input',dx:1,dy:0,aim:0,fire:true});step(room,now);
  assert.equal(room.drones.length,1);
  assert.equal(a.ammo,TYPES.fpv.ammo-1);
  setInput(a,{type:'input',dx:1,dy:0,aim:0,fire:false});
  for(let i=1;i<=17;i++)step(room,now+i*33,1/30);
  assert.equal(room.drones.length,0, 'collision triggers an explosion');
  assert.ok(b.hp<initialHp, 'drone impact damages opposing vehicle');
});

test('rocket projectile is removed after first impact and cannot hit twice', () => {
  const room=createRoom('ROCKT'),a=addPlayer(room,'a'),b=addPlayer(room,'b');
  a.type='asv';a.hp=TYPES.asv.hp;a.ammo=TYPES.asv.ammo;
  a.x=680;a.y=720;b.x=830;b.y=720;
  const now=100_000;
  setInput(a,{type:'input',dx:0,dy:0,aim:0,fire:true});
  for(let i=0;i<12;i++)step(room,now+i*33,1/30);
  assert.equal(room.bullets.length,0);
});

function runTicks(room, count, begin=200_000) {
  for(let i=0;i<count;i++)step(room,begin+i*1000/30,1/30);
}
function clearTerrain(room){room.obstacles=[];room.scenery=[];room.turrets=[];}

test('ground vehicles accelerate gradually and coast instead of stopping instantly',()=>{
  const room=createRoom('MOTION'),p=addPlayer(room,'pilot');clearTerrain(room);
  p.x=430;p.y=720;
  setInput(p,{type:'input',dx:1,dy:0,aim:0,fire:false});
  step(room,200_000);
  const initial=Math.hypot(p.vx,p.vy);
  assert.ok(initial>0 && initial<TYPES.tank.speed*.5);
  runTicks(room,12,200_034);
  const fast=Math.hypot(p.vx,p.vy);
  assert.ok(fast>initial*3,'tank gathers speed');
  setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:false});
  const oldX=p.x;
  step(room,201_000);
  assert.ok(p.x>oldX,'coasting persists after throttle release');
  assert.ok(Math.hypot(p.vx,p.vy)<fast,'rolling resistance slows it');
  runTicks(room,100,201_034);
  assert.ok(Math.hypot(p.vx,p.vy)<.001,'eventually stops');
});

test('jeep accelerates faster and reaches higher speeds than tracked armor',()=>{
  const results={};
  for (const kind of ['jeep','tank','asv']){
    const room=createRoom('RACE'),p=addPlayer(room,'pilot');clearTerrain(room);
    p.type=kind;p.x=415;p.y=720;p.bodyAngle=0;
    setInput(p,{type:'input',dx:1,dy:0,aim:0,fire:false});
    runTicks(room,33);
    results[kind]=Math.hypot(p.vx,p.vy);
  }
  assert.ok(results.jeep>results.tank&&results.tank>results.asv,JSON.stringify(results));
});

test('tank pivots toward steering input; classic mode turns chassis while accelerating',()=>{
  const room=createRoom('TURN'),p=addPlayer(room,'pilot');clearTerrain(room);
  p.x=550;p.y=720;
  setInput(p,{type:'input',dx:0,dy:1,aim:0,fire:false});
  step(room,200_000);
  assert.ok(p.bodyAngle>0&&p.bodyAngle<.15,'limited turn rate rather than instant 90 degree snap');
  runTicks(room,60);
  assert.ok(p.bodyAngle>1,'tank eventually faces the steering direction');
  p.bodyAngle=0;p.vx=0;p.vy=0;
  setInput(p,{type:'input',dx:1,dy:-1,aim:0,fire:false,driveMode:'classic'});
  runTicks(room,25,210_000);
  assert.ok(p.bodyAngle>.25,'classic left/right steering changes heading');
  assert.ok(Math.hypot(p.vx,p.vy)>20,'classic throttle drives tank forward');
});

test('roads provide better grip and speed than muddy patches',()=>{
  const speeds={};
  for(const [terrain,x,y] of [['road',440,720],['mud',780,290]]){
    const room=createRoom('MUDDY'),p=addPlayer(room,'pilot');clearTerrain(room);
    p.x=x;p.y=y;p.bodyAngle=0;
    setInput(p,{type:'input',dx:1,dy:0,aim:0,fire:false});
    runTicks(room,24);
    speeds[terrain]=Math.hypot(p.vx,p.vy);
    assert.equal(p.surface,terrain);
  }
  assert.ok(speeds.road>speeds.mud*1.3,JSON.stringify(speeds));
});

test('ground vehicles stop at rivers while helicopters fly across',()=>{
  for (const type of ['tank','heli']){
    const room=createRoom('WATER'),p=addPlayer(room,'pilot');clearTerrain(room);
    p.type=type;p.x=910;p.y=390;p.bodyAngle=0;p.fuel=100;
    setInput(p,{type:'input',dx:1,dy:0,aim:0,fire:false});
    runTicks(room,120);
    if(type==='tank') assert.ok(p.x<1020-TYPES.tank.radius+1,`tank stops at bank x=${p.x}`);
    else assert.ok(p.x>1180,`helicopter crosses water x=${p.x}`);
  }
});

test('trees block jeeps but sustained tank ramming crushes trees and opens route',()=>{
  for(const type of ['jeep','tank']){
    const room=createRoom('FOREST'),p=addPlayer(room,'pilot');clearTerrain(room);
    const tree={id:12,kind:'tree',x:820,y:720,radius:20,hp:95,maxHp:95,rot:0};
    room.scenery=[tree];p.type=type;p.x=650;p.y=720;p.bodyAngle=0;
    setInput(p,{type:'input',dx:1,dy:0,aim:0,fire:false});
    runTicks(room,120);
    if(type==='jeep'){
      assert.equal(tree.hp,95);
      assert.ok(p.x<820-20-TYPES.jeep.radius+2);
    }else{
      assert.equal(tree.hp,0,'tank eventually destroys tree via collision');
      assert.ok(p.x>840,'tank passes the destroyed trunk');
    }
  }
});

test('tank cannon can destroy an individual tree and leave a traversable stump',()=>{
  const room=createRoom('LOGS'),p=addPlayer(room,'pilot');clearTerrain(room);
  p.x=600;p.y=720;p.bodyAngle=0;
  const tree={id:31,kind:'tree',x:765,y:720,radius:21,hp:70,maxHp:70,rot:0};
  room.scenery=[tree];
  setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:true});
  runTicks(room,100);
  assert.equal(tree.hp,0);
  assert.equal(room.scenery.length,1,'stump remains in game state');
  assert.ok(room.trails.some(t=>t.type==='fall'),'fall debris generated');
  setInput(p,{type:'input',dx:1,dy:0,aim:0,fire:false});
  runTicks(room,95,204_000);
  assert.ok(p.x>tree.x,'tank passes over destroyed stump');
});

test('artillery blast damages trees, bushes, crates and bunker cover',()=>{
  const room=createRoom('SPLASH'),p=addPlayer(room,'pilot');clearTerrain(room);
  p.type='arty';p.x=380;p.y=720;p.angle=0;p.bodyAngle=0;
  room.scenery=[{id:1,kind:'tree',x:755,y:720,radius:18,hp:100,maxHp:100,rot:0},
    {id:2,kind:'bush',x:802,y:712,radius:10,hp:22,maxHp:22,rot:0}];
  room.obstacles=[{id:8,kind:'crate',x:775,y:735,w:30,h:30,hp:50,maxHp:50},
    {id:9,kind:'bunker',x:820,y:710,w:60,h:60,hp:195,maxHp:195}];
  setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:true,targetX:790,targetY:730});
  step(room,100_000);step(room,101_300);
  assert.equal(room.scenery[0].hp,0);
  assert.equal(room.scenery[1].hp,0);
  assert.equal(room.obstacles[0].hp,0);
  assert.ok(room.obstacles[1].hp<195);
});

test('enemy vehicles collide and take impact damage instead of passing through each other',()=>{
  const room=createRoom('BUMPER'),a=addPlayer(room,'a'),b=addPlayer(room,'b');
  clearTerrain(room);a.x=600;a.y=720;b.x=770;b.y=720;
  const hp=b.hp;
  setInput(a,{type:'input',dx:1,dy:0,aim:0,fire:false});
  runTicks(room,60);
  assert.ok(a.x+TYPES.tank.radius<=b.x+TYPES.tank.radius*1.1,'two solid tanks stay separated');
  assert.ok(b.hp<hp,'high-speed collision damages opposing tank');
});


test('three selectable maps have server-authoritative layouts and invalid choices default safely',()=>{
  assert.equal(MAP_CHOICES.length,3);
  for(const id of ['causeway','delta','badlands']){
    const room=createRoom('MAP',id);
    assert.equal(room.mapId,id);
    assert.ok(room.map.water.length>0 && room.bridges.length===2);
    assert.ok(room.scenery.length>90);
    assert.equal(snapshot(room).mapId,id);
    for(const b of room.bridges)assert.ok(room.map.water.some(w=> b.x<w.x+w.w && b.x+b.w>w.x && b.y<w.y+w.h && b.y+b.h>w.y));
  }
  for(const invalid of ['not-real','constructor','toString','__proto__',null,{}])assert.equal(createRoom('MAP',invalid).mapId,'causeway');
  assert.notDeepEqual(MAPS.causeway.water,MAPS.badlands.water);
  assert.equal(['road','mud','grass'].includes(surfaceAt(1120,480,'delta')),true);
});

test('intact bridges allow tank crossings, but collapsed decks become blocking water',()=>{
  const room=createRoom('SPAN'),p=addPlayer(room,'pilot');clearTerrain(room);
  p.x=910;p.y=255;p.bodyAngle=0;p.fuel=100;
  setInput(p,{type:'input',dx:1,dy:0,aim:0,fire:false});
  runTicks(room,120);
  assert.ok(p.x>1435,`tank should cross active north bridge; x=${p.x}`);
  room.bridges[0].hp=0;room.bridges[0].stage=3;
  p.x=910;p.y=255;p.vx=0;p.vy=0;p.bodyAngle=0;
  runTicks(room,120,210_000);
  assert.ok(p.x<1020-TYPES.tank.radius+1,`tank should stop at broken crossing; x=${p.x}`);
  assert.equal(room.bridges[0].hp,0);
});

test('artillery repeatedly damages a bridge through both damage stages until it collapses',()=>{
  const room=createRoom('BOOM'),p=addPlayer(room,'pilot');clearTerrain(room);
  p.type='arty';p.hp=TYPES.arty.hp;p.ammo=12;p.x=845;p.y=258;p.bodyAngle=0;
  const b=room.bridges[0],t=100_000;
  for(let i=0;i<3;i++){
    const now=t+i*3000;
    setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:true,targetX:1200,targetY:258});
    step(room,now);
    setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:false});
    step(room,now+1300);
    assert.equal(b.stage,i+1);
  }
  assert.equal(b.hp,0);
  assert.equal(b.collapsedAt,107300);
  assert.match(room.announcement,/DESTROYED/);
});

test('buildings progress from damaged to exposed to collapsed rubble',()=>{
  const room=createRoom('HOUSE'),p=addPlayer(room,'pilot');clearTerrain(room);
  const target=room.map.buildings[0];
  room.obstacles=[{...target,kind:'building',id:99,hp:300,maxHp:300,stage:0}];
  p.x=700;p.y=510;p.type='arty';p.ammo=12;p.hp=TYPES.arty.hp;
  const building=room.obstacles[0];
  for(let i=0;i<3;i++){
    const now=100_000+i*3000;
    setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:true,targetX:target.x+target.w/2,targetY:target.y+target.h/2});
    step(room,now);setInput(p,{type:'input',dx:0,dy:0,aim:0,fire:false});step(room,now+1300);
    assert.equal(building.stage,i+1);
  }
  assert.equal(building.hp,0);
});

test('destroyed vehicles leave persistent solid wrecks that can be cleared',()=>{
  const room=createRoom('WRECK'),a=addPlayer(room,'blue-player'),b=addPlayer(room,'red-player');clearTerrain(room);
  a.x=1010;a.y=720;b.x=1190;b.y=720;a.hp=8;
  room.bullets.push({id:'fatal',team:'red',kind:'tank',x:994,y:720,vx:630,vy:0,damage:35,radius:5,endAt:101_000});
  step(room,100_000);
  assert.equal(a.alive,false);
  assert.equal(room.wrecks.length,1);
  assert.equal(room.wrecks[0].type,'tank');
  const wreck=room.wrecks[0];
  step(room,102_500);
  assert.equal(a.alive,true);
  assert.equal(room.wrecks.length,1,'wreck persists after respawn');
  b.x=840;b.y=720;b.vx=0;b.vy=0;b.bodyAngle=0;
  setInput(b,{type:'input',dx:1,dy:0,aim:0,fire:false});
  runTicks(room,90,103_000);
  assert.ok(b.x<wreck.x-TYPES.tank.radius-wreck.radius+7,`wreck should block tank at ${b.x}`);
  // The blocking hull can be destroyed by an enemy shell and turns into passable scrap.
  room.bullets.push({id:'scrap',team:'red',kind:'tank',x:wreck.x-16,y:wreck.y,vx:630,vy:0,damage:130,radius:5,endAt:108_000});
  step(room,107_000);
  assert.equal(wreck.hp,0);
  assert.equal(room.wrecks.length,1,'visual scrap remains for the round');
});

test('new round restores bridges and buildings, and removes old wrecks',()=>{
  const room=createRoom('RESET','badlands'),p=addPlayer(room,'pilot');
  room.bridges[0].hp=0;room.bridges[0].stage=3;
  room.obstacles.find(o=>o.kind==='building').hp=0;
  room.wrecks.push({kind:'wreck',x:1000,y:700,hp:110,radius:20});
  p.x=BASES.blue.x;p.y=BASES.blue.y;
  setInput(p,{type:'vehicle',vehicle:'jeep'});
  p.x=BASES.red.x;p.y=BASES.red.y;
  step(room,100_000);
  p.x=BASES.blue.x;p.y=BASES.blue.y;
  step(room,100_100);
  assert.equal(room.scores.blue,1);
  assert.equal(room.mapId,'badlands');
  assert.equal(room.wrecks.length,0);
  assert.ok(room.bridges.every(b=>b.hp===b.maxHp));
  assert.ok(room.obstacles.filter(o=>o.kind==='building').every(o=>o.hp===o.maxHp));
});


test('W drives and flies along the vehicle nose instead of toward the top of the screen',()=>{
  const room=createRoom('HULL'),p=addPlayer(room,'pilot');clearTerrain(room);
  p.x=600;p.y=720;p.bodyAngle=-Math.PI/4;p.vx=0;p.vy=0;
  setInput(p,{type:'input',dx:0,dy:-1,aim:0,fire:false,driveMode:'classic'});
  runTicks(room,36);
  const dx=p.x-600, dy=p.y-720;
  assert.ok(dx>70 && dy<-70, `tank follows a diagonal nose dx=${dx} dy=${dy}`);
  assert.ok(Math.abs(dx+dy)<40, 'movement stays on the hull axis');
  assert.ok(Math.abs(p.bodyAngle+Math.PI/4)<0.05, 'W does not yaw the hull');

  const air=createRoom('NOSE'),h=addPlayer(air,'pilot');clearTerrain(air);
  h.type='heli';h.x=500;h.y=700;h.bodyAngle=0;h.vx=0;h.vy=0;h.fuel=100;
  setInput(h,{type:'input',dx:0,dy:-1,aim:0,fire:false,driveMode:'classic'});
  runTicks(air,40,220_000);
  assert.ok(h.x>680, `heli flies forward along its nose x=${h.x}`);
  assert.ok(Math.abs(h.y-700)<12, `heli does not climb the screen y=${h.y}`);
  h.x=500;h.y=700;h.vx=0;h.vy=0;h.bodyAngle=0;
  setInput(h,{type:'input',dx:1,dy:0,aim:0,fire:false,driveMode:'classic'});
  runTicks(air,40,230_000);
  assert.ok(h.y>880, `heli strafes to its right y=${h.y}`);
  assert.ok(Math.abs(h.x-500)<20, `strafe is perpendicular to the nose x=${h.x}`);

  const drones=createRoom('NOSED'),a=addPlayer(drones,'a');clearTerrain(drones);
  a.type='fpv';a.x=400;a.y=720;a.ammo=5;
  setInput(a,{type:'input',dx:0,dy:0,aim:Math.PI,fire:true,driveMode:'classic'});
  step(drones,240_000);
  const drone=drones.drones[0];
  assert.ok(drone, 'drone launches');
  const x0=drone.x,y0=drone.y;
  setInput(a,{type:'input',dx:0,dy:-1,aim:0,fire:false,driveMode:'classic'});
  runTicks(drones,20,240_040);
  assert.ok(drone.x<x0-80, `drone keeps its nose instead of turning up x=${drone.x}`);
  assert.ok(Math.abs(drone.y-y0)<30, `drone stays on heading y=${drone.y}`);
});

test('bridge collapse sinks vehicles standing on the deck but not a helicopter',()=>{
  const room=createRoom('SINK'),tank=addPlayer(room,'tank'),heli=addPlayer(room,'heli');clearTerrain(room);
  tank.type='tank';tank.x=1130;tank.y=258;tank.hp=130;
  heli.type='heli';heli.x=1210;heli.y=260;heli.hp=125;
  const arty=addPlayer(room,'artillery');arty.type='arty';arty.x=820;arty.y=260;arty.ammo=12;
  // Heavily damaged bridge needs only a final artillery hit.
  room.bridges[0].hp=95;room.bridges[0].stage=2;
  setInput(arty,{type:'input',dx:0,dy:0,aim:0,fire:true,targetX:1180,targetY:255});
  step(room,100_000);
  step(room,101_300);
  assert.equal(room.bridges[0].hp,0);
  assert.equal(tank.alive,false);
  assert.equal(heli.alive,true);
  assert.ok(room.wrecks.some(w=>w.type==='tank'));
});
