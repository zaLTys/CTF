import * as THREE from 'three';

// World units map 1:1 onto three.js units: world (x, y) is scene (x, 0, y), and a
// world heading `a` is a rotation of -a around the vertical axis.
const TEAM = {
  blue: { body: 0x3e7e92, trim: 0x9adbe9, dark: 0x22424f, flag: 0x68c8db },
  red: { body: 0x9c4b3c, trim: 0xf4ab93, dark: 0x5b2a22, flag: 0xf17f6c },
};
const ALTITUDE = { heli: 58 };
const DRONE_ALTITUDE = 34;
const PITCH = 0.98;
const coarse = matchMedia('(pointer: coarse)').matches;

const materials = new Map();
function mat(color, { rough = .82, metal = .06, emissive = 0, opacity = 1, basic = false } = {}) {
  const key = [color, rough, metal, emissive, opacity, basic].join('|');
  if (!materials.has(key)) {
    const transparent = opacity < 1;
    materials.set(key, basic
      ? new THREE.MeshBasicMaterial({ color, transparent, opacity, depthWrite: !transparent })
      : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, transparent, opacity }));
  }
  return materials.get(key);
}
function shadowed(mesh, cast = true) { mesh.castShadow = cast; mesh.receiveShadow = true; return mesh; }
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
  m.position.set(x, y, z);
  return m;
}
function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, segments = 14) {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material));
  m.position.set(x, y, z);
  return m;
}
function wheel(material, x, z, r = 5, w = 4) {
  const m = cyl(r, r, w, material, x, r, z, 12);
  m.rotation.x = Math.PI / 2;
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
  if (type === 'tank') {
    g.add(box(50, 12, 30, body, 0, 11, 0));
    g.add(box(54, 11, 9, dark, 0, 6, 15.5), box(54, 11, 9, dark, 0, 6, -15.5));
    const glacis = box(10, 4, 28, body, 25, 15, 0); glacis.rotation.z = -.5; g.add(glacis);
    const turret = new THREE.Group(); turret.position.set(-3, 17, 0);
    turret.add(cyl(12, 13.5, 9, body, 0, 4.5, 0), box(32, 4, 4, dark, 24, 5, 0), cyl(3, 3, 2, trim, -3, 9.5, 4));
    g.add(turret); parts.turret = turret;
  } else if (type === 'jeep') {
    g.add(box(34, 8, 20, body, 0, 10, 0), box(12, 5, 19, body, 12, 15, 0), box(2, 7, 18, glass, 5, 17, 0));
    g.add(box(2, 9, 18, dark, -9, 18, 0));
    for (const [x, z] of [[11, 11], [11, -11], [-11, 11], [-11, -11]]) g.add(wheel(dark, x, z));
    const turret = new THREE.Group(); turret.position.set(-6, 15, 0);
    turret.add(cyl(4, 5, 4, dark, 0, 2, 0), box(14, 4, 4, trim, 6, 5, 0));
    g.add(turret); parts.turret = turret;
  } else if (type === 'heli') {
    const hull = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(8, 20, 4, 12), body));
    hull.rotation.z = Math.PI / 2; hull.position.y = 0; g.add(hull);
    g.add(box(6, 6, 12, glass, 13, 3, 0), cyl(2.2, 1.2, 32, body, -26, 2, 0).rotateZ(Math.PI / 2), box(6, 12, 2, body, -40, 7, 0));
    g.add(box(30, 1.5, 2, dark, 0, -10, 9), box(30, 1.5, 2, dark, 0, -10, -9));
    const rotor = new THREE.Group(); rotor.position.y = 11;
    rotor.add(box(94, .8, 4, dark), box(4, .8, 94, dark), cyl(2.5, 2.5, 4, dark, 0, -2, 0));
    g.add(rotor); parts.rotor = rotor;
    const tail = new THREE.Group(); tail.position.set(-41, 6, 3);
    tail.add(box(1, 16, 2, dark)); g.add(tail); parts.tailRotor = tail;
    const turret = new THREE.Group(); turret.position.set(17, -6, 0);
    turret.add(box(10, 3, 3, dark, 5, 0, 0)); g.add(turret); parts.turret = turret;
  } else if (type === 'asv') {
    g.add(box(56, 9, 30, body, 0, 11, 0), box(15, 14, 28, body, 22, 21, 0), box(2, 7, 24, glass, 29.6, 23, 0));
    for (const x of [-18, 0, 18]) g.add(wheel(dark, x, 15, 6, 5), wheel(dark, x, -15, 6, 5));
    const pod = new THREE.Group(); pod.position.set(-9, 18, 0); pod.rotation.z = .22;
    pod.add(box(30, 13, 24, trim));
    for (const z of [-7, 0, 7]) for (const y of [-3, 3]) pod.add(cyl(2.3, 2.3, 2, dark, 15.5, y, z).rotateZ(Math.PI / 2));
    g.add(pod);
  } else if (type === 'arty') {
    g.add(box(46, 9, 30, body, 0, 11, 0), box(12, 13, 28, body, -20, 20, 0));
    for (const x of [-16, 0, 16]) g.add(wheel(dark, x, 15, 6, 5), wheel(dark, x, -15, 6, 5));
    const turret = new THREE.Group(); turret.position.set(6, 17, 0);
    const barrel = cyl(3, 4, 54, dark, 26, 12, 0); barrel.rotation.z = Math.PI / 2 - .42;
    turret.add(cyl(11, 12, 6, trim, 0, 3, 0), barrel);
    g.add(turret); parts.turret = turret;
  } else if (type === 'fpv') {
    g.add(box(40, 9, 24, body, 0, 10, 0), box(14, 12, 23, body, 12, 19, 0), box(2, 6, 20, glass, 19.4, 21, 0));
    for (const [x, z] of [[13, 12], [13, -12], [-13, 12], [-13, -12]]) g.add(wheel(dark, x, z));
    g.add(cyl(.9, .9, 34, dark, -10, 31, 7), cyl(7, 3, 2, trim, -10, 48, 7));
    g.add(box(16, 6, 16, trim, -8, 17, -4));
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
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
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(world.width * 4, world.height * 4),
      mat(world.biome === 'arid' ? 0x6f604b : 0x3d4d3a, { rough: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(world.width / 2, -2, world.height / 2);
    this.root.add(apron);
    const rim = mat(0x2a3a2c, { rough: 1 });
    const t = 26, h = 14;
    this.root.add(box(world.width + t * 2, h, t, rim, world.width / 2, h / 2 - 4, -t / 2),
      box(world.width + t * 2, h, t, rim, world.width / 2, h / 2 - 4, world.height + t / 2),
      box(t, h, world.height, rim, -t / 2, h / 2 - 4, world.height / 2),
      box(t, h, world.height, rim, world.width + t / 2, h / 2 - 4, world.height / 2));

    this.waterTexture = rippleTexture();
    this.waterTexture.wrapS = this.waterTexture.wrapT = THREE.RepeatWrapping;
    const water = new THREE.MeshStandardMaterial({ color: 0x2f6f78, roughness: .12, metalness: .25, transparent: true, opacity: .78, map: this.waterTexture });
    for (const w of world.water) {
      const x0 = Math.max(0, w.x), y0 = Math.max(0, w.y), x1 = Math.min(world.width, w.x + w.w), y1 = Math.min(world.height, w.y + w.h);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), water);
      plane.rotation.x = -Math.PI / 2; plane.position.set((x0 + x1) / 2, .8, (y0 + y1) / 2);
      plane.receiveShadow = true;
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
    const trunkGeo = new THREE.CylinderGeometry(.16, .22, 1, 7); trunkGeo.translate(0, .5, 0);
    const canopyGeo = new THREE.IcosahedronGeometry(1, 0);
    const pineGeo = new THREE.ConeGeometry(1, 1, 8); pineGeo.translate(0, .5, 0);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const stumpGeo = new THREE.CylinderGeometry(.3, .36, 1, 8); stumpGeo.translate(0, .5, 0);
    const make = (geo, material) => {
      const m = new THREE.InstancedMesh(geo, material, capacity);
      m.castShadow = true; m.receiveShadow = true; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.dynamic.add(m);
      return m;
    };
    this.scenery = {
      trunk: make(trunkGeo, mat(0x6e5135, { rough: 1 })),
      canopy: make(canopyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, flatShading: true })),
      pine: make(pineGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, flatShading: true })),
      rock: make(rockGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, flatShading: true })),
      stump: make(stumpGeo, mat(0x8a6c48, { rough: 1 })),
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
    head.add(cyl(15, 17, 10, mat(0x526b5a, { rough: .6, metal: .3 }), 0, 5, 0), box(34, 5, 5, mat(0x1b3027), 20, 6, 0), box(10, 4, 4, mat(0xd1d3b1), 36, 6, 0));
    g.add(head);
    g.userData = { head, alive: true, rubble: null };
    return g;
  }

  makeFlag(team) {
    const g = new THREE.Group();
    g.add(cyl(1.6, 1.6, 74, mat(0xe7e7bf, { rough: .5, metal: .4 }), 0, 37, 0));
    const clothGeo = new THREE.PlaneGeometry(32, 20, 8, 1); clothGeo.translate(16, 0, 0);
    const cloth = shadowed(new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ color: TEAM[team].flag, side: THREE.DoubleSide, roughness: .8 })));
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
    const rocket = b.kind === 'asv';
    const color = rocket ? 0xffb066 : b.kind === 'turret' ? 0xff8a6a : 0xfff0b8;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(rocket ? 3.5 : 1.8, rocket ? 16 : 14, 2, 6), mat(color, { basic: true }));
    m.rotation.z = Math.PI / 2;
    const g = new THREE.Group(); g.add(m);
    if (rocket) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(4, 18, 8), mat(0xff7a2c, { opacity: .7, basic: true }));
      flame.rotation.z = Math.PI / 2; flame.position.x = -16; g.add(flame);
    }
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
    g.add(cyl(6, 7, 3, mat(0x1c2618, { rough: .8 }), 0, 1.5, 0));
    const light = box(3, 2, 3, mat(TEAM[m.team].flag, { emissive: TEAM[m.team].flag }), 0, 3.5, 0);
    const halo = ringMesh(10, 12, TEAM[m.team].flag, .5);
    halo.material = halo.material.clone();
    halo.position.y = .7;
    g.add(light, halo);
    g.userData = { halo };
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

  updateCamera(focusX, focusY, rush, droneMode, dtMs) {
    const blend = 1 - Math.exp(-dtMs / 170);
    const desired = this.baseDistance() * (droneMode ? .82 : 1 + .75 * rush);
    this.distance += (desired - this.distance) * blend;
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
        angle: lerpAngle(old.angle, p.angle, alpha), bodyAngle: lerpAngle(old.bodyAngle, p.bodyAngle, alpha) };
    };
    const players = game.players.map(smooth);
    const me = players.find(p => p.id === selfId);
    const drone = game.drones?.find(d => d.ownerId === selfId);

    if (me) {
      const top = Math.max(80, this.world.types[me.type]?.speed || 220);
      const rush = Math.min(1, Math.hypot(me.vx || 0, me.vy || 0) / top);
      const lead = .3 + rush * .55;
      const fx = drone ? drone.x + Math.cos(drone.angle) * 90 : me.x + (me.vx || 0) * lead;
      const fy = drone ? drone.y + Math.sin(drone.angle) * 90 : me.y + (me.vy || 0) * lead;
      this.updateCamera(Math.max(60, Math.min(this.world.width - 60, fx)), Math.max(60, Math.min(this.world.height - 60, fy)), rush, !!drone, dtMs);
    }
    this.waterTexture.offset.set((time / 60000) % 1, (time / 90000) % 1);

    this.syncScenery(game.scenery || []);
    this.syncTrails(game.trails || []);
    this.obstacles.sync(game.obstacles || [], o => o.id, (g, o) => {
      const sig = `${o.stage ?? 0}|${o.hp > 0}`;
      if (g.userData.sig !== sig) { g.userData.sig = sig; this.rebuildObstacle(g, o); }
    });
    this.bridges.sync(game.bridges || [], b => b.id, (g, b) => {
      const sig = `${b.stage ?? 0}`;
      if (g.userData.sig !== sig) { g.userData.sig = sig; this.rebuildBridge(g, b); }
    });
    this.turrets.sync(game.turrets || [], t => t.id, (g, t) => {
      const alive = t.hp > 0;
      g.userData.head.rotation.y = -t.angle;
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
      if (data.type !== p.type) {
        if (data.model) holder.remove(data.model.group);
        data.model = buildVehicle(p.type, p.team);
        data.type = p.type;
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
      if (data.model.rotor) data.model.rotor.rotation.y = time / 45;
      if (data.model.tailRotor) data.model.tailRotor.rotation.z = time / 30;
      const mine = p.id === selfId, ally = p.team === this.selfTeam;
      const color = mine ? '#efffc5' : p.team === 'blue' ? '#68c8db' : '#f17f6c';
      paintLabel(data.label, mine ? 'YOU' : ally ? 'ALLY' : 'ENEMY', color, p.hp / (this.world.types[p.type]?.hp || 100));
      data.label.position.set(0, 62 + (altitude ? 10 : 0), 0);
    });
    this.drones.sync(game.drones || [], d => d.id, (g, d) => {
      g.position.set(d.x, DRONE_ALTITUDE + Math.sin(time / 160) * 1.5, d.y);
      g.userData.group.rotation.y = -d.angle;
      g.userData.group.rotation.z = -.18;
      g.userData.props.forEach((p, i) => { p.rotation.y = time / 20 * (i % 2 ? 1 : -1); });
    });
    for (const team of ['blue', 'red']) this.updateFlag(this.flags[team], game.flags[team], players, time);

    const since = Math.max(0, serverNow - game.time) / 1000;
    this.bulletPool.sync(game.bullets || [], b => b.id, (g, b) => {
      if (b.kind === 'grenade') {
        const span = Math.max(1, (b.impactAt || 0) - (b.bornAt || 0));
        const t = Math.max(0, Math.min(1, (serverNow - (b.bornAt || serverNow)) / span));
        const ahead = t >= 1 ? 0 : since;
        g.position.set(b.x + b.vx * ahead, 6 + Math.sin(t * Math.PI) * 70, b.y + b.vy * ahead);
        return;
      }
      g.position.set(b.x + b.vx * since, b.kind === 'heli' ? 40 : 12, b.y + b.vy * since);
      g.rotation.y = -Math.atan2(b.vy, b.vx);
    });
    this.explosionPool.sync(game.explosions || [], e => e.id, (g, e) => {
      const progress = Math.max(0, Math.min(1, (serverNow - e.bornAt) / Math.max(1, e.until - e.bornAt)));
      const s = e.scale || 1, { fire, smoke, wave } = g.userData;
      g.position.set(e.x, 0, e.y);
      fire.scale.setScalar((10 + progress * 46) * s); fire.position.y = (8 + progress * 22) * s;
      fire.material.opacity = Math.max(0, .95 * (1 - progress * 1.3));
      fire.material.color.setHSL(.08 - progress * .06, 1, .62 - progress * .3);
      smoke.scale.setScalar((6 + progress * 40) * s); smoke.position.y = (14 + progress * 50) * s;
      smoke.material.opacity = .6 * Math.sin(progress * Math.PI);
      setRing(wave, (12 + progress * 80) * s, 5 * (1 - progress) + .5); wave.position.y = 1.2;
      wave.material.opacity = .7 * (1 - progress);
    });
    this.craterPool.sync(game.craters || [], c => `${c.bornAt}|${c.x}|${c.y}`, (g, c) => {
      g.position.set(c.x, .5, c.y); g.scale.set(c.r * 1.1, 1, c.r * 1.1);
    });
    this.minePool.sync((game.mines || []).filter(m => m.team === this.selfTeam), m => m.id, (g, m) => {
      g.position.set(m.x, 0, m.y);
      g.userData.halo.material.opacity = .25 + (Math.sin(time / 180) * .5 + .5) * .35;
    });
    this.strikePool.sync(game.strikes || [], s => s.id, (ring, s) => {
      const pulse = 1 + Math.sin(time / 90) * .05;
      setRing(ring, s.radius * pulse, 4);
      ring.position.set(s.x, 1.5, s.y);
    });
    this.updateOverlays(f, me, drone);
    this.renderer.render(this.scene, this.camera);
  }

  updateFlag(g, flag, players, time) {
    const carrier = flag.carriedBy ? players.find(p => p.id === flag.carriedBy) : null;
    if (carrier) g.position.set(carrier.x - 8, 18, carrier.y);
    else g.position.set(flag.x, 0, flag.y);
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
    this.selfRing.visible = !!me;
    if (me) this.selfRing.position.set(me.x, .9, me.y);
    this.aimRing.visible = this.aimDot.visible = this.aimLine.visible = false;
    this.linkRing.visible = false;
    this.reticle.visible = !!(f.mouseWorld && me && !drone && selfType !== 'arty' && selfType !== 'jeep');
    if (this.reticle.visible) this.reticle.position.set(f.mouseWorld.x, 1.4, f.mouseWorld.y);
    if (!me || !target) return;
    const sizeRing = (key, mesh, radius, width) => {
      if (this.overlayRadius[key] !== radius) { this.overlayRadius[key] = radius; setRing(mesh, radius, width); }
    };
    if (selfType === 'jeep') {
      const t = world.types.jeep;
      let dx = target.x - me.x, dy = target.y - me.y, dist = Math.hypot(dx, dy) || 1;
      if (dist < 56) { dx = dx / dist * 56; dy = dy / dist * 56; dist = 56; }
      if (dist > t.range) { dx *= t.range / dist; dy *= t.range / dist; }
      const tx = me.x + dx, ty = me.y + dy;
      sizeRing('aim', this.aimRing, t.blastRadius, 2.5);
      this.aimRing.material = mat(0xd5e2a8, { opacity: .8, basic: true });
      this.aimRing.position.set(tx, 1.4, ty); this.aimDot.position.set(tx, 1.5, ty);
      placeStrip(this.aimLine, me.x, me.y, tx, ty, 2.2);
      this.aimRing.visible = this.aimDot.visible = this.aimLine.visible = true;
    } else if (selfType === 'arty') {
      const t = world.types.arty;
      const d = Math.hypot(target.x - me.x, target.y - me.y);
      const valid = d >= 145 && d <= t.range;
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
    g.fillStyle = ac; g.font = '900 21px system-ui'; g.textAlign = 'center'; g.fillText(team === 'blue' ? 'B / HQ' : 'R / HQ', 0, -83);
    g.fillStyle = '#c9c49a'; for (let x = -145; x < 147; x += 30) { g.fillRect(x, -146, 12, 5); g.fillRect(x, 141, 12, 5); }
    g.restore();
  }
  return b;
}
