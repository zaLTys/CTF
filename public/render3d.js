import * as THREE from 'three';

// World units map 1:1 onto three.js units: world (x, y) is scene (x, 0, y), and a
// world heading `a` is a rotation of -a around the vertical axis.
const HQ_ROOF = [46, 46, 32];
const TEAM = {
  blue: { body: 0x3e7e92, trim: 0x9adbe9, dark: 0x22424f, flag: 0x68c8db },
  red: { body: 0x9c4b3c, trim: 0xf4ab93, dark: 0x5b2a22, flag: 0xf17f6c },
};
const ALTITUDE = { heli: 58 };
const DRONE_ALTITUDE = 34;
const PITCH = 0.98;
const coarse = matchMedia('(pointer: coarse)').matches;
// Must match ArtyDeployMs / ArtyPackMs in sim/game.go.
export const ARTY_DEPLOY_MS = 1800, ARTY_PACK_MS = 1400;
const ARTY_SPOT_MS = 9000;
const SEA_FLOOR = 0x163a42, SEA_SPAN = 14000;

const smoothstep = t => t * t * (3 - 2 * t);
// 0 = limbered and mobile, 1 = fully planted.
export function deployProgress(p, serverNow) {
  if (p.deploy === 'deployed') return 1;
  if (p.deploy === 'deploying') return Math.max(0, Math.min(1, 1 - (p.deployUntil - serverNow) / ARTY_DEPLOY_MS));
  if (p.deploy === 'packing') return Math.max(0, Math.min(1, (p.deployUntil - serverNow) / ARTY_PACK_MS));
  return 0;
}

// Cel shading: three flat light bands instead of smooth PBR falloff.
const TOON_RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([125, 125, 125, 255, 195, 195, 195, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const toon = (opts = {}) => new THREE.MeshToonMaterial({ gradientMap: TOON_RAMP, ...opts });

const materials = new Map();
function mat(color, { rough = .82, metal = .06, emissive = 0, opacity = 1, basic = false } = {}) {
  const key = [color, emissive, opacity, basic].join('|');
  if (!materials.has(key)) {
    const transparent = opacity < 1;
    materials.set(key, basic
      ? new THREE.MeshBasicMaterial({ color, transparent, opacity, depthWrite: !transparent })
      : toon({ color, emissive, emissiveIntensity: emissive ? .55 : 1, transparent, opacity }));
  }
  return materials.get(key);
}

// Ink outlines (inverted hull): a black back-face shell slightly larger than the mesh.
const OUTLINE = 1.25;
const INK = new THREE.MeshBasicMaterial({ color: 0x17191c, side: THREE.BackSide });
function outline(mesh, thickness = OUTLINE) {
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new THREE.Vector3()), center = geo.boundingBox.getCenter(new THREE.Vector3());
  const shell = new THREE.Mesh(geo, INK);
  thickness = Math.min(thickness, Math.max(.3, Math.min(size.x, size.y, size.z) * .3));
  const k = n => (Math.max(n, .5) + 2 * thickness) / Math.max(n, .5);
  shell.scale.set(k(size.x), k(size.y), k(size.z));
  shell.position.copy(center).multiply(new THREE.Vector3(1 - shell.scale.x, 1 - shell.scale.y, 1 - shell.scale.z));
  shell.userData.ink = true;
  mesh.add(shell);
  return mesh;
}
function shadowed(mesh, cast = true) {
  mesh.castShadow = cast; mesh.receiveShadow = true;
  const m = mesh.material;
  if (m && !m.transparent && !m.isMeshBasicMaterial) outline(mesh);
  return mesh;
}
// Grow a geometry about its own centre, for outlining instanced meshes.
function inflated(geo, factor) {
  const g = geo.clone();
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z); g.scale(factor, factor, factor); g.translate(c.x, c.y, c.z);
  return g;
}
// Concatenate non-indexed position/normal data so several shapes share one draw call.
function mergeShapes(geos) {
  const parts = geos.map(g => g.index ? g.toNonIndexed() : g);
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let at = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3);
    at += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
  m.position.set(x, y, z);
  return m;
}
function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, segments = 22) {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material));
  m.position.set(x, y, z);
  return m;
}
function wheel(material, x, z, r = 5, w = 4, hub = null) {
  const m = cyl(r, r, w, material, x, r, z, 20);
  m.rotation.x = Math.PI / 2;
  if (hub) m.add(cyl(r * .48, r * .48, w + .8, hub, 0, 0, 0, 12), cyl(r * .2, r * .2, w + 1.6, material, 0, 0, 0, 8));
  return m;
}
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

function buildVehicle(type, team, charred = false) {
  const c = TEAM[team] || TEAM.blue;
  const body = charred ? mat(0x2b2724, { rough: 1 }) : mat(c.body, { rough: .62, metal: .28 });
  const trim = charred ? mat(0x3a332d, { rough: 1 }) : mat(c.trim, { rough: .5, metal: .2 });
  const dark = charred ? mat(0x1c1a18, { rough: 1 }) : mat(0x262b28, { rough: .9 });
  const glass = charred ? dark : mat(0x9fc6cf, { rough: .15, metal: .5 });
  const g = new THREE.Group();
  const parts = { group: g, turret: null, rotor: null, tailRotor: null };
  const hub = charred ? dark : mat(0x9aa39f, { rough: .45, metal: .5 });
  const lamp = charred ? dark : mat(0xfff0bd, { basic: true });
  const tail = charred ? dark : mat(0xd8473a, { basic: true });
  const lights = (x, y, zs, r = 1.6) => { for (const z of zs) g.add(cyl(r, r, 1.2, lamp, x, y, z, 12).rotateZ(Math.PI / 2)); };
  const tailLights = (x, y, zs) => { for (const z of zs) g.add(box(.8, 1.6, 3, tail, x, y, z)); };
  if (type === 'tank') {
    g.add(box(50, 12, 30, body, 0, 11, 0));
    g.add(box(54, 11, 9, dark, 0, 6, 15.5), box(54, 11, 9, dark, 0, 6, -15.5));
    for (const side of [1, -1]) {
      for (const x of [-20, -10, 0, 10, 20]) g.add(wheel(dark, x, side * 20.4, 4, 1.6, hub));
      g.add(box(54, 2, 10.5, body, 0, 12.2, side * 15.5));
      g.add(cyl(1.5, 1.5, 6, dark, -27, 14, side * 9, 10).rotateZ(Math.PI / 2));
      g.add(box(4, 3, 3, dark, 27.5, 6, side * 13));
    }
    const glacis = box(10, 4, 28, body, 25, 15, 0); glacis.rotation.z = -.5; g.add(glacis);
    lights(28, 13.5, [11, -11]); tailLights(-25.2, 14, [12, -12]);
    g.add(box(14, 1.2, 20, dark, -17, 17.4, 0), box(12, 1.4, 2, hub, -17, 18, 0));
    const turret = new THREE.Group(); turret.position.set(-3, 17, 0);
    turret.add(cyl(12, 13.5, 9, body, 0, 4.5, 0), cyl(12.3, 12.3, 1.6, trim, 0, 7.4, 0));
    turret.add(box(7, 7, 11, body, 12.5, 5, 0), box(28, 3.6, 3.6, dark, 28, 5, 0), box(5, 4.8, 4.8, dark, 42, 5, 0));
    turret.add(box(8, 6, 20, dark, -13, 4.5, 0));
    turret.add(cyl(3.8, 4.2, 3, trim, -3, 10.5, 4.5), cyl(3.4, 3.4, 1, dark, -3, 12.4, 4.5));
    turret.add(cyl(1.6, 1.6, 3, dark, 2, 10, -6), cyl(.35, .35, 24, dark, -9, 21, -7, 6));
    g.add(turret); parts.turret = turret;
  } else if (type === 'jeep') {
    g.add(box(34, 8, 20, body, 0, 10, 0), box(12, 5, 19, body, 12, 15, 0), box(2, 7, 18, glass, 5, 17, 0));
    g.add(box(2.4, 1.2, 19, dark, 5, 21, 0), box(.6, 4.2, 9, dark, 18.3, 13, 0));
    g.add(box(2.2, 3, 23, dark, 18.5, 7.5, 0), box(2.2, 3, 23, dark, -18, 7.5, 0));
    lights(18.5, 14.5, [7, -7]); tailLights(-17.2, 12, [8, -8]);
    for (const [x, z] of [[11, 11], [11, -11], [-11, 11], [-11, -11]]) g.add(box(11, 1.4, 4.5, body, x, 14.6, z));
    for (const z of [5, -5]) g.add(box(6, 2, 6, dark, -3, 15, z), box(2, 7, 6, dark, -6, 18, z));
    for (const z of [8.5, -8.5]) g.add(cyl(.8, .8, 11, dark, -11, 19.5, z, 8));
    g.add(box(1.6, 1.6, 18.5, dark, -11, 25, 0));
    const spare = wheel(dark, 0, 0, 4.5, 3, hub);
    spare.rotation.set(0, 0, Math.PI / 2); spare.position.set(-20.5, 12, 0); g.add(spare);
    g.add(cyl(.3, .3, 22, dark, -15, 24, 8.5, 6));
    parts.wheels = [[11, 11], [11, -11], [-11, 11], [-11, -11]].map(([x, z]) => {
      const w = wheel(dark, x, z, 5, 4, hub); w.userData.z = z; g.add(w); return w;
    });
    const turret = new THREE.Group(); turret.position.set(-6, 15, 0);
    turret.add(cyl(4, 5, 4, dark, 0, 2, 0), box(14, 3, 3, trim, 7, 5, 0), box(4, 2, 2, dark, 15, 5, 0));
    turret.add(box(1.4, 6, 8, trim, 3, 6, 0), box(4, 4, 5, dark, -1, 5, 4.5));
    g.add(turret); parts.turret = turret;
    if (!charred) {
      const wake = new THREE.Mesh(new THREE.CircleGeometry(1, 3), mat(0xe9f4ef, { opacity: .5, basic: true }));
      wake.rotation.x = -Math.PI / 2; wake.scale.set(30, 13, 1); wake.position.x = -22; wake.visible = false;
      g.add(wake); parts.wake = wake;
    }
  } else if (type === 'heli') {
    const hull = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(8, 20, 6, 16), body));
    hull.rotation.z = Math.PI / 2; g.add(hull);
    const bubble = shadowed(new THREE.Mesh(new THREE.SphereGeometry(7, 18, 12), glass));
    bubble.scale.set(1.25, .85, .95); bubble.position.set(12, 2.5, 0); g.add(bubble);
    g.add(cyl(8.3, 8.3, 3, trim, -6, 0, 0).rotateZ(Math.PI / 2));
    g.add(box(16, 5, 11, body, -3, 8.5, 0), cyl(1.6, 1.6, 4, dark, -12, 9, 4, 10).rotateZ(Math.PI / 2), cyl(1.6, 1.6, 4, dark, -12, 9, -4, 10).rotateZ(Math.PI / 2));
    g.add(cyl(2.2, 1.2, 32, body, -26, 2, 0).rotateZ(Math.PI / 2), box(7, 12, 1.6, body, -40, 7, 0), box(5, 1, 15, body, -34, 2.5, 0));
    g.add(box(30, 1.5, 2, dark, 0, -10, 9), box(30, 1.5, 2, dark, 0, -10, -9));
    for (const x of [-7, 7]) for (const z of [8, -8]) g.add(cyl(.7, .7, 6, dark, x, -7, z, 8));
    g.add(box(4, 1.2, 28, body, -2, -1.5, 0));
    for (const z of [12.5, -12.5]) g.add(cyl(2.2, 2.2, 11, dark, 0, -4.2, z, 12).rotateZ(Math.PI / 2), cyl(1.6, 1.6, 1.2, hub, 6, -4.2, z, 10).rotateZ(Math.PI / 2));
    const rotor = new THREE.Group(); rotor.position.y = 11;
    rotor.add(box(94, .8, 4, dark), box(4, .8, 94, dark), cyl(3, 3, 2.4, hub, 0, .6, 0), cyl(1.4, 1.4, 4, dark, 0, -2, 0));
    g.add(rotor); parts.rotor = rotor;
    const tailRotor = new THREE.Group(); tailRotor.position.set(-41, 7, 2);
    tailRotor.add(box(1, 16, 2, dark), box(1, 2, 16, dark)); g.add(tailRotor); parts.tailRotor = tailRotor;
    const turret = new THREE.Group(); turret.position.set(17, -6, 0);
    turret.add(cyl(2.5, 2.5, 3, dark, 0, 1, 0), box(10, 2.4, 2.4, dark, 5, 0, 0)); g.add(turret); parts.turret = turret;
  } else if (type === 'asv') {
    g.add(box(56, 9, 30, body, 0, 11, 0), box(15, 14, 28, body, 22, 21, 0), box(2, 7, 24, glass, 29.6, 23, 0));
    g.add(box(2.4, 4, 32, dark, 29.5, 8.5, 0), box(6, 1.6, 9, dark, 20, 28.8, 0));
    lights(29.8, 16.5, [11, -11]); tailLights(-28.2, 13, [12, -12]);
    for (const z of [15.4, -15.4]) g.add(box(48, 3, 1.2, trim, -3, 14, z), box(2, 4, 1, dark, 26, 25, z * 1.02));
    for (const x of [-18, 0, 18]) g.add(wheel(dark, x, 15, 6, 5, hub), wheel(dark, x, -15, 6, 5, hub));
    g.add(cyl(1.2, 1.2, 12, dark, 13, 22, 12.5, 8));
    g.add(box(16, 5, 16, dark, -9, 17, 0));
    const pod = new THREE.Group(); pod.position.set(-9, 20, 0); pod.rotation.z = .22;
    pod.add(box(30, 13, 24, trim), box(30.4, 2, 24.4, body, 0, 4, 0));
    for (const z of [-7, 0, 7]) for (const y of [-3, 3]) pod.add(cyl(2.3, 2.3, 2, dark, 15.5, y, z).rotateZ(Math.PI / 2));
    g.add(pod);
  } else if (type === 'arty') {
    g.add(box(46, 9, 30, body, 0, 11, 0), box(12, 13, 28, body, -20, 20, 0));
    g.add(box(8, 4, .6, glass, -20, 23, 14.2), box(8, 4, .6, glass, -20, 23, -14.2));
    lights(23.2, 13, [11, -11]); tailLights(-26.2, 16, [11, -11]);
    for (const z of [15.6, -15.6]) g.add(box(10, 4, 1.6, dark, 6, 13, z), box(40, 1.6, 1.4, trim, 0, 16, z));
    for (const x of [-16, 0, 16]) g.add(wheel(dark, x, 15, 6, 5, hub), wheel(dark, x, -15, 6, 5, hub));
    const turret = new THREE.Group(); turret.position.set(6, 17, 0);
    turret.add(cyl(11, 12, 6, trim, 0, 3, 0), box(3, 11, 22, body, 9, 9, 0), box(8, 6, 10, body, 2, 9, 0));
    const gun = new THREE.Group(); gun.position.set(4, 10, 0); gun.rotation.z = .42;
    gun.add(cyl(2.6, 3.8, 52, dark, 28, 0, 0).rotateZ(-Math.PI / 2), box(6, 6.5, 6.5, dark, 55, 0, 0));
    for (const z of [3.2, -3.2]) gun.add(cyl(1.4, 1.4, 18, hub, 10, 3.6, z, 10).rotateZ(-Math.PI / 2));
    turret.add(gun);
    g.add(turret); parts.turret = turret;
    parts.legs = [1, -1].map(side => {
      const leg = new THREE.Group(); leg.position.set(-20, 7, side * 7); leg.userData.side = side;
      leg.add(box(30, 4, 5, dark, -15, 0, 0), box(5, 7, 12, trim, -30, -3, 0));
      g.add(leg);
      return leg;
    });
  } else if (type === 'fpv') {
    g.add(box(40, 9, 24, body, 0, 10, 0), box(14, 12, 23, body, 12, 19, 0), box(2, 6, 20, glass, 19.4, 21, 0));
    g.add(box(2.2, 3, 26, dark, 20.5, 7.5, 0), box(2.5, 1.6, 14, mat(charred ? 0x1c1a18 : 0xffd166, { basic: true }), 12, 25.8, 0));
    lights(20.6, 13, [8, -8]); tailLights(-20.2, 12, [9, -9]);
    for (const [x, z] of [[13, 12], [13, -12], [-13, 12], [-13, -12]]) g.add(wheel(dark, x, z, 5, 4, hub));
    g.add(cyl(.9, .9, 34, dark, -10, 31, 7), cyl(7, 3, 2, trim, -10, 48, 7), cyl(.3, .3, 12, dark, -10, 54, 7, 6));
    g.add(cyl(.3, .3, 16, dark, -18, 22, -10, 6));
    g.add(box(16, 6, 16, trim, -8, 17, -4), box(8, 5, 8, dark, -15, 16.5, 7));
    const drone = new THREE.Group(); drone.position.set(-8, 20.6, -4);
    for (const r of [Math.PI / 4, -Math.PI / 4]) { const arm = box(14, .8, 1.4, dark); arm.rotation.y = r; drone.add(arm); }
    for (const [x, z] of [[5, 5], [5, -5], [-5, 5], [-5, -5]]) drone.add(cyl(2.4, 2.4, .4, hub, x, .8, z, 12));
    drone.add(box(4, 1.6, 4, body, 0, .6, 0));
    g.add(drone);
  } else {
    g.add(box(40, 12, 26, body, 0, 10, 0));
  }
  return parts;
}

function buildDrone(team) {
  const c = TEAM[team] || TEAM.blue;
  const g = new THREE.Group();
  const frame = mat(0x22282a, { rough: .6 });
  const arm1 = box(26, 1.5, 2.5, frame); arm1.rotation.y = Math.PI / 4;
  const arm2 = box(26, 1.5, 2.5, frame); arm2.rotation.y = -Math.PI / 4;
  g.add(arm1, arm2, box(9, 4, 7, mat(c.body, { rough: .5, metal: .3 })));
  const props = [];
  for (const [x, z] of [[9, 9], [9, -9], [-9, 9], [-9, -9]]) {
    const p = cyl(5.5, 5.5, .6, mat(0xd8e2c8, { opacity: .45, basic: true }), x, 2, z);
    g.add(p); props.push(p);
  }
  g.add(box(3, 2, 3, mat(0xff5a3c, { emissive: 0xff3a1c }), 5, 2.5, 0));
  return { group: g, props };
}

function labelSprite() {
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 48;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(64, 19.2, 1); sprite.renderOrder = 10;
  sprite.userData = { canvas, texture, key: '' };
  return sprite;
}
function paintLabel(sprite, text, color, hpFrac) {
  const key = `${text}|${color}|${Math.round(hpFrac * 40)}`;
  if (sprite.userData.key === key) return;
  sprite.userData.key = key;
  const { canvas, texture } = sprite.userData, g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.font = '900 19px system-ui'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#0d1a15cc';
  g.strokeText(text, 80, 19); g.fillStyle = color; g.fillText(text, 80, 19);
  g.fillStyle = '#162922dd'; g.fillRect(24, 28, 112, 10);
  g.fillStyle = color; g.fillRect(26, 30, 108 * Math.max(0, Math.min(1, hpFrac)), 6);
  texture.needsUpdate = true;
}

function ringMesh(inner, outer, color, opacity = .8) {
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), mat(color, { opacity, basic: true }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
  return m;
}
function setRing(m, radius, width) {
  m.geometry.dispose();
  m.geometry = new THREE.RingGeometry(Math.max(0, radius - width), radius, 72);
}
function stripMesh(color, opacity = .7) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(color, { opacity, basic: true }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
  return m;
}
function placeStrip(m, x0, y0, x1, y1, width, height = 1.2) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  m.position.set((x0 + x1) / 2, height, (y0 + y1) / 2);
  m.scale.set(len, width, 1);
  m.rotation.set(-Math.PI / 2, 0, -Math.atan2(y1 - y0, x1 - x0));
}

// Keeps one scene object per server entity id and recycles the rest.
class Pool {
  constructor(parent, create) { this.parent = parent; this.create = create; this.live = new Map(); }
  sync(items, keyOf, update) {
    const seen = new Set();
    for (const item of items) {
      const key = keyOf(item);
      seen.add(key);
      let obj = this.live.get(key);
      if (!obj) { obj = this.create(item); this.parent.add(obj); this.live.set(key, obj); }
      update(obj, item);
    }
    for (const [key, obj] of this.live) {
      if (!seen.has(key)) { this.parent.remove(obj); this.live.delete(key); }
    }
  }
  clear() { for (const obj of this.live.values()) this.parent.remove(obj); this.live.clear(); }
}

export class Renderer3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 10, 6000);
    this.yaw = 0;
    this.distance = 620;
    this.focus = new THREE.Vector3(1200, 0, 720);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.lastTime = 0;
    this.setupLights();
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xdfeaff, 0x4b5a3b, 1.35);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    this.sun.castShadow = true;
    const size = coarse ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }

  resize(width, height, dpr) {
    this.renderer.setPixelRatio(Math.min(dpr, coarse ? 1.5 : 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.width = width; this.height = height;
  }

  baseDistance() {
    const portrait = this.height > this.width;
    return coarse ? (portrait ? 760 : 600) : 560;
  }

  setWorld(world, selfTeam) {
    this.world = world; this.selfTeam = selfTeam;
    if (this.root) this.scene.remove(this.root);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const sky = world.biome === 'arid' ? 0xc9b99a : world.biome === 'wetlands' ? 0x9fb8b0 : 0xa9bcb4;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 900, 2600);
    this.yaw = selfTeam === 'red' ? Math.PI : 0;
    this.buildGround(world);
    this.buildBases(world);
    this.dynamic = new THREE.Group(); this.root.add(this.dynamic);
    this.obstacles = new Pool(this.dynamic, o => this.makeObstacle(o));
    this.bridges = new Pool(this.dynamic, b => this.makeBridge(b));
    this.turrets = new Pool(this.dynamic, t => this.makeTurret(t));
    this.wrecks = new Pool(this.dynamic, w => this.makeWreck(w));
    this.vehicles = new Pool(this.dynamic, p => this.makeVehicle(p));
    this.drones = new Pool(this.dynamic, d => { const g = new THREE.Group(); const m = buildDrone(d.team); g.add(m.group); g.userData = m; return g; });
    this.bulletPool = new Pool(this.dynamic, b => this.makeBullet(b));
    this.explosionPool = new Pool(this.dynamic, () => this.makeExplosion());
    this.craterPool = new Pool(this.dynamic, () => this.makeCrater());
    this.minePool = new Pool(this.dynamic, m => this.makeMine(m));
    this.strikePool = new Pool(this.dynamic, () => ringMesh(0, 1, 0xffd58b, .75));
    this.flags = {};
    for (const team of ['blue', 'red']) { this.flags[team] = this.makeFlag(team); this.dynamic.add(this.flags[team]); }
    this.buildScenery();
    this.buildTrails();
    this.buildOverlays();
  }

  buildGround(world) {
    const texture = new THREE.CanvasTexture(paintGround(world));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(world.width, world.height),
      new THREE.MeshStandardMaterial({ map: texture, roughness: .95, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(world.width / 2, 0, world.height / 2);
    ground.receiveShadow = true;
    this.root.add(ground);
    // Open sea floor beyond the painted terrain; must match SEA_FLOOR painted in paintGround.
    const seabed = new THREE.Mesh(new THREE.PlaneGeometry(SEA_SPAN, SEA_SPAN), new THREE.MeshStandardMaterial({ color: SEA_FLOOR, roughness: .95, metalness: 0 }));
    seabed.rotation.x = -Math.PI / 2; seabed.position.set(world.width / 2, -.5, world.height / 2);
    this.root.add(seabed);

    this.waterTexture = rippleTexture();
    this.waterTexture.wrapS = this.waterTexture.wrapT = THREE.RepeatWrapping;
    const water = new THREE.MeshStandardMaterial({ color: 0x2f6f78, roughness: .12, metalness: .25, transparent: true, opacity: .78, map: this.waterTexture });
    // Rivers draw first and write depth, so the sea plane just below never doubles up over them.
    for (const w of world.water) {
      const x0 = Math.max(0, w.x), y0 = Math.max(0, w.y), x1 = Math.min(world.width, w.x + w.w), y1 = Math.min(world.height, w.y + w.h);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), water);
      plane.rotation.x = -Math.PI / 2; plane.position.set((x0 + x1) / 2, .8, (y0 + y1) / 2);
      plane.receiveShadow = true; plane.renderOrder = 1;
      this.root.add(plane);
    }
    if (world.coast?.length) {
      this.seaTexture = this.waterTexture.clone();
      this.seaTexture.repeat.set(1 / 300, 1 / 300);
      this.seaTexture.needsUpdate = true;
      const half = SEA_SPAN / 2, cx = world.width / 2, cy = world.height / 2;
      // Shape space is (x, -y) so that rotating the mesh flat lands it on world (x, y).
      const sea = new THREE.Shape([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => new THREE.Vector2(cx + sx * half, -(cy + sy * half))));
      sea.holes.push(new THREE.Path(world.coast.map(p => new THREE.Vector2(p.x, -p.y))));
      const plane = new THREE.Mesh(new THREE.ShapeGeometry(sea),
        new THREE.MeshStandardMaterial({ color: 0x2b6a75, roughness: .1, metalness: .25, transparent: true, opacity: .82, map: this.seaTexture }));
      plane.rotation.x = -Math.PI / 2; plane.position.y = .5;
      plane.receiveShadow = true; plane.renderOrder = 2;
      this.root.add(plane);
    }
  }

  buildBases(world) {
    for (const [team, base] of Object.entries(world.bases)) {
      const c = TEAM[team];
      const post = mat(0x59605a, { rough: .7, metal: .3 });
      for (const [dx, dy] of [[-150, -140], [150, -140], [-150, 140], [150, 140]]) {
        this.root.add(cyl(2.5, 3, 70, post, base.x + dx, 35, base.y + dy));
        this.root.add(box(10, 4, 10, mat(c.flag, { emissive: c.flag, rough: .4 }), base.x + dx, 71, base.y + dy));
      }
      const pad = ringMesh(96, 104, c.flag, .45);
      pad.position.set(base.x, .6, base.y);
      this.root.add(pad);
    }
  }

  buildScenery() {
    const capacity = 260;
    const trunkGeo = new THREE.CylinderGeometry(.16, .22, 1, 12); trunkGeo.translate(0, .5, 0);
    // Round, puffy canopies built from overlapping blobs, like painted anime foliage.
    const blob = (r, x, y, z) => { const g = new THREE.IcosahedronGeometry(r, coarse ? 1 : 2); g.translate(x, y, z); return g; };
    const canopyGeo = mergeShapes([blob(.72, 0, .1, 0), blob(.5, .5, -.12, .18), blob(.48, -.42, -.1, .3), blob(.5, .05, -.08, -.5), blob(.42, -.1, .5, .05)]);
    const pineGeo = mergeShapes([[0, 1, .62], [.36, .8, .5], [.66, .58, .36]].map(([y, s, h]) => {
      const g = new THREE.ConeGeometry(s, h, 14); g.translate(0, y * .62 + h / 2, 0); return g;
    }));
    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    const stumpGeo = new THREE.CylinderGeometry(.3, .36, 1, 14); stumpGeo.translate(0, .5, 0);
    this.sceneryInk = {};
    const make = (name, geo, material, ink = 1.07) => {
      const m = new THREE.InstancedMesh(geo, material, capacity);
      m.castShadow = true; m.receiveShadow = true; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.dynamic.add(m);
      const shell = new THREE.InstancedMesh(inflated(geo, ink), INK, capacity);
      shell.instanceMatrix = m.instanceMatrix; shell.count = 0; shell.frustumCulled = false;
      this.dynamic.add(shell);
      this.sceneryInk[name] = shell;
      return m;
    };
    this.scenery = {
      trunk: make('trunk', trunkGeo, mat(0x6e5135), 1.18),
      canopy: make('canopy', canopyGeo, toon({ color: 0xffffff })),
      pine: make('pine', pineGeo, toon({ color: 0xffffff })),
      rock: make('rock', rockGeo, toon({ color: 0xffffff, flatShading: true })),
      stump: make('stump', stumpGeo, mat(0x8a6c48), 1.12),
    };
    this.sceneryKey = '';
  }

  syncScenery(list) {
    let key = '';
    for (const o of list) key += o.hp <= 0 ? '0' : String(Math.min(9, Math.floor(9 * o.hp / o.maxHp)));
    if (key === this.sceneryKey) return;
    this.sceneryKey = key;
    const s = this.scenery, m = new THREE.Matrix4(), q = new THREE.Quaternion(), color = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const counts = { trunk: 0, canopy: 0, pine: 0, rock: 0, stump: 0 };
    const put = (name, x, y, z, sx, sy, sz, rot, hex) => {
      const mesh = s[name];
      if (counts[name] >= mesh.instanceMatrix.count) return;
      q.setFromAxisAngle(up, rot);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
      mesh.setMatrixAt(counts[name], m);
      if (hex !== undefined) mesh.setColorAt(counts[name], color.setHex(hex));
      counts[name]++;
    };
    const greens = this.world.biome === 'arid' ? [0x7c8a4a, 0x93944f, 0x6a7a45] : [0x3e693f, 0x4f7c42, 0x355733, 0x5e8a49];
    for (const o of list) {
      const r = o.radius, rot = (o.rot || 0) * Math.PI / 180;
      if (o.kind === 'rock') {
        put('rock', o.x, r * .45, o.y, r, r * .72, r * .9, rot, [0x8c958a, 0x9da797, 0x7d857a][o.id % 3]);
        continue;
      }
      if (o.hp <= 0) {
        if (o.kind === 'tree') put('stump', o.x, 0, o.y, r * .9, 6, r * .9, rot);
        continue;
      }
      const health = Math.max(.2, o.hp / o.maxHp);
      if (o.kind === 'bush') {
        put('canopy', o.x, r * .45, o.y, r * 1.05, r * .6 * (.6 + .4 * health), r * 1.05, rot, [0x688048, 0x47633b, 0x7a8f52][o.id % 3]);
        continue;
      }
      const height = r * 1.5;
      const tint = greens[o.id % greens.length];
      put('trunk', o.x, 0, o.y, r, height * 1.05, r, rot);
      const canopy = r * (.62 + .38 * health);
      if (o.id % 3 === 0) put('pine', o.x, height * .55, o.y, canopy * 1.05, canopy * 2.6, canopy * 1.05, rot, tint);
      else put('canopy', o.x, height + canopy * .35, o.y, canopy * 1.1, canopy * .95, canopy * 1.1, rot, tint);
    }
    for (const [name, mesh] of Object.entries(s)) {
      mesh.count = counts[name];
      this.sceneryInk[name].count = counts[name];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  buildTrails() {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    for (let y = 0; y < 64; y += 8) { g.fillRect(0, y, 64, 6); }
    const stripes = document.createElement('canvas'); stripes.width = 64; stripes.height = 64;
    const s = stripes.getContext('2d');
    s.drawImage(canvas, 0, 0, 64, 64, 0, 4, 64, 8);
    s.drawImage(canvas, 0, 0, 64, 64, 0, 52, 64, 8);
    const texture = new THREE.CanvasTexture(stripes);
    const material = new THREE.MeshBasicMaterial({ color: 0x1d2a1e, alphaMap: texture, transparent: true, opacity: .32, depthWrite: false });
    const geo = new THREE.PlaneGeometry(34, 36); geo.rotateX(-Math.PI / 2);
    this.trails = new THREE.InstancedMesh(geo, material, 200);
    this.trails.count = 0; this.trails.renderOrder = 1;
    this.dynamic.add(this.trails);
    const logGeo = new THREE.CylinderGeometry(4, 5, 40, 7); logGeo.rotateZ(Math.PI / 2); logGeo.translate(20, 4, 0);
    this.logs = new THREE.InstancedMesh(logGeo, mat(0x6e5135, { rough: 1 }), 120);
    this.logs.count = 0; this.logs.castShadow = true;
    this.dynamic.add(this.logs);
  }

  syncTrails(list) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    let tracks = 0, logs = 0;
    for (const t of list) {
      q.setFromAxisAngle(up, -t.angle);
      if (t.type === 'fall') {
        if (logs >= 120) continue;
        m.compose(new THREE.Vector3(t.x, 0, t.y), q, one);
        this.logs.setMatrixAt(logs++, m);
      } else {
        if (tracks >= 200) continue;
        m.compose(new THREE.Vector3(t.x, .35, t.y), q, one);
        this.trails.setMatrixAt(tracks++, m);
      }
    }
    this.trails.count = tracks; this.logs.count = logs;
    this.trails.instanceMatrix.needsUpdate = true; this.logs.instanceMatrix.needsUpdate = true;
  }

  buildOverlays() {
    this.overlay = new THREE.Group();
    this.root.add(this.overlay);
    this.selfRing = ringMesh(40, 43, 0xeef6c8, .55);
    this.aimRing = ringMesh(0, 1, 0xd5e2a8, .8);
    this.aimDot = ringMesh(4, 7, 0xd5e2a8, .9);
    this.aimLine = stripMesh(0xd5e2a8, .55);
    this.linkRing = ringMesh(0, 1, 0xa9e9be, .45);
    this.reticle = ringMesh(9, 12, 0xffe6a8, .85);
    this.overlay.add(this.selfRing, this.aimRing, this.aimDot, this.aimLine, this.linkRing, this.reticle);
    this.overlayRadius = {};
  }

  makeVehicle(p) {
    const holder = new THREE.Group();
    holder.userData = { type: null, model: null, label: labelSprite() };
    holder.add(holder.userData.label);
    return holder;
  }

  makeWreck(w) {
    const holder = new THREE.Group();
    const parts = buildVehicle(w.type, w.team, true);
    parts.group.rotation.z = .08; parts.group.rotation.x = -.06;
    if (w.type === 'heli') parts.group.position.y = 9;
    holder.add(parts.group);
    const smoke = new THREE.Group();
    const puff = mat(0x34392f, { opacity: .35, basic: true });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), puff);
      smoke.add(s);
    }
    holder.add(smoke);
    holder.userData = { parts, smoke, ember: box(6, 3, 6, mat(0xf1722a, { emissive: 0xf1722a }), -4, 14, 3) };
    holder.add(holder.userData.ember);
    return holder;
  }

  makeObstacle(o) {
    const g = new THREE.Group();
    g.position.set(o.x + o.w / 2, 0, o.y + o.h / 2);
    g.userData = { stage: -1 };
    return g;
  }

  rebuildObstacle(g, o) {
    while (g.children.length) g.remove(g.children[0]);
    const stage = o.stage ?? (o.hp > 0 ? 0 : 3), w = o.w, d = o.h;
    if (o.kind === 'crate') {
      if (o.hp > 0) {
        const wood = mat(0x8a7a50, { rough: .9 });
        g.add(box(w, 22, d, wood, 0, 11, 0), box(w + 1, 3, 4, mat(0x4f4a36), 0, 22, 0));
      } else {
        for (let i = 0; i < 4; i++) { const p = box(w * .6, 2, 5, mat(0x7c6c48), (i - 1.5) * 6, 1, (i % 2 - .5) * 8); p.rotation.y = i * .7; g.add(p); }
      }
      return;
    }
    if (o.kind === 'wall' || o.kind === 'gate') return this.buildRampart(g, o, stage);
    if (o.kind === 'hq' && stage < 3) return this.buildHQ(g, o, stage);
    const isBuilding = o.kind === 'building';
    if (stage >= 3) {
      g.add(box(w * .95, 5, d * .95, mat(0x4a4d42, { rough: 1 }), 0, 2.5, 0));
      for (let i = 0; i < 9; i++) {
        const chunk = box(10 + (i * 7) % 14, 6 + (i * 5) % 9, 8 + (i * 3) % 10, mat(i % 3 ? 0x8e8c79 : 0x5e695d, { rough: 1 }),
          (((i * 37) % 100) / 100 - .5) * w * .8, 5, (((i * 61) % 100) / 100 - .5) * d * .8);
        chunk.rotation.set(i * .4, i * .9, i * .3); g.add(chunk);
      }
      return;
    }
    const wallH = (isBuilding ? 48 : 28) * (stage === 2 ? .72 : 1);
    const wall = mat(isBuilding ? [0x8a8875, 0x6f6e5f, 0x55564b][stage] : [0x7d8a78, 0x66705f, 0x4f574a][stage], { rough: .95 });
    const t = isBuilding ? 6 : 8;
    g.add(box(w, wallH, t, wall, 0, wallH / 2, -d / 2 + t / 2), box(w, wallH, t, wall, 0, wallH / 2, d / 2 - t / 2),
      box(t, wallH, d - 2 * t, wall, -w / 2 + t / 2, wallH / 2, 0), box(t, wallH, d - 2 * t, wall, w / 2 - t / 2, wallH / 2, 0));
    if (stage < 2) {
      const roof = mat(isBuilding ? (stage === 0 ? 0x677c71 : 0x48584d) : (stage === 0 ? 0x748071 : 0x5a6658), { rough: .9 });
      g.add(box(w + 2, 4, d + 2, roof, 0, wallH + 2, 0));
      if (isBuilding) for (let x = -w / 2 + 16; x < w / 2 - 10; x += 22) g.add(box(5, 2, d - 8, mat(0x9d9e82), x, wallH + 5, 0));
      else g.add(box(w * .7, 3, 4, mat(0x1c2420), 0, wallH * .62, d / 2 + .5));
    } else {
      g.add(box(w - 2 * t, 2, d - 2 * t, mat(0x222b29), 0, 1, 0));
      for (let i = 0; i < 3; i++) { const beam = box(w * .7, 4, 5, mat(0x898474), (i - 1) * 12, wallH * .5, (i - 1) * 9); beam.rotation.z = (i - 1) * .35; g.add(beam); }
    }
    if (stage >= 1) {
      const crack = box(4, wallH * .7, 1, mat(0x1f2c29), w * .12, wallH * .45, d / 2 + .2);
      crack.rotation.z = .4; g.add(crack);
    }
  }

  // Command bunker that carries the team flag on its roof until it is levelled.
  buildHQ(g, o, stage) {
    const c = TEAM[o.team], w = o.w, d = o.h, h = HQ_ROOF[stage];
    const concrete = mat([0x9a9784, 0x7f7c6b, 0x66645a][stage], { rough: .95 });
    const facing = o.team === 'blue' ? 1 : -1;
    g.add(box(w + 10, 5, d + 10, mat(0x4d5246, { rough: 1 }), 0, 2.5, 0));
    g.add(box(w, h - 4, d, concrete, 0, (h - 4) / 2 + 4, 0));
    g.add(box(w + 2, 5, d + 2, mat(c.body, { rough: .6 }), 0, h * .55, 0));
    g.add(box(w + 3, 3, d + 3, mat(0x55564b, { rough: .9 }), 0, h - 1.5, 0));
    for (const [px, pz, pw, pd] of [[0, -d / 2, w, 4], [0, d / 2, w, 4], [-w / 2, 0, 4, d], [w / 2, 0, 4, d]]) {
      g.add(box(pw, 5, pd, concrete, px, h + 2.5, pz));
    }
    g.add(box(4, 20, 18, mat(0x1b2621), facing * (w / 2 + 1), 14, 0));
    for (const z of [-d / 3, d / 3]) g.add(box(3, 6, 12, mat(0x1b2621), facing * (w / 2 + 1), h * .72, z));
    if (stage === 0) {
      const mast = new THREE.Group(); mast.position.set(-facing * w * .3, h, -d * .3);
      mast.add(cyl(.9, .9, 34, mat(0x59605a, { metal: .4 }), 0, 17, 0), box(6, 2, 6, mat(c.flag, { emissive: c.flag }), 0, 34, 0));
      g.add(mast);
    }
    if (stage >= 1) {
      for (const [x, r] of [[w * .18, .4], [-w * .22, -.5]]) {
        const crack = box(3, h * .6, 1, mat(0x1f2c29), x, h * .45, d / 2 + .3);
        crack.rotation.z = r; g.add(crack);
      }
    }
    if (stage === 2) for (let i = 0; i < 5; i++) {
      g.add(box(8 + i * 2, 5, 7, mat(0x8e8c79, { rough: 1 }), ((i * 41) % 100 / 100 - .5) * w * 1.3, 3, d / 2 + 8 + (i % 2) * 6));
    }
  }

  // HQ walls and gates are laid out along their long side; the frame turns them to match.
  buildRampart(g, o, stage) {
    const along = o.w >= o.h, L = along ? o.w : o.h, T = along ? o.h : o.w;
    const frame = new THREE.Group(); frame.rotation.y = along ? 0 : Math.PI / 2; g.add(frame);
    const c = TEAM[o.team] || TEAM.blue;
    const stone = mat([0x9a9784, 0x86846f, 0x6e6c5c][Math.min(stage, 2)], { rough: .95 });
    const capStone = mat([0xb4b29c, 0x9c9a86, 0x7f7d6b][Math.min(stage, 2)], { rough: .9 });
    const band = mat(c.body, { rough: .7 }), dark = mat(0x2a2e2b, { rough: .9 });
    g.userData.doors = null;
    if (stage >= 3) {
      frame.add(box(L * .96, 4, T * 1.4, mat(0x5d5c50, { rough: 1 }), 0, 2, 0));
      for (let i = 0; i < Math.max(3, L / 22); i++) {
        const chunk = box(7 + (i * 5) % 9, 4 + (i * 3) % 6, 6 + (i * 7) % 8, i % 3 ? stone : capStone,
          ((((i * 37) % 100) / 100) - .5) * L * .9, 4, ((((i * 61) % 100) / 100) - .5) * T * 2);
        chunk.rotation.set(i * .5, i * .9, i * .3); frame.add(chunk);
      }
      return;
    }
    const H = 30 * (stage === 2 ? .66 : 1);
    if (o.kind === 'wall') {
      frame.add(box(L, H, T, stone, 0, H / 2, 0), box(L, 2.4, T + 4, capStone, 0, H + 1.2, 0));
      frame.add(box(L - .5, 3, T + 1, band, 0, H * .62, 0), box(L + .5, 3, T + 3, dark, 0, 1.5, 0));
      const merlons = Math.floor(L / 15);
      for (let i = 0; i < merlons; i++) {
        if (stage === 2 && i % 3 !== 1) continue;
        frame.add(box(7, 5, T + 2, capStone, -L / 2 + (i + .5) * (L / merlons), H + 4.9, 0));
      }
      for (let x = -L / 2 + 6; x <= L / 2 - 5; x += Math.max(60, L / Math.round(L / 80))) frame.add(box(10, H + 2, T + 6, stone, x, (H + 2) / 2, 0));
      if (stage >= 1) {
        const crack = box(2.4, H * .7, T + 1.4, dark, L * .18, H * .45, 0); crack.rotation.z = .5; frame.add(crack);
        if (stage === 2) { const c2 = box(2.4, H * .5, T + 1.4, dark, -L * .22, H * .5, 0); c2.rotation.z = -.4; frame.add(c2); }
      }
      return;
    }
    const post = 16, span = L / 2 - post, gateH = 36 * (stage === 2 ? .75 : 1);
    for (const s of [1, -1]) {
      frame.add(box(post, gateH + 8, T + 10, stone, s * (L / 2 - post / 2), (gateH + 8) / 2, 0));
      frame.add(box(post + 4, 3, T + 14, capStone, s * (L / 2 - post / 2), gateH + 9.5, 0));
      frame.add(box(post + 1, 4, T + 11, band, s * (L / 2 - post / 2), gateH * .7, 0));
      frame.add(cyl(2.4, 2.4, 2, mat(0xffd27a, { basic: true }), s * (L / 2 - post / 2), gateH + 12, 0, 10));
    }
    frame.add(box(L - 2 * post, 3, 4, dark, 0, gateH + 4, 0));
    const steel = mat(stage ? 0x4f5450 : 0x5f6762, { rough: .6, metal: .4 });
    const doors = [1, -1].map(s => {
      const hinge = new THREE.Group(); hinge.position.set(s * span, 0, 0);
      const leaf = new THREE.Group(); leaf.position.x = -s * span / 2;
      leaf.add(box(span - 1, gateH - 4, 4, steel, 0, gateH / 2, 0), box(span - 1, 4, 5, band, 0, gateH * .62, 0));
      for (const k of [-.3, .3]) leaf.add(box(2, gateH - 8, 5, dark, k * span, gateH / 2, 0));
      hinge.add(leaf); hinge.userData.side = s; frame.add(hinge);
      return hinge;
    });
    g.userData.doors = doors;
  }

  // Gates swing open when a living teammate (of the gate's owner) is close by.
  swingGate(g, o, players, dtMs) {
    if (!g.userData.doors) return;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const near = players.some(p => p.alive && p.team === o.team && p.type !== 'heli' && Math.hypot(p.x - cx, p.y - cy) < 125);
    g.userData.open = lerp(g.userData.open || 0, near ? 1 : 0, Math.min(1, dtMs / 260));
    for (const d of g.userData.doors) d.rotation.y = d.userData.side * g.userData.open * 1.5;
  }

  makeBridge(b) {
    const g = new THREE.Group();
    g.userData = { stage: -1 };
    return g;
  }

  rebuildBridge(g, b) {
    while (g.children.length) g.remove(g.children[0]);
    const stage = b.stage ?? (b.hp > 0 ? 0 : 3);
    const steel = mat(0x8e9181, { rough: .6, metal: .4 }), dark = mat(0x252f31, { rough: .8 });
    const cx = b.x + b.w / 2, cz = b.y + b.h / 2, deckY = 8;
    for (const px of [b.x + 20, b.x + b.w * .5, b.x + b.w - 20]) {
      g.add(box(16, deckY + 10, b.h + 16, dark, px, (deckY + 10) / 2 - 8, cz));
    }
    const deckColor = [0x77796c, 0x62665e, 0x494d48][Math.min(stage, 2)];
    if (stage < 3) {
      const deck = mat(deckColor, { rough: .9 });
      if (stage < 2) g.add(box(b.w - 20, 5, b.h - 14, deck, cx, deckY, cz));
      else {
        const gap = 64, half = (b.w - 20 - gap) / 2;
        g.add(box(half, 5, b.h - 14, deck, b.x + 10 + half / 2, deckY, cz), box(half, 5, b.h - 14, deck, b.x + b.w - 10 - half / 2, deckY, cz));
        for (let i = 0; i < 4; i++) { const c = box(14, 4, 12, mat(0x263333), cx + (i - 1.5) * 18, 1.5, cz + (i % 2 - .5) * 30); c.rotation.y = i; g.add(c); }
      }
      for (const z of [b.y + 7, b.y + b.h - 7]) {
        g.add(box(b.w - 20, 3, 3, steel, cx, deckY + 9, z));
        for (let x = b.x + 18; x < b.x + b.w - 14; x += 36) g.add(box(2.5, 9, 2.5, steel, x, deckY + 5, z));
      }
      g.add(stripMesh(0xd7d4b3, .5));
      placeStrip(g.children[g.children.length - 1], b.x + 22, cz, b.x + b.w - 22, cz, 2, deckY + 2.6);
      if (stage >= 1) {
        const crack = box(70, 1, 4, mat(0x242c2c), cx - 30, deckY + 2.6, cz - 8); crack.rotation.y = .5; g.add(crack);
      }
    } else {
      const deck = mat(0x454943, { rough: 1 });
      g.add(box(52, 5, b.h - 14, deck, b.x + 36, deckY, cz), box(52, 5, b.h - 14, deck, b.x + b.w - 36, deckY, cz));
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, piece = box(29, 6, 10, mat(i % 2 ? 0x5d655d : 0x7e806c), cx + Math.cos(a) * (35 + i * 15), -1, cz + Math.sin(a) * (17 + i * 4));
        piece.rotation.set(.3 * i, a, .2); g.add(piece);
      }
    }
  }

  makeTurret(t) {
    const g = new THREE.Group();
    g.position.set(t.x, 0, t.y);
    const c = TEAM[t.team];
    g.add(box(50, 16, 50, mat(0x293a33, { rough: .8 }), 0, 8, 0), box(52, 2, 52, mat(c.flag, { rough: .5 }), 0, 16.5, 0));
    const head = new THREE.Group(); head.position.y = 18;
    if (t.kind === 'aa') {
      // Anti-air rocket site: a pitched launcher box of four missiles plus a small radar.
      const steel = mat(0x5d6b60, { rough: .6, metal: .3 }), dark = mat(0x1b2621, { rough: .9 });
      head.add(cyl(14, 16, 7, steel, 0, 3.5, 0), box(10, 14, 22, steel, -2, 13, 0));
      const rack = new THREE.Group(); rack.position.set(2, 20, 0); rack.rotation.z = .55;
      for (const z of [-7.5, 7.5]) {
        rack.add(box(30, 12, 12, mat(c.body, { rough: .6 }), 6, 0, z));
        for (const y of [-2.8, 2.8]) for (const dz of [-2.8, 2.8]) {
          rack.add(cyl(2.2, 2.2, 1, dark, 21.2, y, z + dz, 10).rotateZ(Math.PI / 2));
          rack.add(cyl(.1, 1.9, 4, mat(0xe8e4d6, { rough: .5 }), 23, y, z + dz, 10).rotateZ(-Math.PI / 2));
        }
      }
      head.add(rack);
      const radar = new THREE.Group(); radar.position.set(-12, 22, 0);
      radar.add(cyl(.8, .8, 10, dark, 0, -3, 0, 8), box(2, 7, 16, steel, 0, 3, 0));
      head.add(radar);
      g.add(head);
      g.userData = { head, radar, alive: true, rubble: null };
      return g;
    }
    head.add(cyl(15, 17, 10, mat(0x526b5a, { rough: .6, metal: .3 }), 0, 5, 0), box(34, 5, 5, mat(0x1b3027), 20, 6, 0), box(10, 4, 4, mat(0xd1d3b1), 36, 6, 0));
    g.add(head);
    g.userData = { head, alive: true, rubble: null };
    return g;
  }

  makeFlag(team) {
    const g = new THREE.Group();
    g.add(cyl(1.6, 1.6, 74, mat(0xe7e7bf, { rough: .5, metal: .4 }), 0, 37, 0));
    const clothGeo = new THREE.PlaneGeometry(32, 20, 8, 1); clothGeo.translate(16, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, toon({ color: TEAM[team].flag, side: THREE.DoubleSide }));
    cloth.castShadow = cloth.receiveShadow = true;
    cloth.position.y = 64; g.add(cloth);
    g.userData = { cloth, base: clothGeo.attributes.position.array.slice() };
    return g;
  }

  makeBullet(b) {
    if (b.kind === 'grenade') {
      const g = new THREE.Group();
      g.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(4.5, 10, 8), mat(0x6d7840, { rough: .6 }))));
      return g;
    }
    if (b.kind === 'hrocket') {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 12, 3, 8), mat(0x3b4a3f, { basic: true }));
      body.rotation.z = Math.PI / 2; g.add(body);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(3.2, 14, 8), mat(0xff8a2c, { opacity: .85, basic: true }));
      flame.rotation.z = Math.PI / 2; flame.position.x = -14; g.add(flame);
      return g;
    }
    if (b.kind === 'asv') {
      // Unguided artillery rocket: olive body, warhead, fins, exhaust flame and a smoke trail.
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 20, 10), mat(0x56603f, { basic: true }));
      body.rotation.z = Math.PI / 2; g.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7, 10), mat(0xc9c2a2, { basic: true }));
      tip.rotation.z = -Math.PI / 2; tip.position.x = 13.5; g.add(tip);
      for (const r of [0, Math.PI / 2]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(5, 9, .8), mat(0x2f3527, { basic: true }));
        fin.position.x = -8; fin.rotation.x = r; g.add(fin);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(3.6, 16, 8), mat(0xffa23c, { opacity: .9, basic: true }));
      flame.rotation.z = Math.PI / 2; flame.position.x = -18; g.add(flame);
      const puffs = [];
      for (let i = 0; i < 8; i++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat(0xcfcbc0, { opacity: .5 - i * .05, basic: true }));
        puff.position.x = -28 - i * 12; puff.scale.setScalar(3.5 + i * 1.8); g.add(puff); puffs.push(puff);
      }
      g.userData = { puffs, flame };
      return g;
    }
    if (b.kind === 'aa') {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 14, 3, 8), mat(0xf2efe4, { basic: true }));
      body.rotation.z = Math.PI / 2; g.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), mat(0xd8473a, { basic: true }));
      tip.rotation.z = -Math.PI / 2; tip.position.x = 10; g.add(tip);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(3, 12, 8), mat(0xffc35a, { opacity: .85, basic: true }));
      flame.rotation.z = Math.PI / 2; flame.position.x = -14; g.add(flame);
      const puffs = [];
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat(0xd9dcd6, { opacity: .45 - i * .06, basic: true }));
        puff.position.x = -22 - i * 11; puff.scale.setScalar(3 + i * 1.6); g.add(puff); puffs.push(puff);
      }
      g.userData.puffs = puffs;
      return g;
    }
    const color = b.kind === 'turret' ? 0xff8a6a : 0xfff0b8;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(1.8, 14, 2, 6), mat(color, { basic: true }));
    m.rotation.z = Math.PI / 2;
    const g = new THREE.Group(); g.add(m);
    return g;
  }

  makeExplosion() {
    const g = new THREE.Group();
    const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const smoke = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x3b3a33, transparent: true, roughness: 1, depthWrite: false, flatShading: true }));
    const wave = ringMesh(.8, 1, 0xf5deae, .8);
    wave.material = wave.material.clone();
    g.add(fire, smoke, wave);
    g.userData = { fire, smoke, wave };
    return g;
  }

  makeCrater() {
    const g = new THREE.Group();
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(1, 28), mat(0x1c2f25, { opacity: .55, basic: true }));
    scorch.rotation.x = -Math.PI / 2; scorch.renderOrder = 2;
    const lip = ringMesh(.82, 1, 0xbaa878, .45);
    g.add(scorch, lip);
    return g;
  }

  makeMine(m) {
    const g = new THREE.Group();
    const color = TEAM[m.team].flag;
    g.add(cyl(7, 8, 3, mat(0x3a4034, { rough: .7, metal: .3 }), 0, 1.5, 0), cyl(3.5, 4, 1.4, mat(0x22261f), 0, 3.6, 0));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8), new THREE.MeshBasicMaterial({ color }));
    lamp.position.y = 5;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .4, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 5;
    const halo = ringMesh(13, 16, color, .5);
    halo.material = halo.material.clone();
    halo.position.y = .8; halo.renderOrder = 3;
    g.add(lamp, glow, halo);
    g.userData = { lamp, glow, halo, phase: Math.random() * 1000 };
    return g;
  }

  rotateCamera(delta) { this.yaw += delta; }

  // Screen-space stick input (x right, y down) expressed in world axes for the current camera yaw.
  screenToWorldVector(dx, dy) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [dx * c + dy * s, -dx * s + dy * c];
  }

  pickGround(clientX, clientY) {
    const ndc = new THREE.Vector2((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x, y: hit.z };
  }

  groundCorners() {
    return [[0, 0], [this.width, 0], [this.width, this.height], [0, this.height]]
      .map(([x, y]) => this.pickGround(x, y) || { x: this.focus.x, y: this.focus.z });
  }

  updateCamera(focusX, focusY, rush, droneMode, dtMs, zoom = 1) {
    const blend = 1 - Math.exp(-dtMs / 110);
    // Speed swings constantly while steering, so zoom follows a slow average of it.
    this.rush = (this.rush || 0) + (rush - (this.rush || 0)) * (1 - Math.exp(-dtMs / 1400));
    const desired = this.baseDistance() * (droneMode ? .82 : (1 + .75 * this.rush) * zoom);
    this.distance += (desired - this.distance) * (1 - Math.exp(-dtMs / 650));
    this.focus.x += (focusX - this.focus.x) * blend;
    this.focus.z += (focusY - this.focus.z) * blend;
    const horizontal = this.distance * Math.cos(PITCH), height = this.distance * Math.sin(PITCH);
    this.camera.position.set(this.focus.x + Math.sin(this.yaw) * horizontal, height, this.focus.z + Math.cos(this.yaw) * horizontal);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
    this.scene.fog.near = this.distance * 1.15;
    this.scene.fog.far = this.distance * 3.6;
    const reach = this.distance * 1.15;
    const cam = this.sun.shadow.camera;
    if (Math.abs(cam.right - reach) > 30) {
      cam.left = -reach; cam.right = reach; cam.top = reach; cam.bottom = -reach;
      cam.near = 50; cam.far = 3000;
      cam.updateProjectionMatrix();
    }
    this.sun.position.set(this.focus.x - 620, 980, this.focus.z - 420);
    this.sun.target.position.set(this.focus.x, 0, this.focus.z);
  }

  frame(f) {
    const { game, previous, alpha, serverNow, selfId, time } = f;
    const dtMs = Math.min(64, Math.max(0, time - (this.lastTime || time)));
    this.lastTime = time;
    if (!this.world || !game) return;
    const prevById = new Map((previous?.players || []).map(p => [p.id, p]));
    const smooth = p => {
      const old = prevById.get(p.id);
      if (!old || !old.alive || !p.alive) return p;
      return { ...p, x: lerp(old.x, p.x, alpha), y: lerp(old.y, p.y, alpha),
        vx: lerp(old.vx || 0, p.vx || 0, alpha), vy: lerp(old.vy || 0, p.vy || 0, alpha),
        angle: lerpAngle(old.angle, p.angle, alpha), bodyAngle: lerpAngle(old.bodyAngle, p.bodyAngle, alpha) };
    };
    const players = game.players.map(smooth);
    const me = players.find(p => p.id === selfId);
    const prevDrones = new Map((previous?.drones || []).map(d => [d.id, d]));
    const drones = (game.drones || []).map(d => {
      const old = prevDrones.get(d.id);
      return old ? { ...d, x: lerp(old.x, d.x, alpha), y: lerp(old.y, d.y, alpha), angle: lerpAngle(old.angle, d.angle, alpha) } : d;
    });
    const drone = drones.find(d => d.ownerId === selfId);

    if (me) {
      const top = Math.max(80, this.world.types[me.type]?.speed || 220);
      const rush = Math.min(1, Math.hypot(me.vx || 0, me.vy || 0) / top);
      const lead = .3 + (this.rush || 0) * .55;
      // The look-ahead swings with every steering input, so it eases in on its own slower clock.
      const leadX = drone ? Math.cos(drone.angle) * 90 : (me.vx || 0) * lead;
      const leadY = drone ? Math.sin(drone.angle) * 90 : (me.vy || 0) * lead;
      const ease = 1 - Math.exp(-dtMs / 450);
      this.lead = this.lead || { x: leadX, y: leadY };
      this.lead.x += (leadX - this.lead.x) * ease;
      this.lead.y += (leadY - this.lead.y) * ease;
      let fx = (drone ? drone.x : me.x) + this.lead.x;
      let fy = (drone ? drone.y : me.y) + this.lead.y;
      let zoom = 1;
      if (me.type === 'arty') {
        // Close while limbered; once planted the view keeps opening up toward the aim.
        const settled = me.deploy === 'deployed' ? smoothstep(Math.min(1, Math.max(0, (serverNow - me.deployedSince) / ARTY_SPOT_MS))) : 0;
        zoom = .62 + .38 * deployProgress(me, serverNow) + 1.65 * settled;
        fx += Math.cos(me.angle) * 300 * settled;
        fy += Math.sin(me.angle) * 300 * settled;
      }
      const sea = me.type === 'jeep' ? this.world.seaMargin || 0 : 0;
      const clampTo = (v, max) => Math.max(60 - sea, Math.min(max + sea - 60, v));
      this.updateCamera(clampTo(fx, this.world.width), clampTo(fy, this.world.height), rush, !!drone, dtMs, zoom);
    }
    this.waterTexture.offset.set((time / 60000) % 1, (time / 90000) % 1);
    if (this.seaTexture) this.seaTexture.offset.set((time / 60000) % 1, (time / 90000) % 1);

    this.syncScenery(game.scenery || []);
    this.syncTrails(game.trails || []);
    this.obstacles.sync(game.obstacles || [], o => o.id, (g, o) => {
      const sig = `${o.stage ?? 0}|${o.hp > 0}`;
      if (g.userData.sig !== sig) { g.userData.sig = sig; this.rebuildObstacle(g, o); }
      if (o.kind === 'gate') this.swingGate(g, o, players, dtMs);
    });
    this.bridges.sync(game.bridges || [], b => b.id, (g, b) => {
      const sig = `${b.stage ?? 0}`;
      if (g.userData.sig !== sig) { g.userData.sig = sig; this.rebuildBridge(g, b); }
    });
    this.turrets.sync(game.turrets || [], t => t.id, (g, t) => {
      const alive = t.hp > 0;
      g.userData.head.rotation.y = -t.angle;
      if (g.userData.radar && alive) g.userData.radar.rotation.y = time / 500;
      if (g.userData.alive !== alive) {
        g.userData.alive = alive;
        g.userData.head.rotation.z = alive ? 0 : .5;
        g.userData.head.position.y = alive ? 18 : 10;
        g.children[0].material = alive ? mat(0x293a33, { rough: .8 }) : mat(0x2b2724, { rough: 1 });
      }
    });
    this.wrecks.sync(game.wrecks || [], w => w.id, (g, w) => {
      g.position.set(w.x, 0, w.y);
      g.userData.parts.group.rotation.y = -(w.angle || 0);
      const intact = w.hp > 0;
      g.userData.parts.group.scale.y = intact ? 1 : .35;
      g.userData.smoke.visible = intact; g.userData.ember.visible = intact;
      if (intact) {
        g.userData.smoke.children.forEach((s, i) => {
          const rise = ((time * .018 + i * 9 + w.x * .1) % 45);
          s.position.set(Math.sin(time / 600 + i) * 5, 18 + rise, Math.cos(time / 700 + i) * 4);
          s.scale.setScalar(5 + rise * .28);
        });
        g.userData.ember.material = mat(0xf1722a, { emissive: (Math.sin(time / 230 + w.x) > 0 ? 0xf1722a : 0x7a3010) });
      }
    });
    this.vehicles.sync(players.filter(p => p.alive), p => p.id, (holder, p) => {
      const data = holder.userData;
      if (data.type !== p.type || data.team !== p.team) {
        if (data.model) holder.remove(data.model.group);
        data.model = buildVehicle(p.type, p.team);
        data.type = p.type; data.team = p.team;
        holder.add(data.model.group);
      }
      const altitude = ALTITUDE[p.type] || 0;
      holder.position.set(p.x, altitude + (altitude ? Math.sin(time / 420) * 2 : 0), p.y);
      data.model.group.rotation.y = -p.bodyAngle;
      if (p.type === 'heli') {
        const speed = Math.hypot(p.vx || 0, p.vy || 0);
        data.model.group.rotation.z = -Math.min(.25, speed / 900);
      }
      if (data.model.turret) data.model.turret.rotation.y = -(p.angle - p.bodyAngle);
      if (data.model.wheels) {
        // Amphibious mode: wheels swing up flat against the hull and the jeep rides low.
        data.swim = lerp(data.swim || 0, p.surface === 'water' ? 1 : 0, Math.min(1, dtMs / 260));
        const k = data.swim;
        for (const w of data.model.wheels) {
          w.rotation.x = Math.PI / 2 * (1 - k);
          w.position.y = 5 + 6 * k;
          w.position.z = w.userData.z * (1 + .25 * k);
        }
        const sink = k * (6 + Math.sin(time / 330 + p.x * .01) * 1.2);
        data.model.group.position.y = -sink;
        data.model.group.rotation.x = k * Math.sin(time / 410) * .05;
        if (data.model.wake) {
          const speed = Math.hypot(p.vx || 0, p.vy || 0);
          data.model.wake.visible = k > .5 && speed > 15;
          data.model.wake.position.y = sink + 1.4;
          data.model.wake.scale.set(18 + speed * .25, 9 + speed * .06, 1);
        }
      }
      if (data.model.legs) {
        const k = deployProgress(p, serverNow);
        for (const leg of data.model.legs) {
          leg.rotation.y = leg.userData.side * .62 * k;
          leg.rotation.z = -.18 * (1 - k);
        }
      }
      if (data.model.rotor) data.model.rotor.rotation.y = time / 45;
      if (data.model.tailRotor) data.model.tailRotor.rotation.z = time / 30;
      const mine = p.id === selfId, ally = p.team === this.selfTeam;
      const color = mine ? '#efffc5' : p.team === 'blue' ? '#68c8db' : '#f17f6c';
      paintLabel(data.label, mine ? 'YOU' : ally ? 'ALLY' : 'ENEMY', color, p.hp / (this.world.types[p.type]?.hp || 100));
      data.label.position.set(0, 62 + (altitude ? 10 : 0), 0);
    });
    this.drones.sync(drones, d => d.id, (g, d) => {
      g.position.set(d.x, DRONE_ALTITUDE + Math.sin(time / 160) * 1.5, d.y);
      g.userData.group.rotation.y = -d.angle;
      g.userData.group.rotation.z = -.18;
      g.userData.props.forEach((p, i) => { p.rotation.y = time / 20 * (i % 2 ? 1 : -1); });
    });
    for (const team of ['blue', 'red']) {
      const hq = (game.obstacles || []).find(o => o.kind === 'hq' && o.team === team);
      this.updateFlag(this.flags[team], game.flags[team], players, time, hq);
    }

    const since = Math.max(-100, serverNow - game.time) / 1000;
    this.bulletPool.sync(game.bullets || [], b => b.id, (g, b) => {
      if (b.kind === 'grenade') {
        const span = Math.max(1, (b.impactAt || 0) - (b.bornAt || 0));
        const t = Math.max(0, Math.min(1, (serverNow - (b.bornAt || serverNow)) / span));
        const ahead = t >= 1 ? 0 : since;
        g.position.set(b.x + b.vx * ahead, 6 + Math.sin(t * Math.PI) * 70, b.y + b.vy * ahead);
        return;
      }
      if (b.kind === 'hrocket') {
        // Straight dive from the helicopter's altitude to the impact point.
        const span = Math.max(1, (b.impactAt || 0) - (b.bornAt || 0));
        const t = Math.max(0, Math.min(1, (serverNow - (b.bornAt || serverNow)) / span));
        const ahead = t >= 1 ? 0 : since;
        const height = ALTITUDE.heli - 6;
        g.position.set(b.x + b.vx * ahead, 2 + height * (1 - t), b.y + b.vy * ahead);
        const run = Math.hypot(b.vx, b.vy) * span / 1000;
        g.rotation.set(0, -Math.atan2(b.vy, b.vx), -Math.atan2(height, Math.max(1, run)));
        return;
      }
      if (b.kind === 'aa') {
        // Missiles climb off the rail to helicopter height within the first half second.
        const age = Math.max(0, serverNow - (b.bornAt || serverNow));
        const climb = smoothstep(Math.min(1, age / 550));
        g.position.set(b.x + b.vx * since, 22 + climb * (ALTITUDE.heli - 16), b.y + b.vy * since);
        g.rotation.set(0, -Math.atan2(b.vy, b.vx), (1 - climb) * .5);
        g.userData.puffs.forEach((p, i) => { p.visible = age > 60 * (i + 1); });
        return;
      }
      if (b.kind === 'asv') {
        // Leaves the raised launcher pod, then settles into a flat run toward the target.
        const age = Math.max(0, serverNow - (b.bornAt || serverNow));
        const settle = smoothstep(Math.min(1, age / 260));
        g.position.set(b.x + b.vx * since, 26 - settle * 10, b.y + b.vy * since);
        g.rotation.set(0, -Math.atan2(b.vy, b.vx), (1 - settle) * -.25);
        g.userData.puffs.forEach((p, i) => { p.visible = age > 35 * (i + 1); });
        g.userData.flame.scale.set(1, .8 + Math.random() * .5, 1);
        return;
      }
      g.position.set(b.x + b.vx * since, b.kind === 'heli' ? 40 : 12, b.y + b.vy * since);
      g.rotation.y = -Math.atan2(b.vy, b.vx);
    });
    this.explosionPool.sync(game.explosions || [], e => e.id, (g, e) => {
      const progress = Math.max(0, Math.min(1, (serverNow - e.bornAt) / Math.max(1, e.until - e.bornAt)));
      const s = e.scale || 1, { fire, smoke, wave } = g.userData;
      const splash = e.kind === 'splash';
      // Airbursts hang at helicopter height: a flash and a dark flak puff, no ground shockwave.
      g.position.set(e.x, e.kind === 'airburst' ? ALTITUDE.heli - 14 : 0, e.y);
      wave.visible = e.kind !== 'airburst';
      fire.scale.setScalar((10 + progress * 46) * s); fire.position.y = (8 + progress * 22) * s;
      fire.material.opacity = splash ? 0 : Math.max(0, .95 * (1 - progress * 1.3));
      fire.material.color.setHSL(.08 - progress * .06, 1, .62 - progress * .3);
      // A sinking vehicle throws up a column of spray instead of a fireball.
      smoke.material.color.setHex(splash ? 0xdcebe8 : 0x3b3a33);
      smoke.scale.set((6 + progress * (splash ? 22 : 40)) * s, (6 + progress * (splash ? 70 : 40)) * s, (6 + progress * (splash ? 22 : 40)) * s);
      smoke.position.y = splash ? Math.sin(progress * Math.PI) * 30 * s : (14 + progress * 50) * s;
      smoke.material.opacity = (splash ? .8 : .6) * Math.sin(progress * Math.PI);
      setRing(wave, (12 + progress * 80) * s, 5 * (1 - progress) + .5); wave.position.y = 1.2;
      wave.material.opacity = .7 * (1 - progress);
    });
    this.craterPool.sync(game.craters || [], c => `${c.bornAt}|${c.x}|${c.y}`, (g, c) => {
      g.position.set(c.x, .5, c.y); g.scale.set(c.r * 1.1, 1, c.r * 1.1);
    });
    this.minePool.sync((game.mines || []).filter(m => m.team === this.selfTeam), m => m.id, (g, m) => {
      g.position.set(m.x, 0, m.y);
      // Friendly-only beacon: a sharp blink once a second plus an expanding ripple.
      const u = g.userData, cycle = ((time + u.phase) % 1000) / 1000;
      const on = cycle < .28;
      u.lamp.material.color.setHex(on ? TEAM[m.team].flag : 0x2c3a3c);
      u.glow.visible = on;
      u.halo.scale.setScalar(.6 + cycle * .9);
      u.halo.material.opacity = .75 * (1 - cycle);
    });
    this.strikePool.sync(game.strikes || [], s => s.id, (ring, s) => {
      const pulse = 1 + Math.sin(time / 90) * .05;
      setRing(ring, s.radius * pulse, 4);
      ring.position.set(s.x, 1.5, s.y);
    });
    this.updateOverlays(f, me, drone);
    this.renderer.render(this.scene, this.camera);
  }

  updateFlag(g, flag, players, time, hq) {
    const carrier = flag.carriedBy ? players.find(p => p.id === flag.carriedBy) : null;
    const onRoof = !carrier && !flag.dropped && hq && hq.hp > 0;
    if (carrier) g.position.set(carrier.x - 8, 18, carrier.y);
    else g.position.set(flag.x, onRoof ? HQ_ROOF[hq.stage ?? 0] : 0, flag.y);
    const { cloth, base } = g.userData, pos = cloth.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.array[i * 3 + 2] = Math.sin(time / 160 + x * .18) * (x / 32) * 4;
    }
    pos.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
  }

  updateOverlays(f, me, drone) {
    const selfType = me?.type, target = f.target, world = this.world;
    this.selfRing.visible = !!me?.alive;
    if (me) this.selfRing.position.set(me.x, .9, me.y);
    this.aimRing.visible = this.aimDot.visible = this.aimLine.visible = false;
    this.linkRing.visible = false;
    const aimAt = f.mouseWorld || (coarse ? target : null);
    this.reticle.visible = !!(aimAt && me && !drone && selfType !== 'arty');
    if (this.reticle.visible) this.reticle.position.set(aimAt.x, 1.4, aimAt.y);
    if (!me || !target) return;
    const sizeRing = (key, mesh, radius, width) => {
      if (this.overlayRadius[key] !== radius) { this.overlayRadius[key] = radius; setRing(mesh, radius, width); }
    };
    if (selfType === 'jeep' && this.reticle.visible) {
      // Same crosshair as the tank, parked where the grenade will actually land.
      const t = world.types.jeep;
      let dx = target.x - me.x, dy = target.y - me.y, dist = Math.hypot(dx, dy) || 1;
      if (dist < 56) { dx = dx / dist * 56; dy = dy / dist * 56; dist = 56; }
      if (dist > t.range) { dx *= t.range / dist; dy *= t.range / dist; }
      this.reticle.position.set(me.x + dx, 1.4, me.y + dy);
    } else if (selfType === 'heli') {
      // Faint ring where a right-click rocket would land; dimmer still when out of rockets.
      const t = world.types.heli;
      let dx = target.x - me.x, dy = target.y - me.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > t.range) { dx *= t.range / dist; dy *= t.range / dist; }
      sizeRing('aim', this.aimRing, t.blastRadius, 2);
      this.aimRing.material = mat(0xffb066, { opacity: me.mines >= 1 ? .5 : .15, basic: true });
      this.aimRing.position.set(me.x + dx, 1.4, me.y + dy);
      this.aimRing.visible = true;
    } else if (selfType === 'arty') {
      const t = world.types.arty;
      const d = Math.hypot(target.x - me.x, target.y - me.y);
      const valid = me.deploy === 'deployed' && d >= 145 && d <= t.range;
      const color = valid ? 0xf4d48a : 0xe98777;
      sizeRing('aim', this.aimRing, t.blastRadius, 3);
      this.aimRing.material = mat(color, { opacity: .85, basic: true });
      this.aimLine.material = mat(color, { opacity: .55, basic: true });
      this.aimDot.material = mat(color, { opacity: .9, basic: true });
      this.aimRing.position.set(target.x, 1.4, target.y); this.aimDot.position.set(target.x, 1.5, target.y);
      placeStrip(this.aimLine, me.x, me.y, target.x, target.y, 2.4);
      this.aimRing.visible = this.aimDot.visible = this.aimLine.visible = true;
    } else {
      this.aimLine.material = mat(0xd5e2a8, { opacity: .55, basic: true });
      this.aimDot.material = mat(0xd5e2a8, { opacity: .9, basic: true });
    }
    if (selfType === 'fpv') {
      sizeRing('link', this.linkRing, world.types.fpv.range, 3);
      this.linkRing.position.set(me.x, 1.1, me.y);
      this.linkRing.visible = true;
    }
  }
}

function rippleTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7fb4b4'; g.fillRect(0, 0, 256, 256);
  let seed = 9187;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * 256, y = rnd() * 256;
    g.strokeStyle = rnd() > .5 ? '#d8eee4' : '#4a8288';
    g.globalAlpha = .25 + rnd() * .35; g.lineWidth = 1 + rnd() * 2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y - 3, x + 22 + rnd() * 20, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(3, 3);
  return t;
}

// Beach, surf line and shallows along the island shore; open sea outside it.
function paintCoast(g, world) {
  const shore = new Path2D();
  world.coast.forEach((p, i) => i ? shore.lineTo(p.x, p.y) : shore.moveTo(p.x, p.y));
  shore.closePath();
  const sea = new Path2D();
  sea.rect(0, 0, world.width, world.height);
  sea.addPath(shore);
  const sand = world.biome === 'arid' ? '#d2b98a' : '#cdbd8c';

  g.save();
  g.clip(sea, 'evenodd');
  g.fillStyle = '#' + SEA_FLOOR.toString(16).padStart(6, '0'); g.fillRect(0, 0, world.width, world.height);
  g.lineJoin = 'round';
  for (const [width, color] of [[120, '#1d4a50'], [70, '#285f5f'], [34, '#3b7a70'], [12, '#a9c9b4']]) {
    g.strokeStyle = color; g.lineWidth = width; g.stroke(shore);
  }
  g.restore();

  g.save();
  g.clip(shore);
  g.lineJoin = 'round';
  for (const [width, color] of [[64, sand + '55'], [40, sand], [14, '#9e906a']]) {
    g.strokeStyle = color; g.lineWidth = width; g.stroke(shore);
  }
  g.restore();
}

function rand(seed) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; }

// Procedurally painted terrain: grass and dust patches, mud, roads, river banks and base pads.
function paintGround(world) {
  const b = document.createElement('canvas'); b.width = world.width; b.height = world.height;
  const g = b.getContext('2d'), rnd = rand(7201995);
  g.fillStyle = world.biome === 'arid' ? '#97846a' : world.biome === 'wetlands' ? '#728d72' : '#7e8c64'; g.fillRect(0, 0, b.width, b.height);
  const palette = world.biome === 'arid' ? ['#a98a6a', '#caab83', '#776b52', '#aa9574', '#9d795e'] : world.biome === 'wetlands' ? ['#45684e', '#90ab79', '#779978', '#395e4e', '#9cba88'] : ['#657b55', '#9ba379', '#a79d75', '#586f53', '#98a17a'];
  for (let i = 0; i < 2200; i++) {
    const x = rnd() * b.width, y = rnd() * b.height, r = 3 + rnd() * 39;
    g.fillStyle = palette[Math.floor(rnd() * 5)] + '45';
    g.beginPath(); g.ellipse(x, y, r, r * (.25 + rnd() * .6), rnd() * 6.28, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * b.width, y = rnd() * b.height;
    g.fillStyle = rnd() > .55 ? '#d0bd8641' : '#2e4a3354';
    g.fillRect(x, y, 1 + rnd() * 4, 1 + rnd() * 3);
  }
  g.fillStyle = '#64add00c'; g.fillRect(0, 0, 510, b.height);
  g.fillStyle = '#ef86610c'; g.fillRect(1890, 0, 510, b.height);
  for (const m of world.mud || []) {
    g.save(); g.translate(m.x, m.y); g.rotate(.08);
    g.fillStyle = '#665c3f8c'; g.beginPath(); g.ellipse(0, 0, m.rx, m.ry, 0, 0, 6.283); g.fill();
    g.fillStyle = '#483f3042';
    for (let j = 0; j < 90; j++) { const a = rnd() * 6.283, rd = Math.sqrt(rnd()); g.beginPath(); g.ellipse(Math.cos(a) * m.rx * rd, Math.sin(a) * m.ry * rd, 3 + rnd() * 9, 1 + rnd() * 4, a, 0, 6.283); g.fill(); }
    g.restore();
  }
  for (const road of world.roads || []) {
    const horizontal = road.w >= road.h;
    g.fillStyle = '#303e38'; g.fillRect(road.x - 5, road.y - 5, road.w + 10, road.h + 10);
    g.fillStyle = world.biome === 'arid' ? '#706b57' : '#59645a'; g.fillRect(road.x, road.y, road.w, road.h);
    g.fillStyle = '#87917f';
    if (horizontal) {
      g.fillRect(road.x, road.y + 6, road.w, 3); g.fillRect(road.x, road.y + road.h - 9, road.w, 3);
      g.fillStyle = '#cfc4a18b'; for (let x = road.x + 25; x < road.x + road.w; x += 120) g.fillRect(x, road.y + road.h / 2 - 2, 55, 4);
    } else {
      g.fillRect(road.x + 5, road.y, 3, road.h); g.fillRect(road.x + road.w - 8, road.y, 3, road.h);
      g.fillStyle = '#cfc4a18b'; for (let y = road.y + 25; y < road.y + road.h; y += 100) g.fillRect(road.x + road.w / 2 - 2, y, 4, 41);
    }
  }
  for (const w of world.water) {
    g.fillStyle = '#65735e'; g.fillRect(w.x - 18, w.y - 18, w.w + 36, w.h + 36);
    g.fillStyle = '#b8aa78'; g.fillRect(w.x - 9, w.y - 9, w.w + 18, w.h + 18);
    const grad = g.createLinearGradient(w.x, 0, w.x + w.w, 0);
    grad.addColorStop(0, '#2c5f5c'); grad.addColorStop(.25, '#163f47'); grad.addColorStop(.75, '#19424b'); grad.addColorStop(1, '#3f6f66');
    g.fillStyle = grad; g.fillRect(w.x, w.y, w.w, w.h);
  }
  if (world.coast?.length) paintCoast(g, world);
  for (const [team, base] of Object.entries(world.bases)) {
    g.save(); g.translate(base.x, base.y);
    const ac = team === 'blue' ? '#5fcce0' : '#ec8e6f';
    g.fillStyle = '#343d34'; g.fillRect(-169, -150, 338, 300);
    g.fillStyle = '#586452'; g.fillRect(-155, -137, 310, 274);
    g.strokeStyle = '#a7aa87'; g.lineWidth = 5; g.strokeRect(-155, -137, 310, 274);
    for (const y of [-98, 99]) {
      g.fillStyle = '#27392e'; g.fillRect(-126, y - 22, 70, 44); g.strokeStyle = '#7b927f'; g.lineWidth = 3; g.strokeRect(-126, y - 22, 70, 44);
      g.fillStyle = '#acac83'; g.fillRect(68, y - 19, 69, 38);
    }
    g.fillStyle = team === 'blue' ? '#35616c' : '#724a42'; g.fillRect(-50, -57, 100, 114);
    g.fillStyle = '#253d37'; g.fillRect(-32, -39, 64, 78);
    g.fillStyle = ac; g.fillRect(-28, -35, 56, 5);
    g.fillStyle = '#c9c49a'; for (let x = -145; x < 147; x += 30) { g.fillRect(x, -146, 12, 5); g.fillRect(x, 141, 12, 5); }
    g.restore();
  }
  return b;
}
