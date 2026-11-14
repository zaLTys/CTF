"""Optional developer preview utility: Python playwright + Chromium required."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import subprocess, json, base64
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
out=root/'previews'
out.mkdir(parents=True,exist_ok=True)
node_script='''
import { createRoom, addPlayer, snapshot, WIDTH, HEIGHT, BASES, MAPS, TYPES } from './game.js';
const room=createRoom('K7M2Q'), me=addPlayer(room,'player-1'), rival=addPlayer(room,'player-2');
const mapWorld=r=>({width:WIDTH,height:HEIGHT,bases:BASES, mapId:r.mapId, mapName:r.map.name, biome:r.map.biome, water:r.map.water, cover:r.map.cover, roads:r.map.roads, bridges:r.map.bridges, mud:r.map.mud, types:TYPES});
room.scores={blue:2,red:1};
const home=snapshot(room); const now=Date.now();
me.x=1190;me.y=620;me.angle=-0.16;me.type='tank';me.hp=185;me.fuel=67;me.ammo=26;
rival.x=1440;rival.y=690;rival.angle=Math.PI;rival.type='asv';rival.hp=190;rival.fuel=84;rival.ammo=11;
room.bullets=[{id:'b1',team:'blue',x:1310,y:665,kind:'tank',vx:600,vy:0},{id:'b2',team:'red',x:1400,y:678,kind:'asv',vx:-540,vy:0}];
room.explosions=[{id:'e1',x:1336,y:748,bornAt:now-180,until:now+450,scale:1.5}];
const battle=snapshot(room);
me.x=1030;me.y=850;me.angle=-.36;me.type='arty';me.hp=144;me.ammo=9;me.fuel=74;
rival.x=1570;rival.y=694;rival.type='tank';rival.angle=2.5;rival.hp=156;
room.strikes=[{id:'s1',team:'blue',ownerId:me.id,x:1560,y:725,launchedAt:now-420,impactAt:now+750,radius:115}];
room.bullets=[];room.explosions=[];
const artillery=snapshot(room);
me.x=705;me.y=720;me.angle=0;me.type='fpv';me.hp=103;me.fuel=91;me.ammo=3;
rival.x=1195;rival.y=705;rival.type='tank';rival.angle=Math.PI;rival.hp=191;
room.strikes=[];room.drones=[{id:'drone1',team:'blue',ownerId:me.id,x:1105,y:710,angle:.1,expiresAt:now+4900,bornAt:now-2000}];
room.explosions=[{id:'e2',x:1270,y:670,bornAt:now-90,until:now+550,scale:1.1}];
const fpv=snapshot(room);
me.x=710;me.y=470;me.type='tank';me.angle=-.4;me.bodyAngle=.5;me.vx=158;me.vy=32;me.surface='grass';me.hp=185;me.ammo=29;me.fuel=71;
rival.x=960;rival.y=500;rival.type='asv';rival.angle=3.1;rival.bodyAngle=3.1;rival.vx=-42;rival.vy=0;rival.hp=170;
room.drones=[];room.strikes=[];
let nearby=room.scenery.filter(o=>o.kind==='tree'&&o.x>540&&o.x<980&&o.y>235&&o.y<625);
for(let i=0;i<nearby.length;i++)if(i%4===0)nearby[i].hp=0;else if(i%5===0)nearby[i].hp=nearby[i].maxHp*.34;
room.trails=[{x:660,y:470,angle:.4,type:'track',bornAt:now-150},{x:686,y:467,angle:.4,type:'skid',bornAt:now-120},
 ...nearby.filter(o=>o.hp===0).map(o=>({x:o.x,y:o.y,angle:o.rot/180*Math.PI,type:'fall',bornAt:now-300}))];
room.craters=[{x:820,y:365,r:46,bornAt:now-350},{x:882,y:480,r:33,bornAt:now-120}];
room.explosions=[{id:'forest-blast',x:825,y:366,bornAt:now-180,until:now+470,scale:1.3}];
room.bullets=[{id:'forest-shell',team:'blue',x:788,y:442,kind:'tank',vx:540,vy:-90}];
const forest=snapshot(room);
// Representative gameplay frames for the new build (not a claim of live multiplayer play).
me.x=1190;me.y=265;me.type='tank';me.bodyAngle=0;me.angle=-.2;me.hp=165;me.fuel=81;
rival.x=1430;rival.y=342;rival.type='asv';rival.angle=Math.PI;
room.bullets=[];room.explosions=[];room.trails=[];room.craters=[];
room.bridges[0].hp=180;room.bridges[0].stage=1;
const bridge=structuredClone(snapshot(room));
room.bridges[0].hp=0;room.bridges[0].stage=3;room.bridges[0].collapsedAt=now-200;
me.x=910;me.y=328;
room.obstacles.filter(o=>o.kind==='building').forEach((o,i)=>{o.hp=i%2===0?0:65;o.stage=i%2===0?3:2;});
room.wrecks=[{id:'wreck1',team:'red',type:'tank',x:1140,y:385,angle:.4,radius:24,hp:95,maxHp:110,bornAt:now-3600},
 {id:'wreck2',team:'blue',type:'jeep',x:960,y:350,angle:-.6,radius:20,hp:0,maxHp:110,bornAt:now-2400}];
room.craters=[{x:1205,y:240,r:54,bornAt:now-400},{x:1070,y:350,r:34,bornAt:now-200}];
room.explosions=[{id:'boom2',x:1185,y:264,bornAt:now-220,until:now+460,scale:1.75}];
const destruction=structuredClone(snapshot(room));
const deltaRoom=createRoom('K7M2Q','delta'),dm=addPlayer(deltaRoom,'player-1'),de=addPlayer(deltaRoom,'player-2');
dm.type='heli';dm.x=1140;dm.y=510;dm.angle=-.7;dm.bodyAngle=-.3;dm.hp=102;
de.x=1380;de.y=565;de.angle=2.4;de.type='tank';
deltaRoom.bridges[0].hp=82;deltaRoom.bridges[0].stage=2;
const delta={world:mapWorld(deltaRoom),state:structuredClone(snapshot(deltaRoom))};
const desertRoom=createRoom('K7M2Q','badlands'),bm=addPlayer(desertRoom,'player-1'),be=addPlayer(desertRoom,'player-2');
bm.x=1060;bm.y=420;bm.type='asv';bm.angle=-.55;bm.bodyAngle=-.4;bm.hp=225;
be.x=1290;be.y=475;be.type='tank';be.angle=Math.PI;be.bodyAngle=Math.PI;
desertRoom.bridges[0].hp=0;desertRoom.bridges[0].stage=3;
desertRoom.wrecks.push({id:'wreckBad',team:'red',type:'tank',x:890,y:370,angle:.2,radius:24,hp:88,maxHp:110,bornAt:now-2500});
const badlands={world:mapWorld(desertRoom),state:structuredClone(snapshot(desertRoom))};
console.log(JSON.stringify({world:mapWorld(room),home,battle,artillery,fpv,forest,bridge,destruction,delta,badlands}));
'''
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',node_script],cwd=root,text=True))
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(root/'public'),**kw)
server=ThreadingHTTPServer(('127.0.0.1',0),QuietHandler)
Thread(target=server.serve_forever,daemon=True).start()
port=server.server_address[1]
assets={f.stem:'data:image/svg+xml;base64,'+base64.b64encode(f.read_bytes()).decode() for f in (root/'public'/'assets').glob('*.svg')}
stub='''
history.replaceState=()=>{};
window.__assets=__ASSETS__;
window.__fixture=__FIXTURE__;
class PreviewSocket{
 static OPEN=1;
 constructor(){this.readyState=1;window.__socket=this;setTimeout(()=>this.onopen?.(),20);}
 send(raw){const q=JSON.parse(raw);
  if(q.type==='create'||q.type==='join'){
   this.onmessage?.({data:JSON.stringify({type:'welcome',id:'player-1',team:'blue',code:'K7M2Q',world:window.__fixture.world})});
   this.emit(window.__fixture.home);
  }
  if(q.type==='vehicle')this.lastChoice=q.vehicle;
 }
 emit(s){s=JSON.parse(JSON.stringify(s));s.time=Date.now();if(s.drones?.length){s.drones.forEach(d=>d.expiresAt=Date.now()+5800)};if(s.strikes?.length){s.strikes.forEach(d=>d.impactAt=Date.now()+900)};this.onmessage?.({data:JSON.stringify(s)});}
 close(){this.readyState=3;this.onclose?.();}
}
window.WebSocket=PreviewSocket;
'''.replace('__FIXTURE__',json.dumps(fixture)).replace('__ASSETS__',json.dumps(assets))

html=(root/'public'/'index.html').read_text().replace('<link rel="stylesheet" href="/style.css">','<style>'+ (root/'public'/'style.css').read_text()+'</style>')
client=(root/'public'/'client.js').read_text().replace('img.src = `/assets/${team}-${type}.svg`;', 'img.src = window.__assets[`${team}-${type}`];')
html=html.replace('<script src="/client.js" defer></script>','').replace('</body>','<script>'+client+'</script></body>')
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 def page_for(viewport,mobile=False):
  context=browser.new_context(viewport=viewport,device_scale_factor=1,is_mobile=mobile,has_touch=mobile)
  pg=context.new_page();pg.add_init_script(script=stub);errs=[]
  pg.on('pageerror',lambda e: errs.append(str(e)))
  pg.evaluate('(function(){'+stub+'})()')
  pg.set_content(html,wait_until='load')
  return context,pg,errs
 ctx,page,errs=page_for({'width':1440,'height':900})
 page.wait_for_timeout(300)
 page.screenshot(path=str(out/'01-lobby-desktop.png'))
 page.locator('#createBtn').click()
 page.locator('#hud:not(.hidden)').wait_for(timeout=3000)
 page.wait_for_function("Object.values(sprites).every(i=>i.complete && i.naturalWidth>0)",timeout=10000)
 page.wait_for_timeout(280)
 page.evaluate("document.getElementById('toast').style.display='none'")
 page.screenshot(path=str(out/'02-base-desktop.png'))
 page.evaluate('window.__socket.emit(window.__fixture.battle)')
 page.wait_for_timeout(120)
 page.screenshot(path=str(out/'03-battle-desktop.png'))
 page.evaluate('window.__socket.emit(window.__fixture.artillery)')
 page.wait_for_timeout(120)
 page.screenshot(path=str(out/'04-artillery-desktop.png'))
 page.evaluate('window.__socket.emit(window.__fixture.fpv)')
 page.wait_for_timeout(120)
 page.screenshot(path=str(out/'05-fpv-desktop.png'))
 page.evaluate('window.__socket.emit(window.__fixture.forest)')
 page.wait_for_timeout(135)
 page.screenshot(path=str(out/'09-forest-destruction-desktop.png'))
 page.evaluate('window.__socket.emit(window.__fixture.bridge)')
 page.wait_for_timeout(130)
 page.screenshot(path=str(out/'11-bridge-damaged-desktop.png'))
 page.evaluate('window.__socket.emit(window.__fixture.destruction)')
 page.wait_for_timeout(135)
 page.screenshot(path=str(out/'12-collapse-wrecks-desktop.png'))
 page.evaluate('world=window.__fixture.delta.world; background=buildBackground();document.getElementById("roomLabel").textContent=`ROOM K7M2Q · ${world.mapName}`;window.__socket.emit(window.__fixture.delta.state)')
 page.wait_for_timeout(160)
 page.screenshot(path=str(out/'13-delta-desktop.png'))
 page.evaluate('world=window.__fixture.badlands.world; background=buildBackground();document.getElementById("roomLabel").textContent=`ROOM K7M2Q · ${world.mapName}`;window.__socket.emit(window.__fixture.badlands.state)')
 page.wait_for_timeout(160)
 page.screenshot(path=str(out/'14-badlands-desktop.png'))
 print('desktop errors',errs)
 ctx.close()
 ctx,phone,errs=page_for({'width':844,'height':390},True)
 phone.wait_for_timeout(200)
 phone.screenshot(path=str(out/'06-lobby-mobile.png'))
 phone.locator('#createBtn').click(force=True)
 phone.locator('#hud:not(.hidden)').wait_for(timeout=3000)
 phone.wait_for_function("Object.values(sprites).every(i=>i.complete && i.naturalWidth>0)",timeout=10000)
 phone.evaluate("document.getElementById('toast').style.display='none'")
 phone.evaluate('window.__socket.emit(window.__fixture.fpv)')
 phone.wait_for_timeout(160)
 phone.screenshot(path=str(out/'07-fpv-mobile.png'))
 phone.evaluate('window.__socket.emit(window.__fixture.artillery)')
 phone.wait_for_timeout(160)
 phone.screenshot(path=str(out/'08-artillery-mobile.png'))
 phone.evaluate('window.__socket.emit(window.__fixture.forest)')
 phone.wait_for_timeout(150)
 phone.screenshot(path=str(out/'10-forest-destruction-mobile.png'))
 phone.evaluate('window.__socket.emit(window.__fixture.destruction)')
 phone.wait_for_timeout(140)
 phone.screenshot(path=str(out/'15-collapse-wrecks-mobile.png'))
 phone.evaluate('world=window.__fixture.badlands.world; background=buildBackground();document.getElementById("roomLabel").textContent=`ROOM K7M2Q · ${world.mapName}`;window.__socket.emit(window.__fixture.badlands.state)')
 phone.wait_for_timeout(160)
 phone.screenshot(path=str(out/'16-badlands-mobile.png'))
 print('mobile errors',errs)
 ctx.close();browser.close()
server.shutdown()
for f in out.glob('*.png'):print(f.name,f.stat().st_size)
