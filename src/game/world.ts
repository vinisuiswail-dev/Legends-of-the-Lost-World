import * as THREE from "three";

// ───────────── Deterministic RNG ─────────────
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const WORLD_HALF = 160;
export const WATER_Y = -0.5;

export function riverZ(x: number) { return 14 + 10 * Math.sin(x * 0.03) + 6 * Math.sin(x * 0.011 + 1); }

const FLAT = [
  { x: 0, z: -60, r: 24, h: 1.5 }, // village
  { x: 80, z: -50, r: 22, h: 2.2 }, // camp
  { x: 0, z: 110, r: 36, h: 3 }, // temple + court
  { x: -72, z: 72, r: 12, h: 9 }, // watch hill
  { x: 118, z: 98, r: 9, h: 5 }, // hidden hollow
  { x: -48, z: -56, r: 9, h: 1.6 }, // bren
  { x: 0, z: 70, r: 8, h: 3 }, // temple approach
];

const PATHS: [number, number, number, number][] = [
  [0, -60, 0, 14], [0, 14, 0, 95], [0, -60, 80, -50], [0, -60, -48, -56], [-48, -56, -88, -12], [0, 30, -72, 72], [80, -50, 110, 92],
];

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}
export function pathDist(x: number, z: number) {
  let m = 1e9;
  for (const p of PATHS) m = Math.min(m, segDist(x, z, p[0], p[1], p[2], p[3]));
  return m;
}

export function heightAt(x: number, z: number) {
  let h = Math.sin(x * 0.021) * 3.5 + Math.cos(z * 0.026) * 3.5 + Math.sin((x + z) * 0.05) * 1.3 + Math.sin(x * 0.11 + z * 0.07) * 0.5 + 3.4;
  // river channel
  const rd = Math.abs(z - riverZ(x));
  if (rd < 14) h = lerp(-1.4, h, smooth(Math.min(1, Math.max(0, (rd - 5) / 9))));
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 128) h += Math.pow(e - 128, 1.35) * 0.9;
  for (const f of FLAT) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r) h = f.h;
    else if (d < f.r + 14) h = lerp(f.h, h, smooth((d - f.r) / 14));
  }
  // hidden hollow walls
  const hd = Math.hypot(x - 118, z - 98);
  if (hd > 10 && hd < 18) {
    const ang = Math.atan2(z - 98, x - 118);
    const gap = Math.abs(Math.atan2(Math.sin(ang - Math.PI), Math.cos(ang - Math.PI))) < 0.22; // west passage
    if (!gap) h += Math.sin(((hd - 10) / 8) * Math.PI) * 9;
  }
  return h;
}

// Bridge deck override
export const BRIDGE = { minX: -3, maxX: 3, minZ: riverZ(0) - 10, maxZ: riverZ(0) + 10, y: 1.2 };
export function groundAt(x: number, z: number) {
  const h = heightAt(x, z);
  if (x > BRIDGE.minX && x < BRIDGE.maxX && z > BRIDGE.minZ && z < BRIDGE.maxZ) return Math.max(h, BRIDGE.y);
  return h;
}

// ───────────── Colliders ─────────────
export interface CircleCol { x: number; z: number; r: number; }
export interface BoxCol { minX: number; maxX: number; minZ: number; maxZ: number; id?: string; active?: boolean; }

export interface Interactable {
  id: string;
  kind: "npc" | "chest" | "herb" | "ore" | "relic" | "pillar" | "tablet";
  x: number; z: number; y: number;
  label: string;
  obj: THREE.Object3D;
  done?: boolean;
  data?: Record<string, unknown>;
}

export interface WorldBuild {
  root: THREE.Group;
  circles: CircleCol[];
  boxes: BoxCol[];
  interactables: Interactable[];
  pillars: { obj: THREE.Group; eye: THREE.Mesh; state: number; x: number; z: number }[];
  altar: { x: number; z: number; flame: THREE.Mesh; light: THREE.PointLight | null };
  gate: { obj: THREE.Mesh; col: BoxCol };
  water: THREE.Mesh;
  update: (dt: number, t: number) => void;
}

const M = (color: number, opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

export function buildWorld(quality: "low" | "medium" | "high", shadows: boolean): WorldBuild {
  const root = new THREE.Group();
  const circles: CircleCol[] = [];
  const boxes: BoxCol[] = [];
  const interactables: Interactable[] = [];
  const animated: ((dt: number, t: number) => void)[] = [];
  const R = rng(1337);

  // ── Terrain ──
  const seg = quality === "low" ? 110 : quality === "medium" ? 150 : 190;
  const size = WORLD_HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color(0.32, 0.5, 0.2), grassB = new THREE.Color(0.45, 0.58, 0.24);
  const sand = new THREE.Color(0.74, 0.67, 0.48), dirt = new THREE.Color(0.52, 0.42, 0.28);
  const rock = new THREE.Color(0.45, 0.43, 0.4), snow = new THREE.Color(0.92, 0.94, 0.97), stone = new THREE.Color(0.62, 0.58, 0.5);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = (Math.sin(x * 0.3) * Math.cos(z * 0.27) + Math.sin(x * 0.07 + z * 0.05)) * 0.25 + 0.5;
    c.copy(grassA).lerp(grassB, n);
    if (x < -60 && x > -125 && z > -50 && z < 30) c.multiplyScalar(0.8); // greywood darker
    const rd = Math.abs(z - riverZ(x));
    if (rd < 11) c.lerp(sand, smooth(1 - Math.max(0, rd - 6) / 5));
    const pd = pathDist(x, z);
    if (pd < 3) c.lerp(dirt, smooth(1 - pd / 3) * 0.85);
    if (Math.hypot(x, z - 110) < 30 && Math.abs(x) < 22) c.lerp(stone, 0.6);
    if (h > 12) c.lerp(rock, Math.min(1, (h - 12) / 6));
    if (h > 30) c.lerp(snow, Math.min(1, (h - 30) / 8));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = shadows;
  root.add(terrain);

  // ── Water ──
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3a7fa8, transparent: true, opacity: 0.78, emissive: 0x0a2030 })
  );
  water.position.y = WATER_Y;
  root.add(water);
  animated.push((_dt, t) => { water.position.y = WATER_Y + Math.sin(t * 0.8) * 0.05; });

  // ── Helpers ──
  const shadowy = (m: THREE.Object3D) => { m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = shadows; o.receiveShadow = shadows; } }); return m; };
  const box = (w: number, h: number, d: number, mat: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const place = (o: THREE.Object3D, x: number, z: number, yOff = 0) => { o.position.set(x, heightAt(x, z) + yOff, z); root.add(o); return o; };

  const matWood = M(0x7a5634), matDark = M(0x4a3523), matRoof = M(0x8c3b2a), matRoof2 = M(0x5f6b3a), matWall = M(0xd9c9a3);
  const matStone = M(0xa39a86), matStoneDark = M(0x6f685b), matCloth = M(0xb08a52), matGold = M(0xd8a640, { emissive: 0x3a2400 });

  function house(x: number, z: number, rot: number, roofMat = matRoof) {
    const g = new THREE.Group();
    const w = box(6, 3.4, 5, matWall); w.position.y = 1.7; g.add(w);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.9, 2.6, 4), roofMat);
    roof.position.y = 4.7; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.85); g.add(roof);
    const door = box(1.2, 2, 0.1, matDark); door.position.set(0, 1, 2.52); g.add(door);
    const win = box(1, 0.9, 0.1, M(0xffd98a, { emissive: 0x553300 })); win.position.set(1.8, 2, 2.52); g.add(win);
    const beam = box(6.2, 0.3, 0.3, matWood); beam.position.set(0, 3.3, 2.55); g.add(beam);
    g.rotation.y = rot;
    place(shadowy(g), x, z);
    circles.push({ x, z, r: 3.4 });
  }

  function tablet(id: string, x: number, z: number, rot = 0) {
    const g = new THREE.Group();
    const s = box(1.4, 1.8, 0.35, matStoneDark); s.position.y = 0.9; g.add(s);
    const glyph = box(0.9, 0.9, 0.05, M(0x88d0ff, { emissive: 0x2a6080 })); glyph.position.set(0, 1.1, 0.19); g.add(glyph);
    g.rotation.y = rot;
    place(shadowy(g), x, z);
    circles.push({ x, z, r: 0.8 });
    interactables.push({ id, kind: "tablet", x, z, y: heightAt(x, z) + 1, label: "Read", obj: g });
  }

  function chest(id: string, x: number, z: number, rot: number, loot: Record<string, number>, gold: number) {
    const g = new THREE.Group();
    const base = box(1.3, 0.7, 0.85, matWood); base.position.y = 0.35; g.add(base);
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.7, -0.42); g.add(lidPivot);
    const lid = box(1.32, 0.3, 0.87, matDark); lid.position.set(0, 0.15, 0.42); lidPivot.add(lid);
    const trim = box(1.36, 0.12, 0.9, matGold); trim.position.y = 0.6; g.add(trim);
    g.rotation.y = rot;
    place(shadowy(g), x, z);
    circles.push({ x, z, r: 0.8 });
    interactables.push({ id, kind: "chest", x, z, y: heightAt(x, z) + 0.8, label: "Open Chest", obj: g, data: { loot, gold, lid: lidPivot } });
  }

  function npc(id: string, x: number, z: number, robe: number, rot: number, accent = 0xe2c08d) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 1.4, 7), M(robe)); body.position.y = 0.7; g.add(body);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.6, 7), M(robe)); torso.position.y = 1.6; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), M(0xd9a77c)); head.position.y = 2.15; g.add(head);
    const sash = box(0.72, 0.12, 0.6, M(accent)); sash.position.y = 1.35; g.add(sash);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), M(0xffd76a, { emissive: 0xaa7a00 }));
    marker.position.y = 2.85; g.add(marker);
    g.rotation.y = rot;
    place(shadowy(g), x, z);
    circles.push({ x, z, r: 0.6 });
    animated.push((_dt, t) => { marker.rotation.y = t * 2; marker.position.y = 2.85 + Math.sin(t * 3) * 0.08; head.rotation.y = Math.sin(t * 0.7 + x) * 0.4; });
    interactables.push({ id, kind: "npc", x, z, y: heightAt(x, z) + 2, label: "Talk", obj: g, data: { marker } });
  }

  function glowSprite(color: number, size: number) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(size), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    return m;
  }

  // ── Village: Hollowbrook ──
  house(-13, -51, 0.2); house(13, -50, -0.25, matRoof2); house(-15, -71, Math.PI - 0.1); house(15, -71, Math.PI + 0.2, matRoof2); house(0, -79, Math.PI);
  // well
  {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1, 10, 1, true), matStone); ring.position.y = 0.5; g.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.1, 10).rotateX(-Math.PI / 2), M(0x2a5f80)); water.position.y = 0.6; g.add(water);
    const p1 = box(0.2, 2.4, 0.2, matWood); p1.position.set(-1.1, 1.2, 0); g.add(p1);
    const p2 = p1.clone(); p2.position.x = 1.1; g.add(p2);
    const r = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 4), matRoof); r.position.y = 2.7; r.rotation.y = Math.PI / 4; g.add(r);
    place(shadowy(g), 0, -60); circles.push({ x: 0, z: -60, r: 1.5 });
  }
  // forge
  {
    const g = new THREE.Group();
    const anvil = box(1, 0.6, 0.5, M(0x3a3a3f)); anvil.position.y = 0.6; g.add(anvil);
    const stand = box(0.5, 0.4, 0.4, matDark); stand.position.y = 0.2; g.add(stand);
    const furnace = box(1.8, 1.8, 1.6, matStoneDark); furnace.position.set(1.8, 0.9, -0.5); g.add(furnace);
    const fire = box(0.8, 0.5, 0.1, M(0xff7a20, { emissive: 0xff5500 })); fire.position.set(1.8, 0.7, 0.32); g.add(fire);
    place(shadowy(g), 9, -64); circles.push({ x: 9, z: -64, r: 0.8 }, { x: 10.8, z: -64.5, r: 1.2 });
    animated.push((_dt, t) => { (fire.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.7 + Math.sin(t * 9) * 0.3; });
  }
  // fences
  for (let i = 0; i < 10; i++) {
    const x = -22 + i * 4.5; if (Math.abs(x) < 4) continue;
    const f = box(4.2, 0.15, 0.12, matWood); place(f, x, -84, 0.9);
    const p = box(0.2, 1.2, 0.2, matWood); place(p, x - 2.1, -84, 0.6);
  }
  npc("mira", 4, -58, 0x5b4a7a, Math.PI, 0xd4b26a);
  npc("toma", -8, -64, 0x5a7a4a, Math.PI / 2, 0xc2d08a);
  npc("oda", 7, -66, 0x5a4030, -Math.PI / 4, 0x999999);
  npc("bren", -48, -56, 0x6b5a3a, Math.PI / 2, 0x7a3a2a);
  npc("varek", 9, 74, 0x2f2f3a, -Math.PI / 2, 0xaa3030);
  // Bren cabin
  house(-52, -62, 0.4, matRoof2);
  chest("chest_village", -17, -58, Math.PI / 2, { potion: 1, iron_ore: 1 }, 20);

  // ── Bridge ──
  {
    const g = new THREE.Group();
    const len = BRIDGE.maxZ - BRIDGE.minZ;
    const deck = box(6, 0.5, len, matWood); deck.position.y = BRIDGE.y - 0.25; g.add(deck);
    for (let i = 0; i <= 4; i++) {
      const zz = -len / 2 + (len / 4) * i;
      for (const sx of [-3, 3]) { const p = box(0.35, 1.6, 0.35, matDark); p.position.set(sx, BRIDGE.y + 0.4, zz); g.add(p); const leg = box(0.4, 3, 0.4, matDark); leg.position.set(sx, BRIDGE.y - 1.8, zz); g.add(leg); }
    }
    for (const sx of [-3, 3]) { const rail = box(0.15, 0.15, len, matWood); rail.position.set(sx, BRIDGE.y + 1.1, 0); g.add(rail); }
    g.position.set(0, 0, (BRIDGE.minZ + BRIDGE.maxZ) / 2);
    root.add(shadowy(g));
    boxes.push({ minX: -3.4, maxX: -2.7, minZ: BRIDGE.minZ + 1, maxZ: BRIDGE.maxZ - 1 }, { minX: 2.7, maxX: 3.4, minZ: BRIDGE.minZ + 1, maxZ: BRIDGE.maxZ - 1 });
  }
  tablet("t_bridge", 5, BRIDGE.minZ - 3, Math.PI);

  // ── Bandit camp: Old Mill ──
  {
    for (const [x, z, r] of [[72, -44, 0], [88, -44, 1], [74, -58, 2]] as const) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 5), M(r === 1 ? 0x8a5040 : 0x9a8a62)); place(shadowy(t), x, z, 1.6); circles.push({ x, z, r: 2.4 });
    }
    // windmill
    const mill = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 10, 8), matWall); tower.position.y = 5; mill.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 2.4, 8), matRoof); cap.position.y = 11.2; mill.add(cap);
    const hub = new THREE.Group(); hub.position.set(0, 9, 2.6); mill.add(hub);
    for (let i = 0; i < 4; i++) { const b = box(0.6, 7, 0.1, matCloth); b.position.y = 3.5; const arm = new THREE.Group(); arm.rotation.z = (i * Math.PI) / 2; arm.add(b); hub.add(arm); }
    place(shadowy(mill), 94, -40); circles.push({ x: 94, z: -40, r: 3.2 });
    animated.push((dt) => { hub.rotation.z += dt * 0.4; });
    // palisade
    for (let i = 0; i < 14; i++) {
      const a = -0.6 + i * 0.32; if (i === 6 || i === 7) continue;
      const x = 80 + Math.cos(a + Math.PI) * 21, z = -50 + Math.sin(a + Math.PI) * 21;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 3, 5), matDark); place(shadowy(p), x, z, 1.5); circles.push({ x, z, r: 0.6 });
    }
    // campfire
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
    place(fire, 80, -50, 0.6);
    const logs = box(1.6, 0.25, 0.3, matDark); place(logs, 80, -50, 0.15);
    let light: THREE.PointLight | null = null;
    if (quality !== "low") { light = new THREE.PointLight(0xff8a3a, 30, 18, 1.6); light.position.set(80, heightAt(80, -50) + 1.6, -50); root.add(light); }
    animated.push((_dt, t) => { fire.scale.set(1 + Math.sin(t * 13) * 0.1, 1 + Math.sin(t * 17) * 0.2, 1); if (light) light.intensity = 26 + Math.sin(t * 11) * 6; });
    circles.push({ x: 80, z: -50, r: 1 });
    chest("chest_camp", 84, -56, Math.PI, { sun_key: 1, warhammer: 1, iron_ore: 2 }, 60);
  }

  // ── Temple & Sun Court ──
  const TY = 3;
  const altar = { x: 0, z: 92, flame: null as unknown as THREE.Mesh, light: null as THREE.PointLight | null };
  const pillars: WorldBuild["pillars"] = [];
  {
    const floor = box(34, 0.3, 30, matStone); floor.position.set(0, TY + 0.05, 92); floor.receiveShadow = shadows; root.add(floor);
    const step = box(14, 0.3, 4, matStone); step.position.set(0, TY - 0.1, 76); root.add(step);
    // columns around temple floor
    for (let i = 0; i < 10; i++) {
      const side = i < 5 ? -1 : 1; const k = i % 5;
      const x = side * 16, z = 80 + k * 6;
      const broken = (i * 7) % 3 === 0;
      const hgt = broken ? 2.5 + (i % 2) : 6;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, hgt, 8), matStone); col.position.set(x, TY + hgt / 2, z); root.add(shadowy(col));
      circles.push({ x, z, r: 0.9 });
    }
    // altar
    const a = box(2.4, 1.2, 2.4, matStoneDark); a.position.set(altar.x, TY + 0.6, altar.z); root.add(shadowy(a));
    circles.push({ x: altar.x, z: altar.z, r: 1.6 });
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
    flame.position.set(altar.x, TY + 1.8, altar.z); root.add(flame);
    altar.flame = flame;
    if (quality !== "low") { altar.light = new THREE.PointLight(0xffaa44, 15, 16, 1.5); altar.light.position.set(altar.x, TY + 2.5, altar.z); root.add(altar.light); }
    animated.push((_dt, t) => { flame.rotation.y = t; flame.scale.y = 1.3 + Math.sin(t * 6) * 0.2; });
    // Sun pillars
    const pdefs = [{ x: -7, z: 92, s: 0 }, { x: 7, z: 92, s: 1 }, { x: 0, z: 84, s: 3 }];
    pdefs.forEach((p, i) => {
      const g = new THREE.Group();
      const body = box(1.4, 3.6, 1.4, matStone); body.position.y = 1.8; g.add(body);
      const capm = box(1.8, 0.4, 1.8, matStoneDark); capm.position.y = 3.8; g.add(capm);
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.4, 10), new THREE.MeshBasicMaterial({ color: 0x553322 }));
      eye.position.set(0, 2.6, 0.72); g.add(eye);
      g.position.set(p.x, TY, p.z);
      g.rotation.y = (p.s * Math.PI) / 2;
      root.add(shadowy(g));
      circles.push({ x: p.x, z: p.z, r: 1.1 });
      pillars.push({ obj: g, eye, state: p.s, x: p.x, z: p.z });
      interactables.push({ id: "pillar_" + i, kind: "pillar", x: p.x, z: p.z, y: TY + 2, label: "Turn Pillar", obj: g, data: { index: i } });
    });
    tablet("t_temple", -3, 77, 0);
    tablet("t_pillar", -10, 86, Math.PI / 2);
    // Varek's tent
    const vt = new THREE.Mesh(new THREE.ConeGeometry(2, 2.6, 5), M(0x3a3a48)); place(shadowy(vt), 13, 72, 1.3); circles.push({ x: 13, z: 72, r: 2 });

    // Court walls (z 106..142, x -15..15) with gate at x∈[-3,3]
    const wallH = 6;
    const wall = (x1: number, z1: number, x2: number, z2: number) => {
      const w = Math.abs(x2 - x1) || 1.2, d = Math.abs(z2 - z1) || 1.2;
      const m = box(w, wallH, d, matStoneDark); m.position.set((x1 + x2) / 2, TY + wallH / 2, (z1 + z2) / 2); root.add(shadowy(m));
      boxes.push({ minX: Math.min(x1, x2) - (x1 === x2 ? 0.6 : 0), maxX: Math.max(x1, x2) + (x1 === x2 ? 0.6 : 0), minZ: Math.min(z1, z2) - (z1 === z2 ? 0.6 : 0), maxZ: Math.max(z1, z2) + (z1 === z2 ? 0.6 : 0) });
    };
    wall(-15, 106, -3, 106); wall(3, 106, 15, 106); wall(-15, 106, -15, 142); wall(15, 106, 15, 142); wall(-15, 142, 15, 142);
    const courtFloor = box(29, 0.25, 35, M(0x8d8574)); courtFloor.position.set(0, TY + 0.04, 124); courtFloor.receiveShadow = shadows; root.add(courtFloor);
    const arch = box(8, 1.4, 1.6, matStone); arch.position.set(0, TY + wallH + 0.7, 106); root.add(arch);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), matGold); sun.position.set(0, TY + wallH + 0.7, 105.15); sun.rotation.y = Math.PI; root.add(sun);
    for (const sx of [-10, 10]) for (const sz of [114, 132]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 5, 8), matStone); col.position.set(sx, TY + 2.5, sz); root.add(shadowy(col)); circles.push({ x: sx, z: sz, r: 1 }); }
  }
  const gateMesh = box(6, 5.6, 0.6, M(0x7a6a4a, { emissive: 0x1a1000 }));
  gateMesh.position.set(0, TY + 2.8, 106); root.add(shadowy(gateMesh));
  const gateCol: BoxCol = { minX: -3, maxX: 3, minZ: 105.4, maxZ: 106.6, id: "gate", active: true };
  boxes.push(gateCol);
  chest("chest_court", 0, 138, Math.PI, { sun_shield: 1, ancient_shard: 2, greater_potion: 1 }, 120);

  // ── Watcher's Hill ruins ──
  {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2; const x = -72 + Math.cos(a) * 8, z = 72 + Math.sin(a) * 8;
      const hgt = 2 + R() * 4;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, hgt, 7), matStone); place(shadowy(col), x, z, hgt / 2); circles.push({ x, z, r: 0.8 });
    }
    tablet("t_hill", -70, 67, Math.PI);
    chest("chest_hill", -76, 75, 0.5, { iron_ore: 3, potion: 1 }, 45);
  }
  chest("chest_greywood", -104, 4, 1.2, { twin_daggers: 1, potion: 2 }, 30);
  chest("chest_bridge", -9, riverZ(-9) - 9, 2, { oak_shield: 1 }, 15);
  tablet("t_hollow", 113, 95, Math.PI / 2);

  // ── Relics ──
  const relic = (id: string, x: number, z: number) => {
    const g = new THREE.Group();
    const ped = box(0.8, 0.8, 0.8, matStoneDark); ped.position.y = 0.4; g.add(ped);
    const gem = glowSprite(0x7ae0ff, 0.3); gem.position.y = 1.3; g.add(gem);
    place(shadowy(g), x, z);
    animated.push((_dt, t) => { gem.rotation.y = t * 1.5; gem.position.y = 1.3 + Math.sin(t * 2) * 0.1; });
    interactables.push({ id, kind: "relic", x, z, y: heightAt(x, z) + 1, label: "Take Relic", obj: g });
  };
  relic("relic_mask", 52, riverZ(52) - 8.5);
  relic("relic_tablet", -72, 72);
  relic("relic_idol", 121, 100);

  // ── Herbs ──
  const herbSpots: [number, number][] = [[-20, -5], [-34, 0], [20, -2], [36, 2], [-52, -6], [58, 6], [-12, 30], [26, 30]];
  herbSpots.forEach(([x, zOff], i) => {
    const z = riverZ(x) + (zOff < 10 ? -8.5 : 8.5);
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 4), M(0x9ad08a)); leaf.position.set(Math.cos(k * 1.6) * 0.18, 0.3, Math.sin(k * 1.6) * 0.18); leaf.rotation.z = Math.cos(k) * 0.4; g.add(leaf); }
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe8f4ff })); bloom.position.y = 0.65; g.add(bloom);
    place(g, x, z);
    interactables.push({ id: "herb_" + i, kind: "herb", x, z, y: heightAt(x, z) + 0.5, label: "Gather Moonpetal", obj: g });
  });

  // ── Iron ore ──
  ([[30, -78], [-30, -82], [104, -60], [-90, 40], [60, 60]] as [number, number][]).forEach(([x, z], i) => {
    const g = new THREE.Group();
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1), matStoneDark); r.position.y = 0.5; g.add(r);
    for (let k = 0; k < 4; k++) { const v = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), M(0xc89a6a, { emissive: 0x442200 })); v.position.set(Math.cos(k * 1.7) * 0.8, 0.5 + Math.sin(k) * 0.4, Math.sin(k * 1.7) * 0.8); g.add(v); }
    place(shadowy(g), x, z);
    circles.push({ x, z, r: 1.1 });
    interactables.push({ id: "ore_" + i, kind: "ore", x, z, y: heightAt(x, z) + 1, label: "Mine Iron", obj: g });
  });

  // ── Trees (instanced) ──
  const treeCount = quality === "low" ? 380 : quality === "medium" ? 700 : 1100;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.4, 5); trunkGeo.translate(0, 1.2, 0);
  const pineGeo = new THREE.ConeGeometry(1.6, 4.2, 6); pineGeo.translate(0, 4.2, 0);
  const oakGeo = new THREE.IcosahedronGeometry(1.9, 0); oakGeo.translate(0, 3.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, matDark, treeCount);
  const pines = new THREE.InstancedMesh(pineGeo, M(0x2f5a32), treeCount);
  const oaks = new THREE.InstancedMesh(oakGeo, M(0x4f7a34), treeCount);
  const dummy = new THREE.Object3D();
  let ti = 0, pi = 0, oi = 0, tries = 0;
  const blocked = (x: number, z: number) => {
    if (Math.abs(z - riverZ(x)) < 10) return true;
    if (pathDist(x, z) < 4) return true;
    for (const f of FLAT) if (Math.hypot(x - f.x, z - f.z) < f.r + 3) return true;
    if (Math.abs(x) < 20 && z > 60 && z < 145) return true;
    if (Math.hypot(x - 118, z - 98) < 20) return true;
    return heightAt(x, z) > 24;
  };
  while (ti < treeCount && tries < treeCount * 8) {
    tries++;
    let x: number, z: number;
    if (R() < 0.35) { x = -125 + R() * 65; z = -50 + R() * 80; } else { x = (R() * 2 - 1) * 140; z = (R() * 2 - 1) * 140; }
    if (blocked(x, z)) continue;
    const s = 0.8 + R() * 0.7;
    dummy.position.set(x, heightAt(x, z) - 0.1, z); dummy.rotation.set(0, R() * 6, 0); dummy.scale.set(s, s, s); dummy.updateMatrix();
    trunks.setMatrixAt(ti++, dummy.matrix);
    const pine = x < -55 || R() < 0.4;
    if (pine) pines.setMatrixAt(pi++, dummy.matrix); else oaks.setMatrixAt(oi++, dummy.matrix);
    circles.push({ x, z, r: 0.45 * s });
  }
  trunks.count = ti; pines.count = pi; oaks.count = oi;
  for (const m of [trunks, pines, oaks]) { m.castShadow = shadows && quality === "high"; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); root.add(m); }

  // ── Rocks ──
  const rockCount = quality === "low" ? 80 : 160;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M(0x8a857a), rockCount);
  let ri = 0; tries = 0;
  while (ri < rockCount && tries < 2000) {
    tries++;
    const x = (R() * 2 - 1) * 140, z = (R() * 2 - 1) * 140;
    if (pathDist(x, z) < 3) continue;
    let bad = false; for (const f of FLAT) if (Math.hypot(x - f.x, z - f.z) < f.r) bad = true; if (bad) continue;
    const s = 0.4 + R() * 1.4;
    dummy.position.set(x, heightAt(x, z) + s * 0.2, z); dummy.rotation.set(R(), R() * 6, R()); dummy.scale.set(s, s * 0.7, s); dummy.updateMatrix();
    rocks.setMatrixAt(ri++, dummy.matrix);
    if (s > 0.8) circles.push({ x, z, r: s * 0.8 });
  }
  rocks.count = ri; rocks.instanceMatrix.needsUpdate = true; rocks.computeBoundingSphere(); root.add(rocks);

  // ── Ambient wildlife: birds ──
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.3, -0.8, 0.1, -0.2, 0, 0, -0.1, 0, 0, 0.3, 0.8, 0.1, -0.2, 0, 0, -0.1], 3));
  const birds: { m: THREE.Mesh; cx: number; cz: number; r: number; s: number; h: number; o: number }[] = [];
  const birdN = quality === "low" ? 4 : 10;
  for (let i = 0; i < birdN; i++) {
    const m = new THREE.Mesh(birdGeo, birdMat); root.add(m);
    birds.push({ m, cx: (R() * 2 - 1) * 90, cz: (R() * 2 - 1) * 90, r: 10 + R() * 20, s: 0.2 + R() * 0.3, h: 18 + R() * 12, o: R() * 6 });
  }
  animated.push((_dt, t) => {
    for (const b of birds) {
      const a = t * b.s + b.o;
      b.m.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + b.o) * 2, b.cz + Math.sin(a) * b.r);
      b.m.rotation.y = -a;
      b.m.scale.y = 1 + Math.sin(t * 10 + b.o) * 0.8;
    }
  });

  // boundary: invisible walls
  boxes.push({ minX: -150, maxX: 150, minZ: 145, maxZ: 160 }, { minX: -150, maxX: 150, minZ: -160, maxZ: -145 }, { minX: 145, maxX: 160, minZ: -150, maxZ: 150 }, { minX: -160, maxX: -145, minZ: -150, maxZ: 150 });

  return {
    root, circles, boxes, interactables, pillars, altar,
    gate: { obj: gateMesh, col: gateCol },
    water,
    update: (dt, t) => { for (const f of animated) f(dt, t); },
  };
}
