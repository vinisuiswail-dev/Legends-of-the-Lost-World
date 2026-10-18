import { useEffect, useRef, useState } from "react";
import type { Engine } from "../game/Engine";
import {
  ITEMS, SKILLS, QUESTS, REGIONS, LOCATIONS, RECIPES, PRESETS, MAX_UPGRADE, type Settings, type ItemType,
  weaponDamage, armorFor, maxHpFor, upgradeCost,
} from "../game/data";
import { audio } from "../game/audio";

const TABS = [
  { id: "bag", label: "Inventory", icon: "🎒" },
  { id: "skills", label: "Skills", icon: "✨" },
  { id: "journal", label: "Journal", icon: "📖" },
  { id: "map", label: "Map", icon: "🗺️" },
  { id: "craft", label: "Craft", icon: "⚗️" },
  { id: "forge", label: "Forge", icon: "🔨" },
];

export function GameMenu({ engine, tab, setTab, onClose, forgeUnlocked }: { engine: Engine; tab: string; setTab: (t: string) => void; onClose: () => void; forgeUnlocked: boolean }) {
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);
  return (
    <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm safe flex items-stretch justify-center fade-up" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel w-full max-w-5xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-2 pt-2 border-b border-amber-200/20 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); audio.play("ui"); }}
              className={`px-3 py-2 rounded-t-lg font-display text-xs sm:text-sm tracking-wide whitespace-nowrap ${tab === t.id ? "bg-amber-800/50 text-amber-100 border border-b-0 border-amber-300/40" : "text-amber-200/60"}`}>
              {t.icon} {t.label}{t.id === "skills" && engine.s.skillPoints > 0 ? ` (${engine.s.skillPoints})` : ""}
            </button>
          ))}
          <div className="flex-1" />
          <button className="btn-fantasy w-10 h-10 mb-1 text-lg" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 min-h-0 p-3">
          {tab === "bag" && <Bag engine={engine} bump={bump} />}
          {tab === "skills" && <Skills engine={engine} bump={bump} />}
          {tab === "journal" && <Journal engine={engine} bump={bump} />}
          {tab === "map" && <WorldMap engine={engine} />}
          {tab === "craft" && <Craft engine={engine} bump={bump} />}
          {tab === "forge" && <Forge engine={engine} bump={bump} unlocked={forgeUnlocked} />}
        </div>
      </div>
    </div>
  );
}

const CATS: { id: ItemType | "all"; label: string }[] = [
  { id: "all", label: "All" }, { id: "weapon", label: "Weapons" }, { id: "armor", label: "Armor" }, { id: "shield", label: "Shields" },
  { id: "potion", label: "Potions" }, { id: "material", label: "Materials" }, { id: "artifact", label: "Artifacts" }, { id: "quest", label: "Quest" },
];

function Bag({ engine, bump }: { engine: Engine; bump: () => void }) {
  const s = engine.s;
  const [cat, setCat] = useState<string>("all");
  const [sel, setSel] = useState<string | null>(null);
  const items = Object.entries(s.inventory).filter(([k, n]) => n > 0 && ITEMS[k] && (cat === "all" || ITEMS[k].type === cat));
  const it = sel ? ITEMS[sel] : null;
  const equipped = (id: string) => Object.values(s.equipped).includes(id);
  const compare = () => {
    if (!it || !sel) return null;
    if (it.type === "weapon") { const cur = weaponDamage(s), nw = weaponDamage(s, sel); return { label: "Damage", cur, nw }; }
    if (it.type === "armor") { const cur = armorFor(s); const nw = (it.armor ?? 0) + (s.upgrades[sel] ?? 0) * 2; return { label: "Armor", cur, nw }; }
    if (it.type === "shield") { const cur = Math.round((ITEMS[s.equipped.shield]?.block ?? 0.5) * 100); return { label: "Block %", cur, nw: Math.round((it.block ?? 0) * 100) }; }
    return null;
  };
  const cmp = compare();
  return (
    <div className="h-full flex flex-col sm:flex-row gap-3">
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex gap-1 mb-2 overflow-x-auto">
          {CATS.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border ${cat === c.id ? "bg-amber-600/40 border-amber-300 text-amber-50" : "border-amber-200/20 text-amber-200/70"}`}>{c.label}</button>)}
        </div>
        <div className="scroll-y flex-1 grid grid-cols-4 sm:grid-cols-6 gap-2 content-start pr-1">
          {items.map(([k, n]) => (
            <button key={k} onClick={() => setSel(k)} className={`relative aspect-square rounded-lg border flex flex-col items-center justify-center bg-black/40 ${sel === k ? "border-amber-300 bg-amber-900/40" : "border-amber-200/20"}`}>
              <span className="text-2xl">{ITEMS[k].icon}</span>
              <span className="text-[9px] text-amber-100/80 px-1 truncate w-full text-center">{ITEMS[k].name}</span>
              {n > 1 && <span className="absolute top-0.5 right-1 text-[10px] text-amber-200">×{n}</span>}
              {equipped(k) && <span className="absolute top-0.5 left-1 text-[9px] text-emerald-300">E</span>}
              {(s.upgrades[k] ?? 0) > 0 && <span className="absolute bottom-4 right-1 text-[9px] text-sky-300">+{s.upgrades[k]}</span>}
            </button>
          ))}
          {!items.length && <div className="col-span-full text-amber-200/50 text-sm p-4">Nothing here yet.</div>}
        </div>
      </div>
      <div className="sm:w-72 rounded-xl bg-black/35 border border-amber-200/15 p-3 flex flex-col gap-2">
        <div className="font-display text-amber-200 text-sm tracking-wider">Equipped</div>
        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
          {(["weapon", "armor", "shield"] as const).map((slot) => (
            <div key={slot} className="rounded-lg bg-black/40 border border-amber-200/15 py-1.5">
              <div className="text-xl">{ITEMS[s.equipped[slot]]?.icon ?? "—"}</div>
              <div className="text-amber-100/70 capitalize">{slot}</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-amber-100/70">❤️ {maxHpFor(s)} HP · ⚔️ {weaponDamage(s)} DMG · 🛡️ {armorFor(s)} ARM</div>
        <div className="h-px bg-amber-200/15 my-1" />
        {it && sel ? (
          <div className="flex flex-col gap-2 fade-up">
            <div className="flex items-center gap-2"><span className="text-3xl">{it.icon}</span><div><div className="font-display text-amber-100">{it.name}{(s.upgrades[sel] ?? 0) > 0 ? ` +${s.upgrades[sel]}` : ""}</div><div className="text-[10px] uppercase tracking-widest text-amber-300/70">{it.type}{it.cat ? ` · ${it.cat}` : ""}</div></div></div>
            <p className="text-[12px] text-amber-50/80 leading-snug">{it.desc}</p>
            {cmp && (
              <div className="text-[12px] rounded-lg bg-black/40 px-2 py-1.5">
                {cmp.label}: <span className="text-amber-200">{cmp.cur}</span> → <span className={cmp.nw > cmp.cur ? "text-emerald-300" : cmp.nw < cmp.cur ? "text-red-300" : "text-amber-200"}>{cmp.nw} ({cmp.nw - cmp.cur >= 0 ? "+" : ""}{cmp.nw - cmp.cur})</span>
              </div>
            )}
            {(it.type === "weapon" || it.type === "armor" || it.type === "shield") && (
              <button disabled={equipped(sel)} className="btn-fantasy py-2" onClick={() => { engine.equip(sel); bump(); }}>{equipped(sel) ? "Equipped" : "Equip"}</button>
            )}
            {it.type === "shield" && equipped(sel) && <button className="btn-fantasy py-2" onClick={() => { s.equipped.shield = ""; engine.equipVisuals(); bump(); }}>Unequip</button>}
            {it.type === "potion" && <button className="btn-fantasy py-2" onClick={() => { engine.usePotion(sel); bump(); }}>Drink</button>}
          </div>
        ) : <div className="text-[12px] text-amber-200/50">Select an item to inspect, compare and equip.</div>}
      </div>
    </div>
  );
}

function Skills({ engine, bump }: { engine: Engine; bump: () => void }) {
  const s = engine.s;
  const learn = (id: string) => {
    s.skills.push(id); s.skillPoints--;
    if (id === "g1") engine.p.hp += 30;
    audio.play("level"); bump();
  };
  return (
    <div className="h-full flex flex-col">
      <div className="text-sm text-amber-100/80 mb-2">Skill points: <span className="text-amber-300 font-bold">{s.skillPoints}</span> <span className="text-amber-200/50 text-xs">(earn 1 per level)</span></div>
      <div className="scroll-y flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(["Warrior", "Explorer", "Guardian"] as const).map((tree) => (
          <div key={tree} className="rounded-xl bg-black/35 border border-amber-200/15 p-3">
            <div className="font-display text-amber-200 tracking-widest text-center mb-2">{tree === "Warrior" ? "⚔️" : tree === "Explorer" ? "🧭" : "🛡️"} {tree.toUpperCase()}</div>
            <div className="flex flex-col items-stretch gap-2">
              {SKILLS.filter((k) => k.tree === tree).map((k, i) => {
                const has = s.skills.includes(k.id);
                const can = !has && s.skillPoints > 0 && (!k.req || s.skills.includes(k.req));
                return (
                  <div key={k.id} className="flex flex-col items-center">
                    {i > 0 && <div className={`w-0.5 h-3 ${has ? "bg-amber-300" : "bg-amber-200/20"}`} />}
                    <button disabled={!can} onClick={() => learn(k.id)} className={`w-full rounded-lg border px-2 py-2 text-left flex gap-2 items-center ${has ? "border-amber-300 bg-amber-800/40" : can ? "border-emerald-300/70 bg-emerald-900/20 animate-pulse" : "border-amber-200/15 bg-black/30 opacity-70"}`}>
                      <span className="text-xl">{k.icon}</span>
                      <span><span className="block text-[13px] font-display text-amber-100">{k.name} {has && "✓"}</span><span className="block text-[11px] text-amber-50/70 leading-tight">{k.desc}</span></span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Journal({ engine, bump }: { engine: Engine; bump: () => void }) {
  const s = engine.s;
  const ids = Object.keys(s.quests);
  return (
    <div className="h-full scroll-y flex flex-col gap-2 pr-1">
      {ids.map((id) => {
        const q = s.quests[id]; const d = QUESTS[id];
        return (
          <div key={id} className={`rounded-xl border p-3 ${s.activeQuest === id ? "border-amber-300 bg-amber-900/25" : "border-amber-200/15 bg-black/30"}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-display text-amber-100">{d.main ? "★ " : ""}{d.name} {q.done && <span className="text-emerald-300 text-xs">COMPLETE</span>}</div>
                <div className="text-[11px] text-amber-300/70">Reward: {d.reward}</div>
              </div>
              {!q.done && <button disabled={s.activeQuest === id} onClick={() => { s.activeQuest = id; bump(); }} className="btn-fantasy text-xs px-3 py-1.5">{s.activeQuest === id ? "Tracking" : "Track"}</button>}
            </div>
            <ul className="mt-2 text-[12px] space-y-0.5">
              {d.stages.map((st, i) => (i <= q.stage || q.done) && (
                <li key={i} className={q.done || i < q.stage ? "text-amber-100/40 line-through" : "text-amber-50"}>
                  {q.done || i < q.stage ? "✓" : "◆"} {st.text}{st.goal && i === q.stage && !q.done ? ` (${Math.min(q.progress, st.goal)}/${st.goal})` : ""}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="rounded-xl border border-amber-200/15 bg-black/30 p-3 text-[12px] text-amber-100/70">
        <div className="font-display text-amber-200 mb-1">Artifacts ({s.artifacts.length}/3)</div>
        {s.artifacts.length ? s.artifacts.map((a) => <div key={a}>{ITEMS[a].icon} <b>{ITEMS[a].name}</b> — <i>{ITEMS[a].desc}</i></div>) : "Ancient relics lie hidden across the valley. Stone carvings may hint at their places."}
      </div>
      {s.flags.ending && (
        <div className="rounded-xl border border-amber-300/40 bg-amber-950/30 p-3 text-[12px] text-amber-100/80">
          <div className="font-display text-amber-200 mb-1">Story decision</div>
          {s.flags.ending === "guardian" ? "You entrusted the Sun Fragment to Hollowbrook." : s.flags.ending === "seeker" ? "You carry the Sun Fragment onward, seeking the truth." : "You sold the Sun Fragment to Varek of the Ashen Company."}
        </div>
      )}
    </div>
  );
}

function WorldMap({ engine }: { engine: Engine }) {
  const s = engine.s;
  const ref = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<"valley" | "world">("valley");
  useEffect(() => {
    if (view !== "valley") return;
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const N = c.width;
    ctx.drawImage(engine.mapImage, 0, 0, N, N);
    const toM = (x: number, z: number) => [((x + 160) / 320) * N, ((z + 160) / 320) * N];
    ctx.font = "bold 11px Georgia"; ctx.textAlign = "center";
    for (const l of LOCATIONS) {
      const [mx, my] = toM(l.x, l.z);
      const known = s.discovered.includes(l.id);
      ctx.fillStyle = known ? "#ffe2a0" : "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(mx, my, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 3;
      const label = known ? l.name : "???";
      ctx.strokeText(label, mx, my - 8); ctx.fillText(label, mx, my - 8);
    }
    const tgt = engine.questTarget();
    if (tgt) { const [mx, my] = toM(tgt[0], tgt[1]); ctx.fillStyle = "#ffcf40"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 4 : 9; ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r); } ctx.closePath(); ctx.stroke(); ctx.fill(); }
    const [px, py] = toM(engine.p.pos.x, engine.p.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-engine.p.yaw + Math.PI);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }, [engine, s, view]);
  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={() => setView("valley")} className={`btn-fantasy px-3 py-1 text-xs ${view === "valley" ? "brightness-150" : ""}`}>Forgotten Valley</button>
        <button onClick={() => setView("world")} className={`btn-fantasy px-3 py-1 text-xs ${view === "world" ? "brightness-150" : ""}`}>The Lost Continent</button>
        <div className="flex-1" />
        <div className="text-[11px] text-amber-200/70 self-center">Discovered {s.discovered.length}/{LOCATIONS.length}</div>
      </div>
      {view === "valley" ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <canvas ref={ref} width={512} height={512} className="h-full max-h-full aspect-square rounded-xl border border-amber-300/40 shadow-2xl" style={{ imageRendering: "auto" }} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 relative rounded-xl border border-amber-300/40 overflow-hidden" style={{ background: "radial-gradient(ellipse at center, #3a2f1c 0%, #1a140c 70%)" }}>
          <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M10,60 Q20,20 50,15 T90,40 Q95,80 60,88 T10,60Z" fill="#6b5a3a" stroke="#d6a548" strokeWidth="0.4" />
          </svg>
          {REGIONS.map((r) => {
            const open = s.unlockedRegions.includes(r.id);
            const playable = r.id === "valley";
            return (
              <div key={r.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-center w-36" style={{ left: `${r.x}%`, top: `${r.y}%` }}>
                <div className={`mx-auto w-12 h-12 rounded-full border-2 flex items-center justify-center text-2xl ${open ? "border-amber-300 bg-amber-900/60" : "border-white/20 bg-black/50 grayscale opacity-60"}`}>{open ? r.icon : "🔒"}</div>
                <div className={`font-display text-[11px] mt-1 ${open ? "text-amber-100" : "text-white/40"}`}>{r.name}</div>
                <div className="text-[9px] text-amber-100/50 leading-tight">{playable ? "You are here" : open ? "Unlocked · region content in next build stage" : r.desc}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function hasAll(engine: Engine, needs: Record<string, number>) { return Object.entries(needs).every(([k, n]) => (engine.s.inventory[k] ?? 0) >= n); }
function Needs({ engine, needs }: { engine: Engine; needs: Record<string, number> }) {
  return <span className="text-[11px]">{Object.entries(needs).map(([k, n]) => <span key={k} className={`mr-2 ${(engine.s.inventory[k] ?? 0) >= n ? "text-emerald-300" : "text-red-300"}`}>{ITEMS[k].icon} {engine.s.inventory[k] ?? 0}/{n}</span>)}</span>;
}

function Craft({ engine, bump }: { engine: Engine; bump: () => void }) {
  return (
    <div className="h-full scroll-y grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
      {RECIPES.map((r) => {
        const ok = hasAll(engine, r.needs);
        return (
          <div key={r.id} className="rounded-xl border border-amber-200/15 bg-black/30 p-3 flex items-center gap-3">
            <span className="text-3xl">{ITEMS[r.out].icon}</span>
            <div className="flex-1"><div className="font-display text-amber-100 text-sm">{ITEMS[r.out].name}</div><Needs engine={engine} needs={r.needs} /></div>
            <button disabled={!ok} className="btn-fantasy px-3 py-2 text-xs" onClick={() => { for (const [k, n] of Object.entries(r.needs)) engine.take(k, n); engine.give(r.out, r.n); bump(); }}>Craft</button>
          </div>
        );
      })}
    </div>
  );
}

function Forge({ engine, bump, unlocked }: { engine: Engine; bump: () => void; unlocked: boolean }) {
  const s = engine.s;
  if (!unlocked) return <div className="h-full flex items-center justify-center text-center text-amber-200/70 text-sm p-6">🔨 Visit <b className="mx-1 text-amber-200">Oda the blacksmith</b> in Hollowbrook to upgrade weapons and armor.</div>;
  const gear = Object.keys(s.inventory).filter((k) => ITEMS[k]?.type === "weapon" || ITEMS[k]?.type === "armor");
  return (
    <div className="h-full scroll-y grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
      {gear.map((id) => {
        const lvl = s.upgrades[id] ?? 0; const cost = upgradeCost(s, id); const max = lvl >= MAX_UPGRADE; const ok = !max && hasAll(engine, cost);
        const it = ITEMS[id];
        return (
          <div key={id} className="rounded-xl border border-amber-200/15 bg-black/30 p-3 flex items-center gap-3">
            <span className="text-3xl">{it.icon}</span>
            <div className="flex-1">
              <div className="font-display text-amber-100 text-sm">{it.name} <span className="text-sky-300">+{lvl}</span></div>
              <div className="text-[11px] text-amber-100/70">{it.type === "weapon" ? `DMG ${weaponDamage(s, id)} → ${Math.round((it.dmg ?? 0) * (1 + (lvl + 1) * 0.18) * (s.skills.includes("w1") ? 1.15 : 1))}` : `ARM ${(it.armor ?? 0) + lvl * 2} → ${(it.armor ?? 0) + (lvl + 1) * 2}`}</div>
              {!max ? <Needs engine={engine} needs={cost} /> : <span className="text-[11px] text-amber-300">Max level</span>}
            </div>
            <button disabled={!ok} className="btn-fantasy px-3 py-2 text-xs" onClick={() => { for (const [k, n] of Object.entries(cost)) engine.take(k, n); s.upgrades[id] = lvl + 1; engine.equipVisuals(); audio.play("clang"); engine.ev.toast(`${it.name} upgraded to +${lvl + 1}`, "item"); bump(); }}>Upgrade</button>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── Settings ─────────────────────────
type ToggleKey = "shadows" | "effects" | "weather" | "invertY" | "markers" | "showFps";
type SliderKey = "resScale" | "sensitivity" | "music" | "sfx" | "buttonScale" | "buttonOffsetX" | "buttonOffsetY";
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-2 border-b border-amber-200/10"><span className="text-[13px] text-amber-100/90">{label}</span><div className="flex items-center gap-2">{children}</div></div>;
}
function Toggle({ k, st, on }: { k: ToggleKey; st: Settings; on: (s: Settings) => void }) {
  return (
    <button onClick={() => on({ ...st, [k]: !st[k] })} className={`w-14 h-7 rounded-full border transition ${st[k] ? "bg-amber-500/70 border-amber-200" : "bg-black/50 border-amber-200/30"}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transition ${st[k] ? "translate-x-8" : "translate-x-1"}`} />
    </button>
  );
}
function Slider({ k, min, max, step, st, on }: { k: SliderKey; min: number; max: number; step: number; st: Settings; on: (s: Settings) => void }) {
  return <><input type="range" min={min} max={max} step={step} value={st[k]} onChange={(e) => on({ ...st, [k]: Number(e.target.value) })} className="w-32 sm:w-44 accent-amber-500" style={{ touchAction: "pan-x" }} /><span className="w-10 text-right text-[11px] text-amber-200">{st[k]}</span></>;
}

export function SettingsPanel({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const T = (k: ToggleKey) => <Toggle k={k} st={settings} on={onChange} />;
  const S = (k: SliderKey, min: number, max: number, step: number) => <Slider k={k} min={min} max={max} step={step} st={settings} on={onChange} />;
  return (
    <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm safe flex items-center justify-center fade-up" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel w-full max-w-2xl h-full max-h-[620px] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/20">
          <div className="font-display text-lg gold-text tracking-widest">SETTINGS</div>
          <button className="btn-fantasy w-10 h-10" onClick={onClose}>✕</button>
        </div>
        <div className="scroll-y flex-1 px-4 pb-4">
          <div className="font-display text-amber-300 text-xs tracking-widest mt-3">GRAPHICS</div>
          <Row label="Preset">
            {(["low", "medium", "high"] as const).map((p) => (
              <button key={p} onClick={() => onChange({ ...settings, ...PRESETS[p], preset: p })} className={`px-3 py-1.5 rounded-lg text-xs font-display uppercase border ${settings.preset === p ? "bg-amber-600/60 border-amber-200" : "border-amber-200/25 text-amber-200/70"}`}>{p}</button>
            ))}
          </Row>
          <Row label="Resolution scale">{S("resScale", 0.4, 1, 0.05)}</Row>
          <Row label="Shadows">{T("shadows")}</Row>
          <Row label="Effects (particles, slashes)">{T("effects")}</Row>
          <Row label="Weather (rain, fog)">{T("weather")}</Row>
          <Row label="Frame rate cap">
            {([30, 60] as const).map((f) => <button key={f} onClick={() => set("fps", f)} className={`px-3 py-1.5 rounded-lg text-xs border ${settings.fps === f ? "bg-amber-600/60 border-amber-200" : "border-amber-200/25 text-amber-200/70"}`}>{f} FPS</button>)}
          </Row>
          <Row label="Show FPS counter">{T("showFps")}</Row>
          <div className="font-display text-amber-300 text-xs tracking-widest mt-4">CONTROLS</div>
          <Row label="Camera sensitivity">{S("sensitivity", 0.3, 2.5, 0.1)}</Row>
          <Row label="Invert camera Y">{T("invertY")}</Row>
          <Row label="Button size">{S("buttonScale", 0.75, 1.35, 0.05)}</Row>
          <Row label="Buttons offset X">{S("buttonOffsetX", -120, 40, 4)}</Row>
          <Row label="Buttons offset Y">{S("buttonOffsetY", -80, 40, 4)}</Row>
          <Row label="Quest markers">{T("markers")}</Row>
          <div className="font-display text-amber-300 text-xs tracking-widest mt-4">AUDIO</div>
          <Row label="Music">{S("music", 0, 1, 0.05)}</Row>
          <Row label="Sound effects & ambience">{S("sfx", 0, 1, 0.05)}</Row>
          <p className="text-[11px] text-amber-200/50 mt-3">Note: changing the graphics preset rebuilds the valley's vegetation density and terrain detail. Keyboard: WASD move · drag mouse to look · J attack · K heavy · L dodge · Space jump · F block · Shift sprint · E interact · Q lock-on · R potion · Tab swap · I inventory · M map · Esc pause.</p>
        </div>
      </div>
    </div>
  );
}
