import * as THREE from "three";
import {
  ITEMS, QUESTS, LOCATIONS, type SaveData, type Settings, xpForLevel, maxHpFor, maxStaminaFor, armorFor, weaponDamage, writeSave,
} from "./data";
import { buildWorld, groundAt, heightAt, riverZ, WATER_Y, type WorldBuild, type Interactable } from "./world";
import { humanoid, makeWeapon, makeShield, makeWolf, makeGuardian, type Rig } from "./characters";
import { audio, type Sfx } from "./audio";
import type { GameAPI } from "./dialogue";

// ───────────────────────── Types ─────────────────────────
export interface HudState {
  hp: number; maxHp: number; st: number; maxSt: number; level: number; xp: number; xpNext: number; gold: number;
  weapon: string; weaponIcon: string; weaponCat: string; potions: number; potionId: string;
  questName: string; questText: string; questProgress: string;
  interact: string | null; boss: { name: string; hp: number; max: number; phase: number } | null;
  lockOn: boolean; combat: boolean; region: string; clock: string; blocking: boolean; sprint: boolean;
  fps: number; cinematic: string | null; letterbox: boolean; skillPoints: number; weather: string;
}
export interface EngineEvents {
  hud: (h: HudState) => void;
  toast: (msg: string, kind?: "info" | "quest" | "item" | "level" | "save" | "discover" | "warn") => void;
  dialogue: (npc: string) => void;
  tablet: (id: string) => void;
  forge: () => void;
  ending: (id: string) => void;
  death: () => void;
  bossDefeated: () => void;
}

interface AttackDef { name: string; windup: number; active: number; recover: number; range: number; arc: number; dmg: number; lunge?: number; aoe?: "front" | "around" | "ring" | "charge"; radius?: number; unblockable?: boolean; }
interface EnemyDef { name: string; hp: number; speed: number; radius: number; aggro: number; xp: number; gold: [number, number]; drops: [string, number, number][]; attacks: AttackDef[]; poise: number; kind: "bandit" | "chief" | "wolf" | "guardian" | "warden"; }

const ENEMIES: Record<string, EnemyDef> = {
  bandit: { name: "Bandit", kind: "bandit", hp: 45, speed: 3.8, radius: 0.5, aggro: 16, xp: 30, gold: [4, 10], poise: 14, drops: [["iron_ore", 0.4, 1], ["potion", 0.15, 1]],
    attacks: [{ name: "slash", windup: 0.55, active: 0.2, recover: 0.7, range: 2.0, arc: 1.6, dmg: 11, lunge: 3 }, { name: "thrust", windup: 0.8, active: 0.25, recover: 0.9, range: 2.6, arc: 0.9, dmg: 15, lunge: 7 }] },
  chief: { name: "Bandit Chief Rourke", kind: "chief", hp: 120, speed: 3.4, radius: 0.6, aggro: 18, xp: 80, gold: [25, 40], poise: 35, drops: [["iron_ore", 1, 2]],
    attacks: [{ name: "smash", windup: 0.9, active: 0.25, recover: 1.0, range: 2.6, arc: 1.4, dmg: 22, lunge: 2 }, { name: "spin", windup: 1.0, active: 0.4, recover: 1.1, range: 2.8, arc: 6.3, dmg: 16, aoe: "around", radius: 2.8 }] },
  wolf: { name: "Greywood Wolf", kind: "wolf", hp: 32, speed: 6, radius: 0.55, aggro: 18, xp: 22, gold: [0, 0], poise: 10, drops: [["wolf_pelt", 0.8, 1]],
    attacks: [{ name: "bite", windup: 0.4, active: 0.15, recover: 0.6, range: 1.7, arc: 1.4, dmg: 8, lunge: 4 }, { name: "pounce", windup: 0.7, active: 0.35, recover: 0.8, range: 4.5, arc: 1, dmg: 12, lunge: 13 }] },
  guardian: { name: "Stone Sentinel", kind: "guardian", hp: 85, speed: 2.3, radius: 0.8, aggro: 13, xp: 55, gold: [0, 6], poise: 40, drops: [["ancient_shard", 0.6, 1], ["iron_ore", 0.3, 1]],
    attacks: [{ name: "pound", windup: 1.0, active: 0.25, recover: 1.0, range: 2.6, arc: 1.4, dmg: 18, aoe: "front", radius: 2 }] },
  warden: { name: "The Stone Warden", kind: "warden", hp: 520, speed: 2.6, radius: 1.6, aggro: 30, xp: 300, gold: [80, 80], poise: 140, drops: [["sun_fragment", 1, 1], ["ancient_shard", 1, 3]],
    attacks: [
      { name: "Sun Slam", windup: 1.15, active: 0.3, recover: 1.1, range: 5, arc: 1.2, dmg: 30, aoe: "front", radius: 3.4 },
      { name: "Stone Sweep", windup: 0.95, active: 0.35, recover: 1.0, range: 4.2, arc: 6.3, dmg: 22, aoe: "around", radius: 4.4 },
      { name: "Quake Ring", windup: 1.0, active: 1.4, recover: 0.9, range: 9, arc: 6.3, dmg: 24, aoe: "ring", radius: 14, unblockable: true },
      { name: "Charge", windup: 0.9, active: 0.75, recover: 1.2, range: 14, arc: 1.2, dmg: 26, aoe: "charge", lunge: 16 },
    ] },
};

interface Enemy {
  id: string; def: EnemyDef; rig: Rig; pos: THREE.Vector3; home: THREE.Vector3; yaw: number; hp: number; maxHp: number;
  state: "idle" | "chase" | "windup" | "active" | "recover" | "stagger" | "return" | "dead" | "dormant" | "roar";
  t: number; atk: AttackDef | null; hitDone: boolean; poise: number; flash: number; cool: number; persist: boolean;
  phase: number; tele: THREE.Mesh | null; deadT: number; walk: number; aggro: boolean; vy: number; ringR: number; minion?: boolean;
}

interface Particle { m: THREE.Mesh; v: THREE.Vector3; life: number; max: number; active: boolean; }
interface Arrow { m: THREE.Mesh; v: THREE.Vector3; life: number; dmg: number; active: boolean; }
interface Cine { t: number; dur: number; update: (t: number, cam: THREE.PerspectiveCamera) => void; subs: [number, string][]; onEnd?: () => void; skippable: boolean; }

const tmpV = new THREE.Vector3();
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ───────────────────────── Engine ─────────────────────────
export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  world!: WorldBuild;
  s: SaveData;
  settings: Settings;
  ev: EngineEvents;
  minimap: HTMLCanvasElement | null = null;
  mapImage: HTMLCanvasElement;

  // input
  input = { mx: 0, my: 0, block: false, sprint: false };
  keys = new Set<string>();
  paused = false;
  uiOpen = false;

  // player
  rig: Rig;
  p = {
    pos: new THREE.Vector3(), vy: 0, yaw: 0, onGround: true, hp: 100, st: 100, stDelay: 0,
    state: "move" as "move" | "attack" | "heavy" | "dodge" | "hurt" | "dead" | "shoot",
    t: 0, dur: 0, combo: 0, queued: false, hitDone: false, dodgeDir: new THREE.Vector3(), iframes: 0,
    blocking: false, blockStart: 0, walk: 0, speed: 0, lastStep: 0,
  };
  camYaw = Math.PI; camPitch = 0.38; camDist = 6.5;
  shake = 0; hitstop = 0; slowmo = 0;
  lockTarget: Enemy | null = null;
  enemies: Enemy[] = [];
  particles: Particle[] = [];
  arrows: Arrow[] = [];
  slash: THREE.Mesh;
  marker: THREE.Mesh;
  rain: THREE.LineSegments | null = null;
  raining = false; weatherT = 120;
  cine: Cine | null = null;
  near: Interactable | null = null;
  clock = new THREE.Clock();
  time = 0; frameAcc = 0; fps = 60; fpsFrames = 0; fpsT = 0; hudT = 0; saveT = 0; discoverT = 0;
  raf = 0; running = false; disposed = false;
  checkpoint = new THREE.Vector3(0, 0, -44);
  skyDay = new THREE.Color(0x8ec5ea); skyDusk = new THREE.Color(0xe9a070); skyNight = new THREE.Color(0x0d1630);
  skyCol = new THREE.Color();
  telePool: THREE.Mesh[] = [];
  combat = false;
  bossRef: Enemy | null = null;

  constructor(canvas: HTMLCanvasElement, save: SaveData, settings: Settings, ev: EngineEvents) {
    this.s = save; this.settings = settings; this.ev = ev;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.preset === "high", powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 240);
    this.scene.fog = new THREE.Fog(0x8ec5ea, 60, 210);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a3f2a, 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    this.sun.shadow.mapSize.set(settings.preset === "high" ? 2048 : 1024, settings.preset === "high" ? 2048 : 1024);
    const sc = this.sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    this.loadRegion("valley");

    // player
    this.rig = humanoid({ skin: 0xd9a77c, tunic: 0x2f5d6a, pants: 0x4a3a2a, accent: 0x7a5530, cape: 0x8a2f24 });
    this.scene.add(this.rig.root);
    this.equipVisuals();
    this.p.pos.set(save.pos[0], 0, save.pos[2]);
    this.p.pos.y = groundAt(this.p.pos.x, this.p.pos.z);
    this.p.yaw = save.yaw; this.camYaw = save.yaw + Math.PI;
    this.p.hp = Math.min(save.hp, maxHpFor(save)) || maxHpFor(save);
    this.p.st = maxStaminaFor(save);
    this.updateCheckpoint();

    // fx
    this.slash = new THREE.Mesh(new THREE.RingGeometry(1.0, 2.3, 18, 1, -Math.PI * 0.45, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.slash.rotation.x = -Math.PI / 2;
    this.scene.add(this.slash);
    this.marker = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 60, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd06a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    this.scene.add(this.marker);
    const pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    for (let i = 0; i < 50; i++) {
      const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false; this.scene.add(m);
      this.particles.push({ m, v: new THREE.Vector3(), life: 0, max: 1, active: false });
    }
    const aGeo = new THREE.BoxGeometry(0.04, 0.04, 0.8);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(aGeo, new THREE.MeshLambertMaterial({ color: 0xd9c08a })); m.visible = false; this.scene.add(m);
      this.arrows.push({ m, v: new THREE.Vector3(), life: 0, dmg: 0, active: false });
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; this.scene.add(m); this.telePool.push(m);
    }
    this.mapImage = this.renderMapImage();
    this.applySettings(settings);
    this.spawnEnemies();
    this.applyWorldState();
    this.bindKeys();
  }

  // ───────── Region loading (one region resident at a time) ─────────
  loadRegion(id: string) {
    if (this.world) {
      this.scene.remove(this.world.root);
      this.world.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); } });
    }
    if (id === "valley") {
      this.world = buildWorld(this.settings.preset, this.settings.shadows);
      this.scene.add(this.world.root);
    }
  }

  applySettings(st: Settings) {
    const prevPreset = this.settings.preset;
    this.settings = st;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr * st.resScale);
    this.renderer.shadowMap.enabled = st.shadows;
    this.renderer.shadowMap.type = st.preset === "high" ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
    this.sun.castShadow = st.shadows;
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material) { const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach((x) => (x.needsUpdate = true)); } });
    this.scene.fog = new THREE.Fog(0x8ec5ea, st.preset === "low" ? 40 : 60, st.preset === "low" ? 150 : 210);
    this.camera.far = st.preset === "low" ? 160 : 240;
    this.camera.updateProjectionMatrix();
    if (!st.weather && this.rain) { this.scene.remove(this.rain); this.rain = null; this.raining = false; }
    audio.setVolumes(st.music, st.sfx);
    if (prevPreset !== st.preset && this.world) { this.loadRegion("valley"); this.applyWorldState(); }
    this.resize();
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ───────── World state from save ─────────
  applyWorldState() {
    const s = this.s;
    const pst = (s.flags.pillars as string) || "";
    this.world.pillars.forEach((p, i) => {
      if (pst.length === 3) p.state = Number(pst[i]);
      p.obj.rotation.y = (p.state * Math.PI) / 2;
    });
    this.updatePillarEyes();
    if (s.flags.gateOpen) { this.world.gate.col.active = false; this.world.gate.obj.position.y = -3; }
    for (const it of this.world.interactables) {
      if (it.kind === "chest" && s.opened.includes(it.id)) { it.done = true; const lid = it.data?.lid as THREE.Object3D; if (lid) lid.rotation.x = -1.9; }
      if ((it.kind === "herb" || it.kind === "relic" || it.kind === "ore") && s.collected.includes(it.id)) { it.done = true; it.obj.visible = false; }
    }
  }

  // ───────── Equipment visuals ─────────
  equipVisuals() {
    const r = this.rig;
    r.hand.clear(); r.offhand.clear();
    const w = ITEMS[this.s.equipped.weapon];
    const tier = this.s.upgrades[this.s.equipped.weapon] ?? 0;
    const wm = makeWeapon(w?.cat ?? "none", tier);
    if (w?.cat === "bow") { wm.rotation.set(0, 0, 0); r.offhand.add(wm); }
    else r.hand.add(wm);
    if (w?.cat !== "bow" && w?.cat !== "heavy") {
      const sh = makeShield(this.s.equipped.shield);
      sh.rotation.z = 0; r.offhand.add(sh);
    }
    const armorCol = this.s.equipped.armor === "ruin_plate" ? 0x9a9384 : this.s.equipped.armor === "leather_guard" ? 0x6b4a2a : 0x2f5d6a;
    r.mats[0].color.setHex(armorCol);
  }

  // ───────── Enemies ─────────
  spawnEnemies() {
    for (const e of this.enemies) this.scene.remove(e.rig.root);
    this.enemies = [];
    const s = this.s;
    const add = (id: string, type: string, x: number, z: number, persist: boolean, dormant = false) => {
      if (persist && s.killed.includes(id)) return;
      this.addEnemy(id, type, x, z, persist, dormant);
    };
    add("bandit_1", "bandit", 72, -48, true); add("bandit_2", "bandit", 88, -53, true); add("bandit_3", "bandit", 78, -38, true); add("bandit_chief", "chief", 83, -57, true);
    add("wolf_1", "wolf", -84, -16, false); add("wolf_2", "wolf", -92, -8, false); add("wolf_3", "wolf", -96, -20, false); add("wolf_4", "wolf", -80, 0, false);
    add("guard_1", "guardian", -67, 71, false); add("guard_2", "guardian", -76, 70, false);
    add("guard_3", "guardian", -10, 58, false); add("guard_4", "guardian", 11, 62, false);
    add("warden", "warden", 0, 126, true, true);
  }

  addEnemy(id: string, type: string, x: number, z: number, persist: boolean, dormant = false, minion = false): Enemy {
    const def = { ...ENEMIES[type] };
    if (minion) { def.hp = 40; def.xp = 15; def.drops = []; def.name = "Stone Shard"; }
    let rig: Rig;
    if (def.kind === "wolf") rig = makeWolf();
    else if (def.kind === "guardian") rig = makeGuardian(minion ? 1.0 : 1.35);
    else if (def.kind === "warden") rig = makeGuardian(2.7, true);
    else {
      const chief = def.kind === "chief";
      rig = humanoid({ skin: 0xc99a70, tunic: chief ? 0x5a1f1a : 0x7a3a2a, pants: 0x3a2f25, accent: 0x2a2018, scale: chief ? 1.2 : 1, bulky: chief, eyeColor: undefined });
      rig.hand.add(makeWeapon(chief ? "heavy" : "sword", 0));
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.46), new THREE.MeshLambertMaterial({ color: 0xaa2020 })); band.position.y = 0.08; rig.head.add(band);
    }
    const y = groundAt(x, z);
    rig.root.position.set(x, y, z);
    this.scene.add(rig.root);
    const e: Enemy = {
      id, def, rig, pos: new THREE.Vector3(x, y, z), home: new THREE.Vector3(x, y, z), yaw: Math.random() * 6, hp: def.hp, maxHp: def.hp,
      state: dormant ? "dormant" : "idle", t: Math.random() * 3, atk: null, hitDone: false, poise: 0, flash: 0, cool: 0, persist, phase: 1,
      tele: null, deadT: 0, walk: 0, aggro: false, vy: 0, ringR: 0, minion,
    };
    if (def.kind === "warden") { e.yaw = Math.PI; this.bossRef = e; }
    this.enemies.push(e);
    return e;
  }

  // ───────── Input ─────────
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.uiOpen) return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (e.repeat) return;
    if (k === " ") { this.jump(); e.preventDefault(); }
    else if (k === "j") this.attack();
    else if (k === "k") this.heavy();
    else if (k === "l" || k === "control") this.dodge();
    else if (k === "e") this.interact();
    else if (k === "q") this.toggleLock();
    else if (k === "r") this.usePotion();
    else if (k === "tab") { this.switchWeapon(); e.preventDefault(); }
    else if (k === "f") this.setBlock(true);
  };
  private onKeyUp = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); this.keys.delete(k); if (k === "f") this.setBlock(false); };
  bindKeys() { window.addEventListener("keydown", this.onKeyDown); window.addEventListener("keyup", this.onKeyUp); }

  rotateCamera(dx: number, dy: number) {
    if (this.cine) return;
    const sens = 0.005 * this.settings.sensitivity;
    this.camYaw -= dx * sens;
    this.camPitch = clamp(this.camPitch + dy * sens * (this.settings.invertY ? -1 : 1), -0.15, 1.2);
  }

  canAct() { return !this.paused && !this.cine && this.p.state !== "dead" && this.p.state !== "hurt"; }
  wcat() { return ITEMS[this.s.equipped.weapon]?.cat ?? "sword"; }
  atkSpeed() { return (ITEMS[this.s.equipped.weapon]?.speed ?? 1) * (this.s.skills.includes("w2") ? 1.15 : 1); }
  maxCombo() { return 3 + (this.s.skills.includes("w2") ? 1 : 0) + (this.wcat() === "dagger" ? 1 : 0); }

  attack() {
    if (!this.canAct()) return;
    const p = this.p;
    if (this.wcat() === "bow") { this.shoot(false); return; }
    if (p.state === "attack") { if (p.t > p.dur * 0.35 && p.combo < this.maxCombo()) p.queued = true; return; }
    if (p.state !== "move" || p.st < 8) return;
    this.beginAttack(0);
  }
  beginAttack(combo: number) {
    const p = this.p;
    p.state = "attack"; p.combo = combo + 1; p.t = 0; p.queued = false; p.hitDone = false;
    p.dur = (combo === this.maxCombo() - 1 ? 0.55 : 0.4) / this.atkSpeed();
    this.useStamina(9);
    this.faceTarget();
    audio.play("swing");
  }
  heavy() {
    if (!this.canAct() || this.p.state !== "move") return;
    if (this.wcat() === "bow") { this.shoot(true); return; }
    if (this.p.st < 20) return;
    const p = this.p; p.state = "heavy"; p.t = 0; p.hitDone = false; p.dur = 0.85 / this.atkSpeed();
    this.useStamina(24); this.faceTarget();
  }
  shoot(charged: boolean) {
    const p = this.p;
    if (p.state !== "move" || p.st < (charged ? 18 : 6)) return;
    p.state = "shoot"; p.t = 0; p.dur = charged ? 0.75 : 0.35; p.hitDone = false; p.combo = charged ? 2 : 1;
    this.useStamina(charged ? 18 : 6);
    this.faceTarget(true);
  }
  dodge() {
    const p = this.p;
    if (!this.canAct() || p.st < 16 || p.state === "dodge" || !p.onGround) return;
    if (p.state === "attack" && p.t < p.dur * 0.3) return;
    const dir = this.moveDir();
    if (dir.lengthSq() < 0.01) dir.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    p.dodgeDir.copy(dir.normalize());
    p.state = "dodge"; p.t = 0; p.dur = 0.42; p.iframes = 0.32;
    this.useStamina(16);
    audio.play("dodge");
    this.burst(p.pos.x, p.pos.y + 0.2, p.pos.z, 0xb8a888, 5, 2);
  }
  jump() { const p = this.p; if (this.canAct() && p.onGround && p.state === "move") { p.vy = 7.8; p.onGround = false; } }
  setBlock(b: boolean) {
    if (b && !this.input.block) this.p.blockStart = this.time;
    this.input.block = b;
  }
  toggleSprint() { this.input.sprint = !this.input.sprint; }
  toggleLock() {
    if (this.lockTarget) { this.lockTarget = null; return; }
    let best: Enemy | null = null, bd = 24;
    const fy = this.camYaw + Math.PI;
    for (const e of this.enemies) {
      if (e.state === "dead" || e.state === "dormant") continue;
      const d = e.pos.distanceTo(this.p.pos);
      const a = Math.abs(angDiff(Math.atan2(e.pos.x - this.p.pos.x, e.pos.z - this.p.pos.z), fy));
      const score = d + a * 6;
      if (score < bd) { bd = score; best = e; }
    }
    this.lockTarget = best;
  }
  switchWeapon() {
    const owned = Object.keys(this.s.inventory).filter((k) => ITEMS[k]?.type === "weapon" && this.s.inventory[k] > 0);
    if (owned.length < 2) { this.ev.toast("No other weapon to switch to", "warn"); return; }
    const i = owned.indexOf(this.s.equipped.weapon);
    this.equip(owned[(i + 1) % owned.length]);
  }
  equip(id: string) {
    const it = ITEMS[id]; if (!it || !this.s.inventory[id]) return;
    if (it.type === "weapon") this.s.equipped.weapon = id;
    else if (it.type === "armor") this.s.equipped.armor = id;
    else if (it.type === "shield") this.s.equipped.shield = id;
    this.equipVisuals();
    this.ev.toast(`Equipped ${it.name}`, "item");
    audio.play("ui");
  }
  usePotion(id?: string) {
    const s = this.s;
    const pid = id ?? (s.inventory.potion ? "potion" : s.inventory.greater_potion ? "greater_potion" : "");
    if (!pid || !s.inventory[pid]) { this.ev.toast("No healing draughts left", "warn"); return; }
    const mh = maxHpFor(s);
    if (this.p.hp >= mh) { this.ev.toast("Health is already full", "info"); return; }
    s.inventory[pid]--; if (!s.inventory[pid]) delete s.inventory[pid];
    this.p.hp = Math.min(mh, this.p.hp + (ITEMS[pid].heal ?? 40));
    audio.play("pickup");
    this.burst(this.p.pos.x, this.p.pos.y + 1.2, this.p.pos.z, 0x6aff8a, 10, 2);
  }
  useStamina(n: number) { this.p.st = Math.max(0, this.p.st - n); this.p.stDelay = 0.7; }

  faceTarget(ranged = false) {
    const p = this.p;
    let tgt: Enemy | null = this.lockTarget;
    if (!tgt) {
      let bd = ranged ? 32 : 4.5;
      for (const e of this.enemies) {
        if (e.state === "dead" || e.state === "dormant") continue;
        const d = e.pos.distanceTo(p.pos);
        const a = Math.abs(angDiff(Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z), p.yaw));
        if (d < bd && a < (ranged ? 0.5 : 1.4)) { bd = d; tgt = e; }
      }
    }
    if (tgt) p.yaw = Math.atan2(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z);
    else { const d = this.moveDir(); if (d.lengthSq() > 0.01) p.yaw = Math.atan2(d.x, d.z); }
    return tgt;
  }

  moveDir() {
    let mx = this.input.mx, my = this.input.my;
    if (this.keys.has("w") || this.keys.has("arrowup")) my += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) my -= 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) mx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) mx += 1;
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    const y = this.camYaw;
    return new THREE.Vector3(-Math.sin(y) * my + Math.cos(y) * mx, 0, -Math.cos(y) * my - Math.sin(y) * mx);
  }

  // ───────── Interaction ─────────
  interact() {
    if (!this.canAct() || this.p.state !== "move") return;
    const it = this.near; if (!it) return;
    const s = this.s;
    switch (it.kind) {
      case "npc":
        this.p.yaw = Math.atan2(it.x - this.p.pos.x, it.z - this.p.pos.z);
        this.ev.dialogue(it.id);
        break;
      case "tablet": this.ev.tablet(it.id); break;
      case "chest": {
        it.done = true; s.opened.push(it.id);
        const lid = it.data?.lid as THREE.Object3D; if (lid) lid.rotation.x = -1.9;
        const loot = it.data?.loot as Record<string, number>; const gold = it.data?.gold as number;
        audio.play("chest");
        this.gold(gold);
        for (const [k, n] of Object.entries(loot)) this.give(k, n);
        this.burst(it.x, it.y + 0.6, it.z, 0xffd36a, 14, 3);
        this.giveXp(15);
        this.checkQuests(); this.save(true);
        break;
      }
      case "herb":
        it.done = true; it.obj.visible = false; s.collected.push(it.id);
        this.give("herb", 1); this.checkQuests();
        break;
      case "ore":
        it.done = true; it.obj.visible = false; s.collected.push(it.id);
        audio.play("hit"); this.give("iron_ore", 2); this.burst(it.x, it.y, it.z, 0xc89a6a, 10, 3);
        break;
      case "relic": {
        it.done = true; it.obj.visible = false; s.collected.push(it.id);
        if (!s.quests.relics) { s.quests.relics = { stage: 0, progress: 0, done: false }; this.ev.toast("New quest: Echoes of the Ancients", "quest"); }
        s.artifacts.push(it.id);
        this.give(it.id, 1); this.giveXp(40);
        this.checkQuests(); this.save(true);
        break;
      }
      case "pillar": this.turnPillar(it.data?.index as number); break;
    }
  }

  turnPillar(i: number) {
    const s = this.s;
    if (s.flags.gateOpen) { this.ev.toast("The pillar is locked in place, its eye blazing.", "info"); return; }
    if (!s.inventory.sun_key) { this.ev.toast("The pillar won't budge. There's a sun-shaped keyhole at its base.", "warn"); return; }
    const p = this.world.pillars[i];
    p.state = (p.state + 1) % 4;
    s.flags.pillars = this.world.pillars.map((q) => q.state).join("");
    audio.play("slam");
    this.shake = 0.15;
    this.updatePillarEyes();
    if (this.world.pillars.every((q) => this.pillarCorrect(q))) this.solvePuzzle();
  }
  pillarCorrect(p: WorldBuild["pillars"][number]) {
    const r = (p.state * Math.PI) / 2;
    const ax = this.world.altar.x - p.x, az = this.world.altar.z - p.z; const l = Math.hypot(ax, az);
    return Math.sin(r) * ax / l + Math.cos(r) * az / l > 0.9;
  }
  updatePillarEyes() {
    for (const p of this.world.pillars) (p.eye.material as THREE.MeshBasicMaterial).color.setHex(this.pillarCorrect(p) ? 0xffd040 : 0x553322);
  }
  solvePuzzle() {
    const s = this.s;
    s.flags.gateOpen = true;
    this.take("sun_key", 1);
    audio.play("puzzle");
    this.giveXp(80);
    this.world.gate.col.active = false;
    const g = this.world.gate.obj;
    const start = g.position.y;
    this.startCine({
      dur: 4, skippable: true,
      subs: [[0, "The three eyes kindle. Deep in the stone, something answers."], [2.2, "The Sun Gate opens."]],
      update: (t, cam) => {
        g.position.y = start - Math.min(1, t / 3.2) * 6;
        cam.position.set(Math.sin(t * 0.2) * 6, 7 + t * 0.3, 92);
        cam.lookAt(0, 4, 106);
        if (t > 0.5) this.shake = 0.05;
      },
      onEnd: () => { g.position.y = -3; },
    });
    this.checkQuests(); this.save(true);
  }

  // ───────── Inventory / progression API ─────────
  give(id: string, n = 1) {
    this.s.inventory[id] = (this.s.inventory[id] ?? 0) + n;
    const it = ITEMS[id];
    if (it) this.ev.toast(`${it.icon} ${it.name}${n > 1 ? ` ×${n}` : ""}`, "item");
    audio.play("pickup");
  }
  take(id: string, n = 1) {
    if ((this.s.inventory[id] ?? 0) < n) return false;
    this.s.inventory[id] -= n; if (this.s.inventory[id] <= 0) delete this.s.inventory[id];
    return true;
  }
  gold(n: number) {
    if (n <= 0) return;
    const g = Math.round(n * (this.s.skills.includes("e3") ? 1.5 : 1));
    this.s.gold += g; this.ev.toast(`🪙 +${g} gold`, "item");
  }
  giveXp(n: number) {
    const s = this.s; s.xp += n;
    while (s.xp >= xpForLevel(s.level)) {
      s.xp -= xpForLevel(s.level); s.level++; s.skillPoints++;
      this.p.hp = maxHpFor(s);
      audio.play("level");
      this.ev.toast(`Level ${s.level}! +1 Skill Point`, "level");
    }
  }
  api(): GameAPI {
    return {
      s: this.s,
      startQuest: (id) => { if (!this.s.quests[id]) { this.s.quests[id] = { stage: 0, progress: 0, done: false }; this.s.activeQuest = id; this.ev.toast(`New quest: ${QUESTS[id].name}`, "quest"); audio.play("puzzle"); this.checkQuests(); this.save(true); } },
      setStage: (id, st) => { const q = this.s.quests[id]; if (q) { q.stage = st; q.progress = 0; } this.checkQuests(); this.save(true); },
      completeQuest: (id) => this.completeQuest(id),
      give: (id, n) => this.give(id, n),
      take: (id, n) => this.take(id, n),
      has: (id, n = 1) => (this.s.inventory[id] ?? 0) >= n,
      xp: (n) => this.giveXp(n),
      gold: (n) => this.gold(n),
      flag: (k, v) => { this.s.flags[k] = v; },
      toast: (t) => this.ev.toast(t, "info"),
      ending: (id) => this.ending(id),
      openForge: () => this.ev.forge(),
    };
  }
  completeQuest(id: string) {
    const q = this.s.quests[id]; if (!q || q.done) return;
    q.done = true;
    this.ev.toast(`Quest complete: ${QUESTS[id].name}`, "quest");
    audio.play("level");
    if (id === "herbs") { this.give("potion", 3); this.giveXp(80); }
    if (id === "wolves") { this.give("hunter_bow", 1); this.giveXp(100); }
    if (id === "relics") { this.give("ruin_plate", 1); this.giveXp(150); }
    if (id === "main") this.giveXp(300);
    if (this.s.activeQuest === id) {
      const next = Object.keys(this.s.quests).find((k) => !this.s.quests[k].done);
      this.s.activeQuest = next ?? id;
    }
    this.save(true);
  }
  ending(id: "guardian" | "seeker" | "betrayer") {
    const s = this.s;
    s.flags.ending = id;
    if (id === "guardian") { this.take("sun_fragment", 1); this.give("greater_potion", 2); }
    if (id === "betrayer") { this.take("sun_fragment", 1); this.gold(500); }
    if (!s.unlockedRegions.includes("desert")) s.unlockedRegions.push("desert");
    this.completeQuest("main");
    setTimeout(() => this.ev.ending(id), 400);
  }

  checkQuests() {
    const s = this.s; const m = s.quests.main;
    const bandits = ["bandit_1", "bandit_2", "bandit_3", "bandit_chief"].filter((b) => s.killed.includes(b)).length;
    const adv = (q: string, st: number) => { s.quests[q].stage = st; s.quests[q].progress = 0; this.ev.toast(`Quest updated: ${QUESTS[q].stages[st].text}`, "quest"); audio.play("puzzle"); };
    let changed = true;
    while (changed) {
      changed = false;
      if (m && !m.done) {
        if (m.stage === 1) { m.progress = bandits; if (bandits >= 4) { adv("main", 2); changed = true; } }
        else if (m.stage === 2 && (s.inventory.sun_key || s.flags.gateOpen)) { adv("main", 3); changed = true; }
        else if (m.stage === 3 && s.flags.gateOpen) { adv("main", 4); changed = true; }
        else if (m.stage === 4 && s.killed.includes("warden")) { adv("main", 5); changed = true; }
      }
    }
    const h = s.quests.herbs;
    if (h && !h.done && h.stage === 0) { h.progress = Math.min(5, s.inventory.herb ?? 0); if (h.progress >= 5) adv("herbs", 1); }
    const w = s.quests.wolves;
    if (w && !w.done && w.stage === 0 && w.progress >= 3) adv("wolves", 1);
    const r = s.quests.relics;
    if (r && !r.done) { r.progress = s.artifacts.length; if (r.progress >= 3) this.completeQuest("relics"); }
  }

  updateCheckpoint() {
    const m = this.s.quests.main;
    if (m && (m.stage >= 3 || m.done)) this.checkpoint.set(0, 0, 70); else this.checkpoint.set(0, 0, -44);
  }

  save(auto = false) {
    const s = this.s;
    s.pos = [this.p.pos.x, this.p.pos.y, this.p.pos.z];
    s.yaw = this.p.yaw; s.hp = Math.max(1, Math.round(this.p.hp));
    this.updateCheckpoint();
    const ok = writeSave(s);
    if (ok) this.ev.toast(auto ? "Autosaved" : "Game saved", "save");
    return ok;
  }

  // ───────── Cinematics ─────────
  startCine(c: Omit<Cine, "t">) { this.cine = { ...c, t: 0 }; this.lockTarget = null; }
  skipCine() { if (this.cine?.skippable) { this.cine.t = this.cine.dur; } }

  introCinematic() {
    const p = this.p.pos.clone();
    this.startCine({
      dur: 12, skippable: true,
      subs: [
        [0, "A thousand years ago, a kingdom vanished in a single night of light. They called it the Great Sundering."],
        [4, "Kael, a castaway with a map no living scholar could read, has found the shore it promised."],
        [8, "The Forgotten Valley. The first door to the Lost World."],
      ],
      update: (t, cam) => {
        const k = t / 12;
        if (k < 0.35) { cam.position.set(-40 + k * 60, 40, 140 - k * 60); cam.lookAt(0, 6, 106); }
        else if (k < 0.7) { const u = (k - 0.35) / 0.35; cam.position.set(30 - u * 20, 30 - u * 10, 20 - u * 40); cam.lookAt(0, 0, -30); }
        else { const u = (k - 0.7) / 0.3; cam.position.lerpVectors(new THREE.Vector3(10, 20, -20), new THREE.Vector3(p.x - Math.sin(this.p.yaw) * 6, p.y + 3, p.z - Math.cos(this.p.yaw) * 6), u * u * (3 - 2 * u)); cam.lookAt(p.x, p.y + 1.5, p.z); }
      },
      onEnd: () => this.ev.toast("Talk to Elder Mira in Hollowbrook (follow the gold beacon)", "quest"),
    });
  }

  bossIntro(e: Enemy) {
    audio.play("boss");
    e.state = "roar"; e.t = 0;
    this.startCine({
      dur: 4.5, skippable: true,
      subs: [[0.4, "THE STONE WARDEN"], [2.2, "Last guardian of the Sun Gate"]],
      update: (t, cam) => {
        const a = Math.PI * 0.85 + t * 0.25;
        cam.position.set(e.pos.x + Math.sin(a) * 11, e.pos.y + 3 + t * 0.6, e.pos.z + Math.cos(a) * 11);
        cam.lookAt(e.pos.x, e.pos.y + 4, e.pos.z);
        e.rig.armL.rotation.x = e.rig.armR.rotation.x = -Math.min(1, t) * 2.6;
        if (t > 1 && t < 2.2) this.shake = 0.12;
      },
      onEnd: () => { e.state = "chase"; e.aggro = true; this.lockTarget = e; },
    });
  }

  // ───────── FX ─────────
  burst(x: number, y: number, z: number, color: number, n: number, speed: number) {
    if (!this.settings.effects) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const pt = this.particles.find((q) => !q.active); if (!pt) return;
      pt.active = true; pt.m.visible = true; pt.life = 0; pt.max = 0.4 + Math.random() * 0.4;
      pt.m.position.set(x, y, z);
      pt.v.set((Math.random() - 0.5) * speed * 2, Math.random() * speed * 1.5, (Math.random() - 0.5) * speed * 2);
      (pt.m.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
  }
  tele(e: Enemy, atk: AttackDef) {
    const m = this.telePool.find((t) => !t.visible); if (!m) return;
    m.visible = true; e.tele = m;
    const r = atk.radius ?? atk.range;
    m.scale.set(r, 1, r);
    if (atk.aoe === "front") m.position.set(e.pos.x + Math.sin(e.yaw) * (atk.range - r * 0.6), e.pos.y + 0.12, e.pos.z + Math.cos(e.yaw) * (atk.range - r * 0.6));
    else m.position.set(e.pos.x, e.pos.y + 0.12, e.pos.z);
    if (atk.aoe === "charge") { m.scale.set(1.6, 1, 1.6); }
  }
  clearTele(e: Enemy) { if (e.tele) { e.tele.visible = false; (e.tele.material as THREE.MeshBasicMaterial).opacity = 0; e.tele = null; } }

  // ───────── Combat resolution ─────────
  playerHit(heavy: boolean) {
    const p = this.p; const cat = this.wcat();
    const range = (ITEMS[this.s.equipped.weapon]?.range ?? 2) + (heavy ? 0.4 : 0);
    const arc = heavy ? 2.6 : 2.0;
    let dmg = weaponDamage(this.s) * (heavy ? (this.s.skills.includes("w3") ? 3.3 : 2.2) : p.combo >= 3 ? 1.35 : 1);
    if (cat === "heavy" && heavy) dmg *= 1.15;
    let hits = 0;
    for (const e of this.enemies) {
      if (e.state === "dead" || e.state === "dormant") continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range + e.def.radius) continue;
      if (Math.abs(angDiff(Math.atan2(dx, dz), p.yaw)) > arc / 2 && d > e.def.radius + 0.5) continue;
      this.damageEnemy(e, dmg, heavy && (cat === "heavy" || this.s.skills.includes("w3")) ? 999 : heavy ? 30 : 10);
      hits++;
    }
    // slash fx
    const sl = this.slash; const mat = sl.material as THREE.MeshBasicMaterial;
    sl.position.set(p.pos.x, p.pos.y + 1.1, p.pos.z);
    sl.rotation.set(-Math.PI / 2, 0, p.yaw - Math.PI / 2 + (p.combo % 2 ? 0.2 : -0.2));
    sl.scale.setScalar(range / 2.2);
    mat.opacity = this.settings.effects ? 0.55 : 0.3;
    if (hits) { this.hitstop = heavy ? 0.09 : 0.05; this.shake = heavy ? 0.22 : 0.1; }
  }

  damageEnemy(e: Enemy, dmg: number, poiseDmg: number) {
    dmg = Math.round(dmg * (0.9 + Math.random() * 0.2));
    e.hp -= dmg; e.flash = 0.15; e.aggro = true;
    if (e.state === "idle" || e.state === "return") e.state = "chase";
    audio.play("hit");
    const c = e.def.kind === "guardian" || e.def.kind === "warden" ? 0xc9c0a8 : 0xff4a3a;
    this.burst(e.pos.x, e.pos.y + 1.2 * (e.def.kind === "warden" ? 2.5 : 1), e.pos.z, c, 8, 3);
    e.poise += poiseDmg;
    if (e.hp <= 0) { this.killEnemy(e); return; }
    if (e.def.kind === "warden" && e.phase === 1 && e.hp < e.maxHp * 0.5) {
      e.phase = 2; this.clearTele(e); e.state = "roar"; e.t = 0; e.atk = null;
      audio.play("boss");
      this.ev.toast("The Warden's core ignites! Phase II", "warn");
      if (e.rig.core) (e.rig.core.material as THREE.MeshBasicMaterial).color.setHex(0xff3010);
      e.rig.eyes?.forEach((x) => (x.material as THREE.MeshBasicMaterial).color.setHex(0xff3010));
      this.addEnemy("minion_a", "guardian", e.pos.x - 6, e.pos.z - 4, false, false, true).aggro = true;
      this.addEnemy("minion_b", "guardian", e.pos.x + 6, e.pos.z - 4, false, false, true).aggro = true;
      return;
    }
    if (e.poise >= e.def.poise && e.state !== "roar") {
      e.poise = 0; this.clearTele(e); e.state = "stagger"; e.t = 0;
      const kb = e.def.kind === "warden" ? 0.3 : 1.2;
      e.pos.x += Math.sin(this.p.yaw) * kb; e.pos.z += Math.cos(this.p.yaw) * kb;
    }
  }

  killEnemy(e: Enemy) {
    const s = this.s;
    this.clearTele(e);
    e.state = "dead"; e.deadT = 0;
    if (this.lockTarget === e) this.lockTarget = null;
    this.giveXp(e.def.xp);
    if (e.def.gold[1] > 0) this.gold(Math.round(e.def.gold[0] + Math.random() * (e.def.gold[1] - e.def.gold[0])));
    for (const [id, ch, n] of e.def.drops) if (Math.random() < ch) this.give(id, n);
    if (e.persist) s.killed.push(e.id);
    if (e.def.kind === "wolf" && s.quests.wolves && !s.quests.wolves.done && s.quests.wolves.stage === 0) s.quests.wolves.progress++;
    if (e.def.kind === "warden") {
      this.bossRef = null;
      for (const m of this.enemies) if (m.minion && m.state !== "dead") { m.hp = 0; this.killEnemy(m); }
      audio.play("death");
      this.slowmo = 1.2;
      this.ev.toast("THE STONE WARDEN HAS FALLEN", "level");
      this.ev.bossDefeated();
    }
    this.burst(e.pos.x, e.pos.y + 1, e.pos.z, 0xeeeeee, 16, 3);
    this.checkQuests();
    if (e.persist) this.save(true);
  }

  hurtPlayer(dmg: number, src: Enemy, unblockable = false) {
    const p = this.p;
    if (p.state === "dead" || this.cine) return;
    if (p.iframes > 0) return;
    const toSrc = Math.atan2(src.pos.x - p.pos.x, src.pos.z - p.pos.z);
    const facing = Math.abs(angDiff(toSrc, p.yaw)) < 1.7;
    if (p.blocking && facing && !unblockable) {
      const parryWin = this.s.skills.includes("g3") ? 0.35 : 0.22;
      if (this.time - p.blockStart < parryWin && src.def.kind !== "warden" || (this.time - p.blockStart < parryWin * 0.7 && src.def.kind === "warden")) {
        audio.play("parry");
        this.slowmo = 0.35; this.shake = 0.15;
        this.clearTele(src);
        src.state = "stagger"; src.t = -0.6; src.poise = 0;
        this.burst(p.pos.x + Math.sin(p.yaw) * 0.8, p.pos.y + 1.3, p.pos.z + Math.cos(p.yaw) * 0.8, 0xfff0a0, 14, 4);
        if (this.s.skills.includes("g3")) this.damageEnemy(src, weaponDamage(this.s) * 2, 0);
        this.ev.toast("PARRY!", "level");
        return;
      }
      const block = ITEMS[this.s.equipped.shield]?.block ?? 0.5;
      const cost = dmg * 1.3 * (this.s.skills.includes("g2") ? 0.6 : 1);
      this.useStamina(cost);
      audio.play("clang");
      this.burst(p.pos.x + Math.sin(p.yaw) * 0.7, p.pos.y + 1.2, p.pos.z + Math.cos(p.yaw) * 0.7, 0xffe08a, 6, 3);
      if (p.st <= 0) { p.state = "hurt"; p.t = 0; p.dur = 0.9; this.ev.toast("Guard broken!", "warn"); dmg *= 0.6; }
      else dmg *= 1 - block;
    }
    const armor = armorFor(this.s);
    dmg = Math.max(1, Math.round(dmg * (1 - Math.min(0.5, armor / 30))));
    p.hp -= dmg;
    this.shake = 0.25;
    audio.play("hurt");
    if (p.hp <= 0) { p.hp = 0; this.die(); return; }
    if (!p.blocking || unblockable) {
      if (p.state !== "hurt") { p.state = "hurt"; p.t = 0; p.dur = 0.35; }
      const kb = src.def.kind === "warden" ? 3 : 1;
      p.pos.x -= Math.sin(toSrc) * kb; p.pos.z -= Math.cos(toSrc) * kb;
    }
  }

  die() {
    const p = this.p; p.state = "dead"; p.t = 0; this.lockTarget = null;
    audio.play("death");
    this.ev.death();
  }
  respawn() {
    const p = this.p; const s = this.s;
    s.gold = Math.floor(s.gold * 0.9);
    this.updateCheckpoint();
    p.pos.copy(this.checkpoint); p.pos.y = groundAt(p.pos.x, p.pos.z);
    p.hp = maxHpFor(s); p.st = maxStaminaFor(s); p.state = "move"; p.vy = 0;
    // reset living enemies
    for (const e of this.enemies) {
      if (e.minion) { this.clearTele(e); this.scene.remove(e.rig.root); continue; }
      if (e.state === "dead") continue;
      this.clearTele(e);
      e.hp = e.maxHp; e.pos.copy(e.home); e.state = e.def.kind === "warden" ? "dormant" : "idle"; e.aggro = false; e.phase = 1;
      if (e.def.kind === "warden") { if (e.rig.core) (e.rig.core.material as THREE.MeshBasicMaterial).color.setHex(0xffa030); e.rig.eyes?.forEach((x) => (x.material as THREE.MeshBasicMaterial).color.setHex(0xffa030)); }
    }
    this.enemies = this.enemies.filter((e) => !e.minion);
    this.save(true);
  }

  // ───────── Main loop ─────────
  start() {
    if (this.running) return;
    this.running = true; this.clock.start();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const raw = Math.min(this.clock.getDelta(), 0.1);
      this.frameAcc += raw;
      const target = 1 / this.settings.fps;
      if (this.frameAcc < target - 0.004) return;
      const dt = Math.min(this.frameAcc, 0.1); this.frameAcc = 0;
      this.fpsFrames++; this.fpsT += dt;
      if (this.fpsT >= 1) { this.fps = Math.round(this.fpsFrames / this.fpsT); this.fpsFrames = 0; this.fpsT = 0; }
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  update(rawDt: number) {
    if (this.paused) return;
    let dt = rawDt;
    if (this.hitstop > 0) { this.hitstop -= rawDt; dt = rawDt * 0.05; }
    if (this.slowmo > 0) { this.slowmo -= rawDt; dt *= 0.35; }
    this.time += dt;
    this.s.playTime += rawDt;
    this.world.update(dt, this.time);

    if (this.cine) {
      this.cine.t += rawDt;
      this.cine.update(this.cine.t, this.camera);
      if (this.cine.t >= this.cine.dur) { const c = this.cine; this.cine = null; c.onEnd?.(); }
    }
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateArrows(dt);
    this.updateFx(dt);
    this.updateEnvironment(rawDt);
    if (!this.cine) this.updateCamera(rawDt);
    this.updateInteract();

    this.hudT += rawDt;
    if (this.hudT > 0.1) { this.hudT = 0; this.pushHud(); this.drawMinimap(); }
    this.discoverT += rawDt;
    if (this.discoverT > 1) { this.discoverT = 0; this.checkDiscovery(); }
    this.saveT += rawDt;
    if (this.saveT > 90 && !this.combat && this.p.state !== "dead") { this.saveT = 0; this.save(true); }
  }

  updatePlayer(dt: number) {
    const p = this.p; const s = this.s; const r = this.rig;
    const mh = maxHpFor(s), ms = maxStaminaFor(s);
    p.iframes -= dt;
    // stamina
    const moving = this.moveDir();
    const wantSprint = (this.input.sprint || this.keys.has("shift")) && moving.lengthSq() > 0.1 && p.state === "move" && !this.input.block;
    p.blocking = (this.input.block || this.keys.has("f")) && (p.state === "move") && this.wcat() !== "bow";
    p.stDelay -= dt;
    if (wantSprint && p.st > 0) { p.st -= 16 * dt; p.stDelay = 0.4; }
    else if (p.stDelay <= 0) p.st = Math.min(ms, p.st + (p.blocking ? 10 : 26) * (s.skills.includes("e2") ? 1.4 : 1) * dt);
    if (p.hp < mh && !this.combat) p.hp = Math.min(mh, p.hp + 0.8 * dt);

    const inWater = p.pos.y < WATER_Y - 0.3;
    const prevX = p.pos.x, prevZ = p.pos.z, prevG = groundAt(prevX, prevZ);
    let speed = 0;
    const canMove = !this.cine && p.state !== "dead";
    if (canMove) {
      if (p.state === "move") {
        const len = moving.length();
        speed = (wantSprint && p.st > 0 ? 8.6 : 5.2) * (s.skills.includes("e1") ? 1.12 : 1) * (inWater ? 0.55 : 1) * (p.blocking ? 0.4 : 1) * Math.min(1, len);
        if (len > 0.05) {
          const dir = moving.clone().normalize();
          p.pos.addScaledVector(dir, speed * dt);
          const target = this.lockTarget && !wantSprint ? Math.atan2(this.lockTarget.pos.x - p.pos.x, this.lockTarget.pos.z - p.pos.z) : Math.atan2(dir.x, dir.z);
          p.yaw += angDiff(target, p.yaw) * Math.min(1, dt * 12);
        } else if (this.lockTarget) {
          p.yaw += angDiff(Math.atan2(this.lockTarget.pos.x - p.pos.x, this.lockTarget.pos.z - p.pos.z), p.yaw) * Math.min(1, dt * 8);
        }
      } else {
        p.t += dt;
        if (p.state === "attack") {
          const lunge = p.t < p.dur * 0.4 ? 2.5 : 0;
          p.pos.x += Math.sin(p.yaw) * lunge * dt; p.pos.z += Math.cos(p.yaw) * lunge * dt;
          if (!p.hitDone && p.t > p.dur * 0.42) { p.hitDone = true; this.playerHit(false); }
          if (p.t >= p.dur) {
            if (p.queued && p.combo < this.maxCombo() && p.st >= 6) this.beginAttack(p.combo);
            else { p.state = "move"; p.combo = 0; }
          }
        } else if (p.state === "heavy") {
          if (p.t > p.dur * 0.35 && p.t < p.dur * 0.55) { p.pos.x += Math.sin(p.yaw) * 4 * dt; p.pos.z += Math.cos(p.yaw) * 4 * dt; }
          if (!p.hitDone && p.t > p.dur * 0.55) { p.hitDone = true; audio.play("heavy"); this.playerHit(true); }
          if (p.t >= p.dur) p.state = "move";
        } else if (p.state === "shoot") {
          if (this.lockTarget) p.yaw = Math.atan2(this.lockTarget.pos.x - p.pos.x, this.lockTarget.pos.z - p.pos.z);
          if (!p.hitDone && p.t > p.dur * 0.6) { p.hitDone = true; this.fireArrow(p.combo === 2); }
          if (p.t >= p.dur) p.state = "move";
        } else if (p.state === "dodge") {
          const k = 1 - p.t / p.dur;
          p.pos.addScaledVector(p.dodgeDir, 14 * k * dt);
          if (p.t >= p.dur) p.state = "move";
        } else if (p.state === "hurt") {
          if (p.t >= p.dur) p.state = "move";
        }
      }
    }
    // gravity
    p.vy -= 22 * dt;
    p.pos.y += p.vy * dt;
    this.collide(p.pos, 0.4);
    // slope limit: too-steep terrain blocks movement (cliffs, hollow walls)
    {
      const step = Math.hypot(p.pos.x - prevX, p.pos.z - prevZ);
      const ng = groundAt(p.pos.x, p.pos.z);
      if (step > 0.0001 && ng - prevG > step * 1.6 + 0.02 && ng > p.pos.y - 0.05) { p.pos.x = prevX; p.pos.z = prevZ; }
    }
    const g = groundAt(p.pos.x, p.pos.z);
    if (p.pos.y <= g) { if (!p.onGround && p.vy < -6) audio.play("step"); p.pos.y = g; p.vy = 0; p.onGround = true; } else if (p.pos.y > g + 0.15) p.onGround = false;
    if (p.pos.y < WATER_Y - 1.1) p.pos.y = Math.max(p.pos.y, g);

    // ── animation ──
    p.speed = speed;
    r.root.position.copy(p.pos);
    if (inWater) r.root.position.y = Math.max(p.pos.y, WATER_Y - 0.9);
    r.root.rotation.y = p.yaw;
    p.walk += dt * (speed > 0.1 ? speed * 1.7 : 0);
    const sw = speed > 0.1 ? Math.sin(p.walk) * Math.min(1, speed / 5) : 0;
    if (speed > 0.1 && p.onGround && Math.abs(Math.sin(p.walk)) > 0.97 && this.time - p.lastStep > 0.25) { p.lastStep = this.time; if (this.settings.effects) audio.play("step"); }
    r.legL.rotation.x = sw * 0.8; r.legR.rotation.x = -sw * 0.8;
    r.body.position.y = speed > 0.1 ? Math.abs(Math.cos(p.walk)) * 0.06 : Math.sin(this.time * 2) * 0.015;
    r.body.rotation.x = 0; r.body.rotation.y = 0; r.body.rotation.z = 0;
    let aR = -sw * 0.7, aL = sw * 0.7, aRz = 0, aRy = 0;
    if (p.blocking) { aL = -1.4; }
    if (this.wcat() === "bow") { aL = -0.3; }
    if (p.state === "attack") {
      const k = p.t / p.dur;
      const swing = k < 0.35 ? k / 0.35 : 1;
      const back = k < 0.35 ? -2.6 * (k / 0.35) : -2.6 + 3.2 * Math.min(1, (k - 0.35) / 0.2);
      if (p.combo % 2 === 1) { aR = back; aRz = 0; }
      else { aR = -1.5; aRy = 0; aRz = 1.4 - 2.8 * Math.min(1, Math.max(0, (k - 0.3) / 0.25)); }
      r.body.rotation.y = (p.combo % 2 === 0 ? 0.5 - swing : 0) * 0.6;
    } else if (p.state === "heavy") {
      const k = p.t / p.dur;
      aR = k < 0.5 ? -3.0 * (k / 0.5) : -3.0 + 3.6 * Math.min(1, (k - 0.5) / 0.15);
      aL = aR * 0.6;
      r.body.rotation.x = k > 0.5 && k < 0.8 ? 0.3 : -0.1;
    } else if (p.state === "shoot") { aL = -1.5; aR = -1.5 + (p.t / p.dur) * 0.4; aRy = 0.3; }
    else if (p.state === "dodge") { r.body.rotation.x = 0.5; r.legL.rotation.x = -0.9; r.legR.rotation.x = 0.6; }
    else if (p.state === "hurt") { r.body.rotation.x = -0.25; }
    else if (p.state === "dead") { r.body.rotation.x = -Math.min(1.5, p.t * 3); p.t += dt; }
    if (!p.onGround) { r.legL.rotation.x = -0.5; r.legR.rotation.x = 0.3; }
    r.armR.rotation.set(aR, aRy, aRz);
    r.armL.rotation.set(aL, 0, p.blocking ? 0.6 : 0);
    r.root.visible = !(p.iframes > 0 && Math.floor(this.time * 40) % 2 === 0 && this.settings.effects === false);
  }

  collide(pos: THREE.Vector3, rad: number) {
    for (const c of this.world.circles) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      if (Math.abs(dx) > c.r + rad || Math.abs(dz) > c.r + rad) continue;
      const d = Math.hypot(dx, dz), m = c.r + rad;
      if (d < m && d > 0.0001) { pos.x = c.x + (dx / d) * m; pos.z = c.z + (dz / d) * m; }
    }
    for (const b of this.world.boxes) {
      if (b.active === false) continue;
      if (pos.x > b.minX - rad && pos.x < b.maxX + rad && pos.z > b.minZ - rad && pos.z < b.maxZ + rad) {
        const l = pos.x - (b.minX - rad), rr = b.maxX + rad - pos.x, t = pos.z - (b.minZ - rad), bb = b.maxZ + rad - pos.z;
        const m = Math.min(l, rr, t, bb);
        if (m === l) pos.x = b.minX - rad; else if (m === rr) pos.x = b.maxX + rad; else if (m === t) pos.z = b.minZ - rad; else pos.z = b.maxZ + rad;
      }
    }
  }

  fireArrow(charged: boolean) {
    const a = this.arrows.find((x) => !x.active); if (!a) return;
    const p = this.p;
    a.active = true; a.m.visible = true; a.life = 2.5;
    a.dmg = weaponDamage(this.s) * (charged ? 2.6 : 1);
    a.m.position.set(p.pos.x + Math.sin(p.yaw) * 0.6, p.pos.y + 1.5, p.pos.z + Math.cos(p.yaw) * 0.6);
    let vy = 0;
    const tgt = this.lockTarget;
    if (tgt) { const d = tgt.pos.distanceTo(p.pos); vy = ((tgt.pos.y + 1.2 * (tgt.def.kind === "warden" ? 2 : 1)) - a.m.position.y) / Math.max(0.1, d / 34); }
    a.v.set(Math.sin(p.yaw) * 34, vy, Math.cos(p.yaw) * 34);
    a.m.lookAt(a.m.position.clone().add(a.v));
    audio.play("arrow");
  }

  updateArrows(dt: number) {
    for (const a of this.arrows) {
      if (!a.active) continue;
      a.life -= dt; a.v.y -= 3 * dt;
      a.m.position.addScaledVector(a.v, dt);
      a.m.lookAt(tmpV.copy(a.m.position).add(a.v));
      let hit = a.life <= 0 || a.m.position.y < heightAt(a.m.position.x, a.m.position.z);
      for (const e of this.enemies) {
        if (hit) break;
        if (e.state === "dead" || e.state === "dormant") continue;
        const h = e.def.kind === "warden" ? 5 : e.def.kind === "wolf" ? 1.2 : 2;
        const dx = a.m.position.x - e.pos.x, dz = a.m.position.z - e.pos.z, dy = a.m.position.y - e.pos.y;
        if (Math.hypot(dx, dz) < e.def.radius + 0.3 && dy > 0 && dy < h) { this.damageEnemy(e, a.dmg, 12); hit = true; }
      }
      if (hit) { a.active = false; a.m.visible = false; }
    }
  }

  updateEnemies(dt: number) {
    const p = this.p;
    let combat = false;
    for (const e of this.enemies) {
      const r = e.rig;
      if (e.state === "dead") {
        e.deadT += dt;
        r.root.rotation.z = Math.min(1.5, e.deadT * 3) * (e.def.kind === "wolf" ? 1 : 0.0);
        r.body.rotation.x = -Math.min(1.4, e.deadT * 3);
        if (e.deadT > 1.2) r.root.position.y -= dt * 1.2;
        if (e.deadT > 3) { this.scene.remove(r.root); }
        continue;
      }
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const toP = Math.atan2(dx, dz);
      const def = e.def;
      const spdMul = e.phase === 2 ? 1.3 : 1;
      e.t += dt; e.cool -= dt;
      let moveSpeed = 0;
      const playerAlive = p.state !== "dead";

      // farther than 90m: skip animation work (cheap culling)
      if (dist > 90 && e.state === "idle") { r.root.visible = false; continue; }
      r.root.visible = true;

      switch (e.state) {
        case "dormant":
          if (e.def.kind === "warden" && playerAlive && p.pos.z > 110 && Math.abs(p.pos.x) < 15 && this.s.flags.gateOpen && !this.cine) this.bossIntro(e);
          if (e.rig.core) e.rig.core.rotation.y += dt;
          break;
        case "roar":
          if (!this.cine && e.t > 1.8) { e.state = "chase"; }
          r.armL.rotation.x = r.armR.rotation.x = -2.6;
          if (e.phase === 2 && e.t < 1.5) this.shake = Math.max(this.shake, 0.08);
          break;
        case "idle": {
          if (playerAlive && dist < def.aggro && !this.cine) { e.state = "chase"; e.aggro = true; break; }
          // gentle wander
          const wx = e.home.x + Math.sin(e.t * 0.3 + e.home.z) * 3, wz = e.home.z + Math.cos(e.t * 0.25 + e.home.x) * 3;
          const wd = Math.hypot(wx - e.pos.x, wz - e.pos.z);
          if (wd > 0.5) { const a = Math.atan2(wx - e.pos.x, wz - e.pos.z); e.yaw += angDiff(a, e.yaw) * dt * 3; moveSpeed = 1.2; }
          break;
        }
        case "return": {
          const hx = e.home.x - e.pos.x, hz = e.home.z - e.pos.z, hd = Math.hypot(hx, hz);
          e.yaw = Math.atan2(hx, hz); moveSpeed = def.speed * 1.2;
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
          if (hd < 1.5) { e.state = "idle"; e.aggro = false; }
          break;
        }
        case "chase": {
          combat = true;
          if (!playerAlive || (def.kind !== "warden" && e.pos.distanceTo(e.home) > 40)) { e.state = "return"; break; }
          e.yaw += angDiff(toP, e.yaw) * Math.min(1, dt * 6);
          // pick attack
          const opts = def.attacks.filter((a, i) => (def.kind !== "warden" || e.phase === 2 || i < 2) && dist < a.range * 0.95);
          if (opts.length && e.cool <= 0) {
            e.atk = opts[Math.floor(Math.random() * opts.length)];
            e.state = "windup"; e.t = 0; e.hitDone = false;
            if (e.atk.aoe) this.tele(e, e.atk);
          } else if (dist > def.radius + 1.2) moveSpeed = def.speed * spdMul;
          else if (def.kind === "wolf") { moveSpeed = -1.5; }
          break;
        }
        case "windup": {
          combat = true;
          const a = e.atk!;
          const wind = a.windup / spdMul;
          if (a.aoe !== "ring" && a.aoe !== "around") e.yaw += angDiff(toP, e.yaw) * Math.min(1, dt * (e.t < wind * 0.6 ? 5 : 1));
          if (e.tele) {
            const mat = e.tele.material as THREE.MeshBasicMaterial; mat.opacity = 0.15 + 0.35 * (e.t / wind);
            if (a.aoe === "front") e.tele.position.set(e.pos.x + Math.sin(e.yaw) * (a.range - (a.radius ?? 2) * 0.6), e.pos.y + 0.12, e.pos.z + Math.cos(e.yaw) * (a.range - (a.radius ?? 2) * 0.6));
            if (a.aoe === "charge") e.tele.position.set(e.pos.x + Math.sin(e.yaw) * 2, e.pos.y + 0.12, e.pos.z + Math.cos(e.yaw) * 2);
          }
          if (e.t >= wind) { e.state = "active"; e.t = 0; e.ringR = 0; if (def.kind === "warden" || def.kind === "guardian") audio.play("slam"); else audio.play("swing"); }
          break;
        }
        case "active": {
          combat = true;
          const a = e.atk!;
          if (a.lunge && e.t < a.active) moveSpeed = a.lunge;
          if (a.aoe === "ring") {
            e.ringR = (e.t / a.active) * (a.radius ?? 14);
            if (e.tele) { e.tele.visible = true; e.tele.scale.set(Math.max(0.1, e.ringR), 1, Math.max(0.1, e.ringR)); (e.tele.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - e.t / a.active); }
            if (!e.hitDone && Math.abs(dist - e.ringR) < 1.0 && p.onGround) { e.hitDone = true; this.hurtPlayer(a.dmg, e, true); }
            if (e.t < 0.1) this.shake = 0.3;
          } else if (a.aoe === "charge") {
            if (!e.hitDone && dist < def.radius + 1.2) { e.hitDone = true; this.hurtPlayer(a.dmg, e); }
          } else if (!e.hitDone) {
            e.hitDone = true;
            this.clearTele(e);
            if (a.aoe === "front") {
              const cx = e.pos.x + Math.sin(e.yaw) * (a.range - (a.radius ?? 2) * 0.6), cz = e.pos.z + Math.cos(e.yaw) * (a.range - (a.radius ?? 2) * 0.6);
              this.shake = Math.max(this.shake, def.kind === "warden" ? 0.35 : 0.15);
              this.burst(cx, e.pos.y + 0.3, cz, 0xa89a80, 12, 4);
              if (Math.hypot(p.pos.x - cx, p.pos.z - cz) < (a.radius ?? 2) + 0.4 && p.pos.y - e.pos.y < 1.5) this.hurtPlayer(a.dmg, e);
            } else if (a.aoe === "around") {
              if (dist < (a.radius ?? 3) + 0.4) this.hurtPlayer(a.dmg, e);
              this.burst(e.pos.x, e.pos.y + 1, e.pos.z, 0xa89a80, 10, 5);
            } else if (dist < a.range + 0.3 && Math.abs(angDiff(toP, e.yaw)) < a.arc / 2) this.hurtPlayer(a.dmg, e);
          }
          if (e.t >= a.active) { this.clearTele(e); e.state = "recover"; e.t = 0; }
          break;
        }
        case "recover":
          combat = true;
          if (e.t >= e.atk!.recover / spdMul) { e.state = "chase"; e.cool = 0.2 + Math.random() * (def.kind === "warden" ? 0.6 : 1); }
          break;
        case "stagger":
          combat = true;
          if (e.t >= 0.7) { e.state = "chase"; e.cool = 0.4; }
          break;
      }

      if (moveSpeed !== 0) {
        e.pos.x += Math.sin(e.yaw) * moveSpeed * dt;
        e.pos.z += Math.cos(e.yaw) * moveSpeed * dt;
      }
      // separation from player & others
      if (dist < def.radius + 0.5 && dist > 0.01) { const push = (def.radius + 0.5 - dist); e.pos.x -= (dx / dist) * push; e.pos.z -= (dz / dist) * push; }
      for (const o of this.enemies) {
        if (o === e || o.state === "dead") continue;
        const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, od = Math.hypot(ox, oz), m = def.radius + o.def.radius;
        if (od < m && od > 0.01) { e.pos.x += (ox / od) * (m - od) * 0.5; e.pos.z += (oz / od) * (m - od) * 0.5; }
      }
      this.collide(e.pos, def.radius * 0.7);
      e.pos.y = groundAt(e.pos.x, e.pos.z);

      // animate
      r.root.position.copy(e.pos);
      r.root.rotation.y = e.yaw;
      e.walk += dt * Math.abs(moveSpeed) * 2;
      const sw = Math.abs(moveSpeed) > 0.1 ? Math.sin(e.walk) : 0;
      r.legL.rotation.x = sw * 0.7; r.legR.rotation.x = -sw * 0.7;
      if (def.kind === "wolf") { r.armL.rotation.x = -sw * 0.7; r.armR.rotation.x = sw * 0.7; }
      r.body.rotation.x = 0;
      if (def.kind !== "wolf" && e.state !== "roar") {
        let ar = -sw * 0.5, al = sw * 0.5;
        if (e.state === "windup") { ar = -2.6 * Math.min(1, e.t / (e.atk!.windup * 0.6)); al = e.atk!.aoe === "front" || e.atk!.aoe === "around" ? ar : al; r.body.rotation.x = -0.15; }
        else if (e.state === "active") { ar = 0.6; al = e.atk!.aoe ? 0.6 : al; r.body.rotation.x = 0.25; if (e.atk!.aoe === "around") r.body.rotation.y += dt * 20; }
        else if (e.state === "stagger") { r.body.rotation.x = -0.4; ar = -0.5; al = -0.5; }
        if (e.state !== "active") r.body.rotation.y = 0;
        r.armR.rotation.x = ar; r.armL.rotation.x = al;
      } else if (def.kind === "wolf") {
        if (e.state === "windup") r.body.rotation.x = -0.25;
        else if (e.state === "active") r.body.rotation.x = 0.2;
      }
      // hit flash / telegraph glow
      const glow = e.flash > 0 ? 0x993322 : e.state === "windup" ? (Math.floor(e.t * 12) % 2 ? 0x551100 : 0x220800) : 0x000000;
      e.flash -= dt;
      for (const m of r.mats) m.emissive.setHex(glow);
      if (r.core) r.core.rotation.y += dt * 2;
    }
    // remove fully dead
    this.enemies = this.enemies.filter((e) => !(e.state === "dead" && e.deadT > 3));
    if (this.lockTarget && (this.lockTarget.state === "dead" || this.lockTarget.pos.distanceTo(p.pos) > 30)) this.lockTarget = null;
    if (combat !== this.combat) { this.combat = combat; audio.combat = combat; }
  }

  updateFx(dt: number) {
    for (const pt of this.particles) {
      if (!pt.active) continue;
      pt.life += dt; pt.v.y -= 9 * dt;
      pt.m.position.addScaledVector(pt.v, dt);
      (pt.m.material as THREE.MeshBasicMaterial).opacity = 1 - pt.life / pt.max;
      if (pt.life >= pt.max) { pt.active = false; pt.m.visible = false; }
    }
    const sm = this.slash.material as THREE.MeshBasicMaterial;
    if (sm.opacity > 0) sm.opacity = Math.max(0, sm.opacity - dt * 4);
    // quest marker beacon
    const tgt = this.questTarget();
    this.marker.visible = !!tgt && this.settings.markers && !this.cine;
    if (tgt) { this.marker.position.set(tgt[0], heightAt(tgt[0], tgt[1]) + 30, tgt[1]); (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(this.time * 3) * 0.06; }
    // NPC quest markers
    for (const it of this.world.interactables) {
      if (it.kind !== "npc") continue;
      const mk = it.data?.marker as THREE.Mesh; if (mk) mk.visible = this.npcHasNews(it.id);
    }
  }

  npcHasNews(id: string) {
    const s = this.s;
    if (id === "mira") return !s.quests.main.done && [0, 5].includes(s.quests.main.stage);
    if (id === "toma") return !s.quests.herbs || (s.quests.herbs.stage === 1 && !s.quests.herbs.done);
    if (id === "bren") return !s.quests.wolves || (s.quests.wolves.stage === 1 && !s.quests.wolves.done);
    if (id === "varek") return !s.flags.varekMet;
    return false;
  }

  questTarget(): [number, number] | null {
    const q = this.s.quests[this.s.activeQuest]; if (!q || q.done) return null;
    const def = QUESTS[this.s.activeQuest];
    if (this.s.activeQuest === "relics") {
      if (!this.s.skills.includes("e3")) return null;
      const r = this.world.interactables.find((i) => i.kind === "relic" && !i.done); return r ? [r.x, r.z] : null;
    }
    if (this.s.activeQuest === "herbs" && q.stage === 0) {
      let best: Interactable | null = null, bd = 1e9;
      for (const i of this.world.interactables) if (i.kind === "herb" && !i.done) { const d = Math.hypot(i.x - this.p.pos.x, i.z - this.p.pos.z); if (d < bd) { bd = d; best = i; } }
      if (best) return [best.x, best.z];
    }
    return def.stages[q.stage]?.target ?? null;
  }

  updateEnvironment(dt: number) {
    const s = this.s;
    s.time = (s.time + dt / 480) % 1; // 8 min full day
    const ang = s.time * Math.PI * 2 - Math.PI / 2;
    const elev = Math.sin(ang);
    const p = this.p.pos;
    this.sun.position.set(p.x + Math.cos(ang) * 50, p.y + Math.max(8, elev * 70), p.z + 25);
    this.sun.target.position.copy(p);
    const day = clamp(elev * 2.5 + 0.3, 0, 1);
    const dusk = clamp(1 - Math.abs(elev) * 4, 0, 1);
    this.skyCol.copy(this.skyNight).lerp(this.skyDay, day).lerp(this.skyDusk, dusk * 0.5);
    if (this.raining) this.skyCol.lerp(new THREE.Color(0x6a7480), 0.6);
    this.scene.background = this.skyCol;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.skyCol);
    const fogMul = this.raining ? 0.6 : 1;
    fog.far = (this.settings.preset === "low" ? 150 : 210) * fogMul;
    fog.near = (this.settings.preset === "low" ? 40 : 60) * fogMul;
    this.sun.intensity = 0.25 + day * 2.0 * (this.raining ? 0.5 : 1);
    this.sun.color.setHSL(0.1, 0.6, 0.6 + day * 0.3);
    this.hemi.intensity = 0.55 + day * 0.75;
    this.hemi.color.setHex(day > 0.3 ? 0xcfe6ff : 0x6a7ab0);
    audio.night = day < 0.25;
    const inTemple = Math.abs(p.x) < 18 && p.z > 75 && p.z < 145;
    if (inTemple !== audio.temple) audio.setRegionAmbience(inTemple);

    // weather
    if (this.settings.weather) {
      this.weatherT -= dt;
      if (this.weatherT <= 0) { this.raining = !this.raining && Math.random() < 0.5; this.weatherT = this.raining ? 60 + Math.random() * 60 : 120 + Math.random() * 120; }
      if (this.raining && !this.rain) {
        const n = this.settings.preset === "high" ? 900 : 450;
        const arr = new Float32Array(n * 6);
        for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 50, y = Math.random() * 25, z = (Math.random() - 0.5) * 50; arr.set([x, y, z, x, y - 0.6, z], i * 6); }
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.5 }));
        this.rain.frustumCulled = false;
        this.scene.add(this.rain);
      }
      if (!this.raining && this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain = null; }
      if (this.rain) {
        const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < arr.length; i += 6) {
          arr[i + 1] -= 28 * dt; arr[i + 4] -= 28 * dt;
          if (arr[i + 4] < -2) { arr[i + 1] += 27; arr[i + 4] += 27; }
        }
        pos.needsUpdate = true;
        this.rain.position.set(p.x, p.y - 2, p.z);
      }
    }
  }

  updateCamera(dt: number) {
    const p = this.p;
    if (this.lockTarget) {
      const t = this.lockTarget;
      const want = Math.atan2(p.pos.x - t.pos.x, p.pos.z - t.pos.z);
      this.camYaw += angDiff(want, this.camYaw) * Math.min(1, dt * 5);
      this.camPitch += (0.32 - this.camPitch) * Math.min(1, dt * 3);
    }
    const dist = this.lockTarget?.def.kind === "warden" ? 9 : this.camDist;
    const tx = p.pos.x, ty = p.pos.y + 1.7, tz = p.pos.z;
    const cp = Math.cos(this.camPitch);
    let cx = tx + Math.sin(this.camYaw) * cp * dist, cy = ty + Math.sin(this.camPitch) * dist, cz = tz + Math.cos(this.camYaw) * cp * dist;
    const gy = groundAt(cx, cz) + 0.6;
    if (cy < gy) cy = gy;
    // smooth follow
    const k = Math.min(1, dt * 14);
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (cy - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s;
    }
    if (this.lockTarget) {
      const t = this.lockTarget; const h = t.def.kind === "warden" ? 2.5 : 1;
      this.camera.lookAt(tx * 0.6 + t.pos.x * 0.4, ty * 0.6 + (t.pos.y + h) * 0.4, tz * 0.6 + t.pos.z * 0.4);
    } else this.camera.lookAt(tx, ty, tz);
  }

  updateInteract() {
    let best: Interactable | null = null, bd = 2.8;
    if (this.p.state === "move" && !this.cine) {
      for (const it of this.world.interactables) {
        if (it.done) continue;
        const d = Math.hypot(it.x - this.p.pos.x, it.z - this.p.pos.z);
        if (d < bd) { bd = d; best = it; }
      }
    }
    this.near = best;
  }

  checkDiscovery() {
    const s = this.s;
    for (const l of LOCATIONS) {
      if (s.discovered.includes(l.id)) continue;
      if (Math.hypot(this.p.pos.x - l.x, this.p.pos.z - l.z) < l.r) {
        s.discovered.push(l.id);
        this.ev.toast(`Discovered: ${l.name}`, "discover");
        this.giveXp(20);
        audio.play("puzzle");
      }
    }
  }

  regionName() {
    const p = this.p.pos;
    let best = "Forgotten Valley", bd = 1e9;
    for (const l of LOCATIONS) { const d = Math.hypot(p.x - l.x, p.z - l.z); if (d < l.r * 1.4 && d < bd) { bd = d; best = l.name; } }
    return best;
  }

  pushHud() {
    const s = this.s; const p = this.p;
    const qid = s.activeQuest; const q = s.quests[qid]; const qd = QUESTS[qid];
    const st = q && !q.done ? qd.stages[q.stage] : null;
    const boss = this.bossRef && this.bossRef.aggro && this.bossRef.state !== "dead" ? { name: this.bossRef.def.name, hp: this.bossRef.hp, max: this.bossRef.maxHp, phase: this.bossRef.phase } : null;
    const lt = this.lockTarget && !boss ? this.lockTarget : null;
    const w = ITEMS[s.equipped.weapon];
    const hrs = Math.floor(s.time * 24), mins = Math.floor((s.time * 24 - hrs) * 60);
    let sub: string | null = null;
    if (this.cine) for (const [t, txt] of this.cine.subs) if (this.cine.t >= t) sub = txt;
    this.ev.hud({
      hp: p.hp, maxHp: maxHpFor(s), st: p.st, maxSt: maxStaminaFor(s), level: s.level, xp: s.xp, xpNext: xpForLevel(s.level), gold: s.gold,
      weapon: w?.name ?? "", weaponIcon: w?.icon ?? "", weaponCat: w?.cat ?? "", potions: (s.inventory.potion ?? 0) + (s.inventory.greater_potion ?? 0), potionId: s.inventory.potion ? "potion" : "greater_potion",
      questName: q?.done ? `${qd.name} ✓` : qd?.name ?? "", questText: st?.text ?? (q?.done ? "Complete. Open the journal for more quests." : ""),
      questProgress: st?.goal ? `${Math.min(q.progress, st.goal)}/${st.goal}` : "",
      interact: this.near ? this.near.label + (this.near.kind === "npc" ? ` (${this.near.id[0].toUpperCase() + this.near.id.slice(1)})` : "") : null,
      boss: boss ?? (lt ? { name: lt.def.name, hp: lt.hp, max: lt.maxHp, phase: 0 } : null),
      lockOn: !!this.lockTarget, combat: this.combat, region: this.regionName(),
      clock: `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`, blocking: p.blocking, sprint: this.input.sprint,
      fps: this.fps, cinematic: sub, letterbox: !!this.cine, skillPoints: s.skillPoints, weather: this.raining ? "🌧️" : s.time > 0.25 && s.time < 0.78 ? "☀️" : "🌙",
    });
  }

  // ───────── Minimap & world map ─────────
  renderMapImage() {
    const N = 256; const c = document.createElement("canvas"); c.width = N; c.height = N;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N) * 320 - 160, z = (j / N) * 320 - 160;
      const h = heightAt(x, z);
      let r = 70, g = 110, b = 50;
      if (h < WATER_Y) { r = 50; g = 110; b = 150; }
      else if (Math.abs(z - riverZ(x)) < 9) { r = 170; g = 155; b = 110; }
      else if (h > 12) { r = 120; g = 115; b = 105; }
      if (h > 30) { r = 220; g = 225; b = 230; }
      const shade = 0.75 + clamp((heightAt(x + 2, z) - h) * 0.15, -0.2, 0.25);
      const k = (j * N + i) * 4;
      img.data[k] = r * shade; img.data[k + 1] = g * shade; img.data[k + 2] = b * shade; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = "rgba(200,190,160,0.9)";
    for (const l of [[0, -60, 10], [80, -50, 9], [0, 110, 14]] as const) { ctx.beginPath(); ctx.arc(((l[0] + 160) / 320) * N, ((l[1] + 160) / 320) * N, (l[2] / 320) * N, 0, 7); ctx.fill(); }
    return c;
  }

  drawMinimap() {
    const c = this.minimap; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const W = c.width, H = c.height;
    const view = 110; // meters across
    const scale = W / view;
    const p = this.p.pos;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    const imgScale = 256 / 320;
    const sx = (p.x + 160 - view / 2) * imgScale, sz = (p.z + 160 - view / 2) * imgScale;
    ctx.drawImage(this.mapImage, sx, sz, view * imgScale, view * imgScale, 0, 0, W, H);
    const toMap = (x: number, z: number): [number, number] => [W / 2 + (x - p.x) * scale, H / 2 + (z - p.z) * scale];
    // interactables
    for (const it of this.world.interactables) {
      if (it.done) continue;
      if (it.kind === "relic" && !this.s.skills.includes("e3")) continue;
      if (it.kind === "herb" && !(this.s.quests.herbs && !this.s.quests.herbs.done)) continue;
      const [mx, my] = toMap(it.x, it.z);
      if (mx < 0 || my < 0 || mx > W || my > H) continue;
      ctx.fillStyle = it.kind === "npc" ? "#ffd76a" : it.kind === "chest" ? "#c08a3a" : it.kind === "relic" ? "#7ae0ff" : it.kind === "herb" ? "#c8ffd0" : "#bbbbbb";
      ctx.beginPath(); ctx.arc(mx, my, it.kind === "npc" ? 4 : 3, 0, 7); ctx.fill();
    }
    for (const e of this.enemies) {
      if (e.state === "dead" || e.state === "dormant") continue;
      const [mx, my] = toMap(e.pos.x, e.pos.z);
      ctx.fillStyle = e.def.kind === "warden" ? "#ff5020" : "#ff3a3a";
      ctx.beginPath(); ctx.arc(mx, my, e.def.kind === "warden" ? 6 : 3, 0, 7); ctx.fill();
    }
    // quest target
    const tgt = this.questTarget();
    if (tgt && this.settings.markers) {
      let [mx, my] = toMap(tgt[0], tgt[1]);
      const dx = mx - W / 2, dy = my - H / 2, d = Math.hypot(dx, dy), R = W / 2 - 10;
      const edge = d > R;
      if (edge) { mx = W / 2 + (dx / d) * R; my = H / 2 + (dy / d) * R; }
      ctx.fillStyle = "#ffcf40"; ctx.strokeStyle = "#3a2600"; ctx.lineWidth = 2;
      ctx.beginPath();
      if (edge) { const a = Math.atan2(dy, dx); ctx.moveTo(mx + Math.cos(a) * 8, my + Math.sin(a) * 8); ctx.lineTo(mx + Math.cos(a + 2.4) * 7, my + Math.sin(a + 2.4) * 7); ctx.lineTo(mx + Math.cos(a - 2.4) * 7, my + Math.sin(a - 2.4) * 7); }
      else { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 3 : 7; ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r); } }
      ctx.closePath(); ctx.stroke(); ctx.fill();
    }
    // player arrow
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-this.p.yaw + Math.PI);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // view cone (camera)
  }

  setPaused(b: boolean) { this.paused = b; if (b) { this.input.mx = 0; this.input.my = 0; this.keys.clear(); } }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); });
    this.renderer.dispose();
  }
}

export type { Sfx };
