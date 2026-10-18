import type { SaveData } from "./data";

export interface GameAPI {
  s: SaveData;
  startQuest(id: string): void;
  setStage(id: string, stage: number): void;
  completeQuest(id: string): void;
  give(id: string, n?: number): void;
  take(id: string, n?: number): boolean;
  has(id: string, n?: number): boolean;
  xp(n: number): void;
  gold(n: number): void;
  flag(k: string, v: string | boolean | number): void;
  toast(t: string): void;
  ending(id: "guardian" | "seeker" | "betrayer"): void;
  openForge(): void;
}

export interface DChoice { text: string; next?: string; act?: (g: GameAPI) => void; }
export interface DNode { speaker: string; text: string; next?: string; act?: (g: GameAPI) => void; choices?: DChoice[]; }
export type DTree = Record<string, DNode>;

export const NPC_INFO: Record<string, { name: string; title: string }> = {
  mira: { name: "Elder Mira", title: "Keeper of Hollowbrook" },
  toma: { name: "Toma", title: "Herbalist" },
  bren: { name: "Bren", title: "Hunter" },
  oda: { name: "Oda", title: "Blacksmith" },
  varek: { name: "Varek", title: "Rival Treasure Hunter" },
};

const q = (s: SaveData, id: string) => s.quests[id];

export function dialogueFor(npc: string, s: SaveData): { tree: DTree; start: string } {
  switch (npc) {
    case "mira": return mira(s);
    case "toma": return toma(s);
    case "bren": return bren(s);
    case "oda": return oda();
    case "varek": return varek(s);
    default: return { tree: { a: { speaker: "???", text: "..." } }, start: "a" };
  }
}

function mira(s: SaveData) {
  const m = q(s, "main");
  const tree: DTree = {
    intro: {
      speaker: "Elder Mira",
      text: "A stranger, with salt still in his hair. Few ships find this shore, and fewer leave. What brings you to the Forgotten Valley?",
      choices: [
        { text: "I followed this map. It marks a temple here.", next: "map" },
        { text: "I'm looking for treasure. Lots of it.", next: "greed" },
      ],
    },
    greed: { speaker: "Elder Mira", text: "Then you are the third this season. The others went to the temple and the temple kept them. Show me what you carry.", next: "map" },
    map: {
      speaker: "Elder Mira",
      text: "...This mark. The Sun Gate. Our ancestors sealed it after the Great Sundering, when the old kingdom vanished in a single night of light.",
      next: "map2",
    },
    map2: {
      speaker: "Elder Mira",
      text: "The Sun Key that opens it was ours to guard. Three nights ago, bandits raided the Old Mill and took it. Their chief means to sell it to whoever pays most.",
      next: "ask",
    },
    ask: {
      speaker: "Elder Mira",
      text: "Drive them from the mill, recover the key, and I will not stand between you and the temple. But be warned: what sleeps there was put to sleep for a reason.",
      choices: [
        { text: "I'll get the key back.", act: (g) => { g.setStage("main", 1); g.toast("Quest updated: The Forgotten Map"); } },
        { text: "Why should I trust you?", next: "trust" },
      ],
    },
    trust: {
      speaker: "Elder Mira",
      text: "You shouldn't. Trust the valley instead. Toma by the well needs herbs, Bren hunts wolves to the west, and Oda's forge is always warm. Help them, and you'll learn who we are.",
      choices: [{ text: "Fine. The bandits first.", act: (g) => { g.setStage("main", 1); g.toast("Quest updated: The Forgotten Map"); } }],
    },
    waiting: { speaker: "Elder Mira", text: "The Old Mill lies east, past the stone bridge. Mind the chief, he fights dirty. And take potions; Toma sells hope by the bottle." },
    temple: { speaker: "Elder Mira", text: "You have the key. The temple lies north, across the Silverrun. The old priests left stone tablets to guide those worthy. Read them." },
    warden: { speaker: "Elder Mira", text: "The Warden still stands? Then the old songs were true. It answers only to strength. Go carefully, Kael." },
    ret: {
      speaker: "Elder Mira",
      text: "You live, and you carry the Fragment. I can feel its warmth from here. That is a piece of the Heart, the power that broke the old kingdom.",
      next: "ret2",
    },
    ret2: {
      speaker: "Elder Mira",
      text: "There are more pieces, scattered across six lands. Whoever gathers them may undo the Sundering... or repeat it. The choice now rests in your hands.",
      choices: [
        { text: "Keep it safe here, Mira. Hollowbrook should guard it.", next: "end_guard" },
        { text: "I'm taking it. I need to know what happened here.", next: "end_seek" },
        ...(s.flags.varekDeal ? [{ text: "Varek offered a fortune for it. I'm selling.", next: "end_sell" }] : []),
      ],
    },
    end_guard: { speaker: "Elder Mira", text: "Then you are wiser than the kings were. The valley will remember you. When you are ready to walk further, the desert road is open to you.", act: (g) => g.ending("guardian") },
    end_seek: { speaker: "Elder Mira", text: "Then carry it with care. The Golden Desert lies beyond the southern pass, and the Sand Colossus does not sleep as deeply as our Warden did.", act: (g) => g.ending("seeker") },
    end_sell: { speaker: "Elder Mira", text: "...Varek. Of course. Gold buys many things, Kael, but it cannot buy back a world. Go. And do not return.", act: (g) => g.ending("betrayer") },
    after: { speaker: "Elder Mira", text: "The valley is quieter now. The desert road awaits when you are ready. May the old sun light your path." },
  };
  let start = "intro";
  if (m.done) start = "after";
  else if (m.stage === 1 || m.stage === 2) start = "waiting";
  else if (m.stage === 3) start = "temple";
  else if (m.stage === 4) start = "warden";
  else if (m.stage === 5) start = "ret";
  return { tree, start };
}

function toma(s: SaveData) {
  const h = q(s, "herbs");
  const tree: DTree = {
    intro: {
      speaker: "Toma",
      text: "Ah, careful, that's my good basket! Fever's in the village, and my moonpetal stores are bare. They grow pale and glowing along the riverbanks.",
      choices: [
        { text: "I'll gather some for you.", act: (g) => { g.startQuest("herbs"); } },
        { text: "Maybe later.", next: "later" },
      ],
    },
    later: { speaker: "Toma", text: "Later is a word fevers do not understand. But I'll be here." },
    wait: { speaker: "Toma", text: "Five moonpetals, friend. You'll find them by the Silverrun, glowing at their tips." },
    turnin: {
      speaker: "Toma",
      text: "Five! Beautiful. These will brew enough to break the fever. Take these draughts, and keep any spare petals; two make a draught at Oda's forge.",
      act: (g) => { g.take("herb", 5); g.completeQuest("herbs"); },
    },
    after: { speaker: "Toma", text: "The fever's breaking. Children are laughing in the square again. You did that." },
  };
  let start = "intro";
  if (h?.done) start = "after";
  else if (h && h.stage === 1) start = "turnin";
  else if (h) start = "wait";
  return { tree, start };
}

function bren(s: SaveData) {
  const w = q(s, "wolves");
  const tree: DTree = {
    intro: {
      speaker: "Bren",
      text: "Greywood's wolves have gone strange. Bigger, bolder, eyes like embers. They took two of my dogs. I'm too old to hunt them alone.",
      choices: [
        { text: "I'll thin the pack.", act: (g) => g.startQuest("wolves") },
        { text: "Strange how?", next: "strange" },
      ],
    },
    strange: { speaker: "Bren", text: "Ever since the temple started humming at night. The beasts feel it before we do. Mark my words, something's waking up.", next: "intro" },
    wait: { speaker: "Bren", text: "The pack dens west, in Greywood. Lock on, keep your guard up, and dodge when they lunge." },
    turnin: {
      speaker: "Bren",
      text: "Three of them? Ha! Take my bow. My eyes are going and you'll put it to better use. Hold the attack button to loose arrows from afar.",
      act: (g) => g.completeQuest("wolves"),
    },
    after: { speaker: "Bren", text: "The woods are quiet again. Bring me pelts any time. Oda can stitch them into armor for you." },
  };
  let start = "intro";
  if (w?.done) start = "after";
  else if (w && w.stage === 1) start = "turnin";
  else if (w) start = "wait";
  return { tree, start };
}

function oda(): { tree: DTree; start: string } {
  return {
    tree: {
      a: {
        speaker: "Oda",
        text: "Steel needs fire and ore needs patience. Bring me iron and ancient shards and I'll make your gear sing. Or craft what you need at my bench.",
        choices: [
          { text: "Open the forge.", act: (g) => g.openForge() },
          { text: "Just passing through." },
        ],
      },
    },
    start: "a",
  };
}

function varek(s: SaveData) {
  const tree: DTree = {
    intro: {
      speaker: "Varek",
      text: "Well, well. The castaway with the map. I've been camped here a week, waiting for someone foolish enough to open that gate for me.",
      choices: [
        { text: "Who are you?", next: "who" },
        { text: "Stay out of my way.", next: "threat" },
      ],
    },
    who: {
      speaker: "Varek",
      text: "Varek of the Ashen Company. We've plundered tombs on four continents. This one? The big one. Whatever's behind that gate is worth more than both our lives.",
      next: "offer",
    },
    threat: { speaker: "Varek", text: "Easy. I'm not here to fight. I'm here to make an offer.", next: "offer" },
    offer: {
      speaker: "Varek",
      text: "You do the dangerous part. Bring out what's inside and I'll pay you five hundred gold. No questions, no old women's prophecies.",
      choices: [
        { text: "Deal. If I find anything, it's yours.", act: (g) => { g.flag("varekMet", true); g.flag("varekDeal", true); g.toast("Varek will remember this deal."); } },
        { text: "Not for sale.", act: (g) => { g.flag("varekMet", true); g.flag("varekDeal", false); g.toast("Varek scowls."); } },
      ],
    },
    after: { speaker: "Varek", text: s.flags.varekDeal ? "Remember our deal, castaway. Five hundred gold." : "Still here. Still waiting. Things change." },
  };
  return { tree, start: s.flags.varekMet ? "after" : "intro" };
}

// Readable stone tablets (puzzle clues & lore)
export const TABLETS: Record<string, { title: string; text: string }> = {
  t_temple: { title: "Tablet of the Gate", text: "Three watchers guard the Sun's door. When every eye beholds the altar's flame, the door shall know its keeper." },
  t_pillar: { title: "Worn Inscription", text: "The watchers turn for those who carry the Key. Turn them, and the eye of each will kindle when it sees true." },
  t_hill: { title: "Watcher's Hill Stone", text: "Year of the Last King: the Heart was opened. The sky became a second sun. By morning, the capital was a crater, and the six lands were cut apart." },
  t_bridge: { title: "Bridge Marker", text: "Silverrun Crossing. North: the Temple of the Rising Sun. East: the Old Mill. West: Greywood, where the hunters dwell." },
  t_hollow: { title: "Hidden Hollow Carving", text: "Those who fled hid what they could. Seek the mask by the water, the stars upon the hill, the idol where the mountains close." },
};
