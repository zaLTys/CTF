// End-to-end protocol check against a running server: node tools/ws-smoke.mjs [port]
import { WebSocket } from 'ws';

const port = process.argv[2] || '3000';
const url = `ws://localhost:${port}`;
const fail = message => { console.error('FAIL', message); process.exit(1); };
const timer = setTimeout(() => fail('timed out'), 8000);

function open() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { origin: `http://localhost:${port}` });
    const inbox = [];
    let waiter = null;
    ws.on('message', raw => {
      const data = JSON.parse(raw.toString());
      if (waiter && waiter.test(data)) { const w = waiter; waiter = null; w.resolve(data); }
      else inbox.push(data);
    });
    ws.next = test => {
      const i = inbox.findIndex(test);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise(res => { waiter = { test, resolve: res }; });
    };
    ws.drain = () => { inbox.length = 0; };
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

const host = await open();
host.send(JSON.stringify({ type: 'create', mapId: 'delta' }));
const welcome = await host.next(d => d.type === 'welcome');
if (welcome.world.mapId !== 'delta' || welcome.team !== 'blue') fail('host welcome ' + JSON.stringify(welcome).slice(0, 200));
if (!welcome.world.types?.jeep?.range || welcome.world.bridges.length !== 2) fail('world payload incomplete');
const first = await host.next(d => d.type === 'state');
if (first.scenery.length < 90 || first.players.length !== 1) fail('initial snapshot');

const guest = await open();
guest.send(JSON.stringify({ type: 'join', code: welcome.code.toLowerCase() }));
const guestWelcome = await guest.next(d => d.type === 'welcome');
if (guestWelcome.team !== 'red' || guestWelcome.code !== welcome.code) fail('guest join');

const bad = await open();
bad.send(JSON.stringify({ type: 'join', code: 'ZZZZZ' }));
const err = await bad.next(d => d.type === 'error');
if (!/not found/i.test(err.message)) fail('missing room error');
bad.close();

host.send(JSON.stringify({ type: 'vehicle', vehicle: 'jeep' }));
await new Promise(r => setTimeout(r, 150));
host.send(JSON.stringify({ type: 'input', dx: 0, dy: 0, aim: 0, fire: false, mine: true, driveMode: 'classic' }));
await new Promise(r => setTimeout(r, 250));
host.drain(); guest.drain();
const hostView = await host.next(d => d.type === 'state' && d.mines.length > 0);
const guestView = await guest.next(d => d.type === 'state');
const hostSelf = hostView.players.find(p => p.id === welcome.id);
if (hostSelf.type !== 'jeep') fail('vehicle switch');
if (guestView.mines.length !== 0) fail('enemy received hidden mine positions');

host.send(JSON.stringify({ type: 'input', dx: 0, dy: -1, aim: 0, fire: false, mine: false, driveMode: 'classic' }));
await new Promise(r => setTimeout(r, 600));
host.drain();
const moved = (await host.next(d => d.type === 'state')).players.find(p => p.id === welcome.id);
if (Math.hypot(moved.vx, moved.vy) < 20) fail('jeep did not accelerate: ' + JSON.stringify(moved));

console.log(`OK room=${welcome.code} map=${welcome.world.mapName} mines(host)=${hostView.mines.length} mines(guest)=${guestView.mines.length} jeepSpeed=${Math.round(Math.hypot(moved.vx, moved.vy))}`);
clearTimeout(timer);
host.close(); guest.close();
