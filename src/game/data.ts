// ───────────────────────── Handcrafted game data ─────────────────────────
export type ItemType = "weapon" | "armor" | "shield" | "potion" | "material" | "artifact" | "quest";
export type WeaponCat = "sword" | "heavy" | "dagger" | "bow";

export interface ItemDef {
  name: string;
  type: ItemType;
  icon: string;
  desc: string;
  dmg?: number;
  speed?: number; // attack speed multiplier
  range?: number;
  cat?: WeaponCat;
  armor?: number;
  block?: number; // block damage reduction 0..1
  heal?: number;
  value?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  rusty_sword: { name: "Rusty Sword", type: "weapon", cat: "sword", icon: "🗡️", dmg: 10, speed: 1, range: 2.2, desc: "Kael's old blade. Notched, but honest." },
  valley_blade: { name: "Valley Blade", type: "weapon", cat: "sword", icon: "⚔️", dmg: 17, speed: 1.05, range: 2.3, desc: "A sword forged by Hollowbrook smiths, balanced and keen." },
  warhammer: { name: "Bandit Warhammer", type: "weapon", cat: "heavy", icon: "🔨", dmg: 28, speed: 0.7, range: 2.5, desc: "Slow, brutal, and great at breaking stone." },
  twin_daggers: { name: "Twin Daggers", type: "weapon", cat: "dagger", icon: "🔪", dmg: 7, speed: 1.6, range: 1.8, desc: "Lightning-fast strikes. Combos chain longer." },
  hunter_bow: { name: "Hunter's Bow", type: "weapon", cat: "bow", icon: "🏹", dmg: 13, speed: 1, range: 40, desc: "Bren's bow. Attack fires arrows; heavy fires a charged shot." },
  traveler_garb: { name: "Traveler's Garb", type: "armor", icon: "🧥", armor: 2, desc: "Well-worn cloth from a long voyage." },
  leather_guard: { name: "Leather Guard", type: "armor", icon: "🦺", armor: 6, desc: "Boiled leather. Light and reliable." },
  ruin_plate: { name: "Ruin-Forged Plate", type: "armor", icon: "🛡️", armor: 12, desc: "Armor of an ancient sentinel, humming faintly." },
  oak_shield: { name: "Oak Shield", type: "shield", icon: "🛡️", block: 0.75, desc: "Blocks 75% of damage." },
  sun_shield: { name: "Sunward Aegis", type: "shield", icon: "🌞", block: 0.9, desc: "An ancient shield. Blocks 90% of damage." },
  potion: { name: "Healing Draught", type: "potion", icon: "🧪", heal: 45, desc: "Restores 45 health." },
  greater_potion: { name: "Greater Draught", type: "potion", icon: "⚗️", heal: 100, desc: "Restores 100 health." },
  herb: { name: "Moonpetal", type: "material", icon: "🌿", desc: "Pale herb used in healing draughts." },
  iron_ore: { name: "Iron Ore", type: "material", icon: "🪨", desc: "Used to upgrade weapons and armor." },
  wolf_pelt: { name: "Wolf Pelt", type: "material", icon: "🐺", desc: "Thick fur. Crafts into leather armor." },
  ancient_shard: { name: "Ancient Shard", type: "material", icon: "💠", desc: "Fragment of Sundered stone, glowing with old power." },
  sun_key: { name: "Sun Key", type: "quest", icon: "🔑", desc: "A bronze disc engraved with a rising sun." },
  sun_fragment: { name: "Sun Fragment", type: "quest", icon: "☀️", desc: "A warm crystal shard. It beats like a heart." },
  relic_mask: { name: "Relic: Jade Mask", type: "artifact", icon: "🎭", desc: "Mask of a temple priest. 'We sang to the Heart, and it sang back.'" },
  relic_tablet: { name: "Relic: Star Tablet", type: "artifact", icon: "📜", desc: "Star charts showing six lands around one burning center." },
  relic_idol: { name: "Relic: Broken Idol", type: "artifact", icon: "🗿", desc: "A king's idol, its crown deliberately shattered." },
};

export interface Recipe { id: string; out: string; n: number; needs: Record<string, number>; }
export const RECIPES: Recipe[] = [
  { id: "r_potion", out: "potion", n: 1, needs: { herb: 2 } },
  { id: "r_gpotion", out: "greater_potion", n: 1, needs: { herb: 3, ancient_shard: 1 } },
  { id: "r_leather", out: "leather_guard", n: 1, needs: { wolf_pelt: 3 } },
  { id: "r_blade", out: "valley_blade", n: 1, needs: { iron_ore: 4 } },
];

// ───────────────────────── Skills ─────────────────────────
export interface SkillDef { id: string; tree: "Warrior" | "Explorer" | "Guardian"; name: string; desc: string; req?: string; icon: string; }
export const SKILLS: SkillDef[] = [
  { id: "w1", tree: "Warrior", name: "Keen Edge", desc: "+15% weapon damage.", icon: "🗡️" },
  { id: "w2", tree: "Warrior", name: "Flurry", desc: "Attack 15% faster; adds a 4th combo strike.", req: "w1", icon: "🌀" },
  { id: "w3", tree: "Warrior", name: "Crushing Blow", desc: "Heavy attacks deal +50% and always stagger.", req: "w2", icon: "💥" },
  { id: "e1", tree: "Explorer", name: "Fleet Foot", desc: "+12% movement speed.", icon: "👣" },
  { id: "e2", tree: "Explorer", name: "Second Wind", desc: "+40% stamina regeneration.", req: "e1", icon: "🌬️" },
  { id: "e3", tree: "Explorer", name: "Treasure Sense", desc: "Hidden relics appear on the minimap; +50% gold.", req: "e2", icon: "🧭" },
  { id: "g1", tree: "Guardian", name: "Vitality", desc: "+30 max health.", icon: "❤️" },
  { id: "g2", tree: "Guardian", name: "Iron Wall", desc: "Blocking costs 40% less stamina.", req: "g1", icon: "🧱" },
  { id: "g3", tree: "Guardian", name: "Riposte", desc: "Wider parry window; parries deal heavy damage.", req: "g2", icon: "✨" },
];

// ───────────────────────── Quests ─────────────────────────
export interface QuestDef { id: string; name: string; main?: boolean; stages: { text: string; target?: [number, number]; goal?: number }[]; reward: string; }
export const QUESTS: Record<string, QuestDef> = {
  main: {
    id: "main", name: "The Forgotten Map", main: true, reward: "Sun Fragment, 300 XP, Golden Desert unlocked",
    stages: [
      { text: "Speak with Elder Mira in Hollowbrook", target: [4, -58] },
      { text: "Drive the bandits from the Old Mill camp", target: [78, -48], goal: 4 },
      { text: "Open the bandit chief's chest for the Sun Key", target: [84, -56] },
      { text: "Align the three Sun Pillars at the Valley Temple", target: [0, 92] },
      { text: "Defeat the Stone Warden in the Sun Court", target: [0, 124] },
      { text: "Return to Elder Mira with the Sun Fragment", target: [4, -58] },
    ],
  },
  herbs: {
    id: "herbs", name: "Herbalist's Remedy", reward: "3 Healing Draughts, 80 XP",
    stages: [
      { text: "Gather Moonpetal herbs near the river", goal: 5, target: [-20, 18] },
      { text: "Bring the herbs to Toma the herbalist", target: [-12, -66] },
    ],
  },
  wolves: {
    id: "wolves", name: "Wolf Trouble", reward: "Hunter's Bow, 100 XP",
    stages: [
      { text: "Hunt the wolves in Greywood (west forest)", goal: 3, target: [-88, -12] },
      { text: "Report back to Bren the hunter", target: [-48, -56] },
    ],
  },
  relics: {
    id: "relics", name: "Echoes of the Ancients", reward: "Ruin-Forged Plate, 150 XP",
    stages: [{ text: "Find the hidden ancient relics of the valley", goal: 3 }],
  },
};

export interface QuestState { stage: number; progress: number; done: boolean; }

// ───────────────────────── Regions ─────────────────────────
export const REGIONS = [
  { id: "valley", name: "Forgotten Valley", icon: "🌲", desc: "Forests, rivers and the first temple. The journey begins.", x: 22, y: 64 },
  { id: "desert", name: "Golden Desert", icon: "🏜️", desc: "Buried temples and the Sand Colossus.", x: 62, y: 72 },
  { id: "jungle", name: "Emerald Jungle", icon: "🌴", desc: "Waterfalls, ancient bridges, the Thorn Queen.", x: 18, y: 30 },
  { id: "highlands", name: "Frozen Highlands", icon: "🏔️", desc: "Abandoned fortresses and the Frost Warden.", x: 52, y: 18 },
  { id: "sunken", name: "Sunken Kingdom", icon: "🌊", desc: "Flooded halls and drowned secrets.", x: 82, y: 40 },
  { id: "capital", name: "Ancient Capital", icon: "🏛️", desc: "Seat of the Last King. The Heart of the Sundering.", x: 50, y: 46 },
];

// Points of interest in the Forgotten Valley (for discovery + map)
export const LOCATIONS = [
  { id: "hollowbrook", name: "Hollowbrook Village", x: 0, z: -60, r: 22 },
  { id: "oldmill", name: "Old Mill Camp", x: 80, z: -50, r: 20 },
  { id: "greywood", name: "Greywood", x: -88, z: -12, r: 28 },
  { id: "river", name: "Silverrun River", x: 0, z: 14, r: 12 },
  { id: "temple", name: "Valley Temple", x: 0, z: 95, r: 20 },
  { id: "suncourt", name: "Sun Court", x: 0, z: 124, r: 12 },
  { id: "watchhill", name: "Watcher's Hill Ruins", x: -72, z: 72, r: 16 },
  { id: "hiddenhollow", name: "Hidden Hollow", x: 118, z: 98, r: 10 },
];

// ───────────────────────── Save data ─────────────────────────
export interface SaveData {
  version: number;
  pos: [number, number, number];
  yaw: number;
  hp: number;
  level: number;
  xp: number;
  skillPoints: number;
  skills: string[];
  gold: number;
  inventory: Record<string, number>;
  equipped: { weapon: string; armor: string; shield: string };
  upgrades: Record<string, number>;
  quests: Record<string, QuestState>;
  activeQuest: string;
  discovered: string[];
  unlockedRegions: string[];
  artifacts: string[];
  flags: Record<string, string | boolean | number>;
  killed: string[];
  opened: string[];
  collected: string[];
  time: number; // 0..1 time of day
  playTime: number;
  savedAt?: number;
}

export function newSave(): SaveData {
  return {
    version: 1,
    pos: [0, 0, -44],
    yaw: Math.PI,
    hp: 100,
    level: 1,
    xp: 0,
    skillPoints: 0,
    skills: [],
    gold: 15,
    inventory: { rusty_sword: 1, traveler_garb: 1, potion: 3 },
    equipped: { weapon: "rusty_sword", armor: "traveler_garb", shield: "" },
    upgrades: {},
    quests: { main: { stage: 0, progress: 0, done: false } },
    activeQuest: "main",
    discovered: [],
    unlockedRegions: ["valley"],
    artifacts: [],
    flags: {},
    killed: [],
    opened: [],
    collected: [],
    time: 0.3,
    playTime: 0,
  };
}

export interface Settings {
  preset: "low" | "medium" | "high";
  resScale: number;
  shadows: boolean;
  effects: boolean;
  weather: boolean;
  fps: 30 | 60;
  sensitivity: number;
  invertY: boolean;
  markers: boolean;
  music: number;
  sfx: number;
  buttonScale: number;
  buttonOffsetX: number;
  buttonOffsetY: number;
  showFps: boolean;
}

export const PRESETS: Record<Settings["preset"], Partial<Settings>> = {
  low: { resScale: 0.6, shadows: false, effects: false, weather: false, fps: 30 },
  medium: { resScale: 0.8, shadows: true, effects: true, weather: true, fps: 30 },
  high: { resScale: 1, shadows: true, effects: true, weather: true, fps: 60 },
};

export function defaultSettings(): Settings {
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const preset: Settings["preset"] = mobile ? "medium" : "high";
  return {
    ...(PRESETS[preset] as Settings),
    preset,
    sensitivity: 1,
    invertY: false,
    markers: true,
    music: 0.5,
    sfx: 0.8,
    buttonScale: 1,
    buttonOffsetX: 0,
    buttonOffsetY: 0,
    showFps: false,
  } as Settings;
}

const SAVE_KEY = "lotlw_save_v1";
const SET_KEY = "lotlw_settings_v1";

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { ...newSave(), ...d };
  } catch {
    return null;
  }
}
export function writeSave(s: SaveData) {
  try {
    s.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
export function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SET_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultSettings();
}
export function writeSettings(s: Settings) { try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

export function xpForLevel(level: number) { return 80 + level * 70; }
export function maxHpFor(s: SaveData) { return 100 + (s.level - 1) * 10 + (s.skills.includes("g1") ? 30 : 0); }
export function maxStaminaFor(s: SaveData) { return 100 + (s.level - 1) * 4; }
export function armorFor(s: SaveData) {
  const a = ITEMS[s.equipped.armor]?.armor ?? 0;
  return a + (s.upgrades[s.equipped.armor] ?? 0) * 2;
}
export function weaponDamage(s: SaveData, id = s.equipped.weapon) {
  const base = ITEMS[id]?.dmg ?? 5;
  const up = s.upgrades[id] ?? 0;
  return Math.round(base * (1 + up * 0.18) * (s.skills.includes("w1") ? 1.15 : 1));
}
export function upgradeCost(s: SaveData, id: string): Record<string, number> {
  const lvl = s.upgrades[id] ?? 0;
  const c: Record<string, number> = { iron_ore: 2 + lvl * 2 };
  if (lvl >= 1) c.ancient_shard = lvl;
  return c;
}
export const MAX_UPGRADE = 4;
