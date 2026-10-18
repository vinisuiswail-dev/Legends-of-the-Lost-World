import * as THREE from "three";
import type { WeaponCat } from "./data";

const M = (color: number, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive, flatShading: true });

export interface Rig {
  root: THREE.Group;
  body: THREE.Group; // everything that leans/bobs
  head: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  hand: THREE.Group; // weapon slot (in armR)
  offhand: THREE.Group; // shield slot (in armL)
  mats: THREE.MeshLambertMaterial[];
  eyes?: THREE.Mesh[];
  core?: THREE.Mesh;
}

interface HumanoidOpts { skin: number; tunic: number; pants: number; accent: number; scale?: number; bulky?: boolean; cape?: number; stone?: boolean; eyeColor?: number; }

export function humanoid(o: HumanoidOpts): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mats: THREE.MeshLambertMaterial[] = [];
  const mk = (c: number, e = 0) => { const m = M(c, e); mats.push(m); return m; };
  const w = o.bulky ? 1.35 : 1;
  const tunic = mk(o.tunic), pants = mk(o.pants), skin = mk(o.skin), accent = mk(o.accent);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.55 * w, 0.3, 0.32 * w), pants); hips.position.y = 0.95; body.add(hips);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62 * w, 0.72, 0.36 * w), tunic); torso.position.y = 1.42; body.add(torso);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.64 * w, 0.1, 0.38 * w), accent); belt.position.y = 1.1; body.add(belt);
  const head = new THREE.Mesh(o.stone ? new THREE.BoxGeometry(0.42, 0.42, 0.42) : new THREE.SphereGeometry(0.22, 8, 6), skin);
  head.position.y = 2.02; body.add(head);
  if (!o.stone) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.235, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mk(0x3a2414)); hair.position.y = 0.03; head.add(hair);
  }
  let eyes: THREE.Mesh[] | undefined;
  if (o.eyeColor !== undefined) {
    eyes = [];
    for (const sx of [-0.09, 0.09]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: o.eyeColor }));
      e.position.set(sx, 0.03, o.stone ? 0.22 : 0.2); head.add(e); eyes.push(e);
    }
  }
  if (o.cape !== undefined) {
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.0, 0.05), mk(o.cape)); cape.position.set(0, 1.25, -0.22); cape.rotation.x = 0.12; body.add(cape);
  }
  const mkArm = (side: number) => {
    const g = new THREE.Group(); g.position.set(side * (0.4 * w), 1.72, 0);
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.18 * w, 0.75, 0.18 * w), tunic); up.position.y = -0.36; g.add(up);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16 * w, 0.16, 0.16 * w), skin); hand.position.y = -0.78; g.add(hand);
    body.add(g); return g;
  };
  const mkLeg = (side: number) => {
    const g = new THREE.Group(); g.position.set(side * 0.15 * w, 0.92, 0);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.2 * w, 0.85, 0.22 * w), pants); l.position.y = -0.42; g.add(l);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22 * w, 0.18, 0.3 * w), accent); boot.position.set(0, -0.84, 0.04); g.add(boot);
    root.add(g); return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  const legL = mkLeg(-1), legR = mkLeg(1);
  const hand = new THREE.Group(); hand.position.y = -0.78; armR.add(hand);
  const offhand = new THREE.Group(); offhand.position.set(-0.1, -0.5, 0.05); armL.add(offhand);
  root.scale.setScalar(o.scale ?? 1);
  root.traverse((ob) => { if ((ob as THREE.Mesh).isMesh) ob.castShadow = true; });
  return { root, body, head, armL, armR, legL, legR, hand, offhand, mats, eyes };
}

export function makeWeapon(cat: WeaponCat | "none", tier = 0): THREE.Group {
  const g = new THREE.Group();
  const steel = M(tier >= 2 ? 0xe6e9f0 : tier === 1 ? 0xc9ccd4 : 0x9c938a, tier >= 3 ? 0x223355 : 0);
  const wood = M(0x5a3c22), gold = M(0xd4a440, 0x221500);
  if (cat === "sword") {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 1.05), steel); blade.position.z = 0.62; g.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.06), gold); guard.position.z = 0.08; g.add(guard);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), wood); hilt.position.z = -0.05; g.add(hilt);
  } else if (cat === "heavy") {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.2), wood); shaft.position.z = 0.45; g.add(shaft);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.3), steel); head.position.z = 1.0; g.add(head);
  } else if (cat === "dagger") {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.45), steel); blade.position.z = 0.3; g.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), gold); guard.position.z = 0.06; g.add(guard);
  } else if (cat === "bow") {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 4, 10, Math.PI), wood);
    arc.rotation.set(0, Math.PI / 2, Math.PI / 2); g.add(arc);
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1.1, 0.01), M(0xeeeeee)); str.rotation.x = Math.PI / 2; str.rotation.z = Math.PI / 2; g.add(str);
    g.rotation.y = 0;
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

export function makeShield(kind: string): THREE.Group {
  const g = new THREE.Group();
  if (!kind) return g;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 10), M(kind === "sun_shield" ? 0xd9b04a : 0x7a5530, kind === "sun_shield" ? 0x332000 : 0));
  face.rotation.z = Math.PI / 2; g.add(face);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), M(0xb0b0b8)); boss.position.x = -0.05; g.add(boss);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

export function makeWolf(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const fur = M(0x5d5852), dark = M(0x3a3632);
  const mats = [fur, dark];
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 1.3), fur); torso.position.y = 0.85; body.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.5), fur); head.position.set(0, 1.05, 0.8); body.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.3), dark); snout.position.set(0, -0.08, 0.35); head.add(snout);
  for (const sx of [-0.12, 0.12]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), dark); ear.position.set(sx, 0.27, -0.05); head.add(ear); }
  const eyes: THREE.Mesh[] = [];
  for (const sx of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0xff7a20 })); e.position.set(sx, 0.06, 0.26); head.add(e); eyes.push(e); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), fur); tail.position.set(0, 0.95, -0.85); tail.rotation.x = 0.6; body.add(tail);
  const leg = (x: number, z: number) => { const g = new THREE.Group(); g.position.set(x, 0.65, z); const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.65, 0.14), dark); l.position.y = -0.32; g.add(l); root.add(g); return g; };
  const legL = leg(-0.18, 0.45), legR = leg(0.18, 0.45), armL = leg(-0.18, -0.45), armR = leg(0.18, -0.45);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { root, body, head, armL, armR, legL, legR, hand: new THREE.Group(), offhand: new THREE.Group(), mats, eyes };
}

export function makeGuardian(scale: number, boss = false): Rig {
  const rig = humanoid({ skin: 0x8f8a7c, tunic: 0x9a9384, pants: 0x777064, accent: boss ? 0xc9a24a : 0x5d584e, scale, bulky: true, stone: true, eyeColor: boss ? 0xffa030 : 0x60e0ff });
  // moss & runes
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: boss ? 0xffa030 : 0x60e0ff }));
  core.position.set(0, 1.45, 0.2); rig.body.add(core);
  rig.core = core;
  const fist = (arm: THREE.Group) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), rig.mats[0]); f.position.y = -0.82; arm.add(f); };
  fist(rig.armL); fist(rig.armR);
  if (boss) {
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), M(0xd4a440, 0x442800));
      const a = (i / 5) * Math.PI * 2; spike.position.set(Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2); rig.head.add(spike);
    }
    for (const sx of [-1, 1]) { const pad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.5), M(0x6f685b)); pad.position.set(sx * 0.62, 1.85, 0); rig.body.add(pad); }
  }
  rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return rig;
}
