import { useEffect, useMemo, useState } from "react";
import type { Engine } from "../game/Engine";
import { dialogueFor, NPC_INFO, TABLETS } from "../game/dialogue";
import { audio } from "../game/audio";

export function Dialogue({ engine, npc, onClose }: { engine: Engine; npc: string; onClose: () => void }) {
  const { tree, start } = useMemo(() => dialogueFor(npc, engine.s), [npc, engine]);
  const [node, setNode] = useState(start);
  const [shown, setShown] = useState(0);
  const n = tree[node];
  useEffect(() => { setShown(0); }, [node]);
  useEffect(() => {
    if (!n || shown >= n.text.length) return;
    const t = setTimeout(() => setShown((x) => Math.min(n.text.length, x + 2)), 16);
    return () => clearTimeout(t);
  }, [shown, n]);
  if (!n) return null;
  const done = shown >= n.text.length;
  const api = engine.api();
  const advance = () => {
    if (!done) { setShown(n.text.length); return; }
    if (n.choices) return;
    n.act?.(api);
    audio.play("ui");
    if (n.next) setNode(n.next); else onClose();
  };
  const info = NPC_INFO[npc];
  return (
    <div className="absolute inset-0 z-40 safe flex items-end justify-center bg-gradient-to-t from-black/70 via-black/10 to-transparent" onPointerDown={(e) => { e.stopPropagation(); }}>
      <div className="panel w-full max-w-3xl mb-2 p-4 fade-up" onClick={advance}>
        <div className="flex items-center gap-2 mb-1">
          <div className="font-display text-amber-200 tracking-wider">{n.speaker}</div>
          {info && <div className="text-[10px] uppercase tracking-widest text-amber-200/50">{info.title}</div>}
        </div>
        <p className="text-[15px] leading-relaxed text-amber-50 min-h-[3.2em]">{n.text.slice(0, shown)}</p>
        {done && n.choices ? (
          <div className="mt-3 flex flex-col gap-2">
            {n.choices.map((c, i) => (
              <button key={i} className="btn-fantasy text-left px-4 py-2.5 text-sm normal-case" style={{ fontFamily: "var(--font-body)", letterSpacing: 0 }}
                onClick={(e) => { e.stopPropagation(); audio.play("ui"); c.act?.(api); if (c.next) setNode(c.next); else onClose(); }}>
                ▸ {c.text}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-right text-[11px] text-amber-200/60 animate-pulse">{done ? "Tap to continue ▸" : ""}</div>
        )}
      </div>
    </div>
  );
}

export function Tablet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = TABLETS[id];
  return (
    <div className="absolute inset-0 z-40 bg-black/60 safe flex items-center justify-center" onPointerDown={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="max-w-lg w-full rounded-2xl p-6 fade-up text-center border border-sky-200/30 shadow-2xl" style={{ background: "linear-gradient(180deg,#5d5a52,#3a3832)" }}>
        <div className="text-3xl mb-2">𓂀</div>
        <div className="font-display text-sky-100 tracking-widest mb-3">{t?.title}</div>
        <p className="text-[15px] italic leading-relaxed text-stone-100">"{t?.text}"</p>
        <div className="mt-4 text-[11px] text-stone-300/70">Tap to close</div>
      </div>
    </div>
  );
}

export function Pause({ engine, combat, onResume, onSettings, onMenu, onQuit }: { engine: Engine; combat: boolean; onResume: () => void; onSettings: () => void; onMenu: (t: string) => void; onQuit: () => void }) {
  const [msg, setMsg] = useState("");
  const pt = engine.s.playTime;
  return (
    <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm safe flex items-center justify-center fade-up" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel p-6 w-full max-w-sm flex flex-col gap-2.5">
        <div className="font-display text-2xl text-center gold-text tracking-[0.25em] mb-1">PAUSED</div>
        <div className="text-center text-[11px] text-amber-200/60 mb-2">Level {engine.s.level} · {Math.floor(pt / 3600)}h {Math.floor((pt % 3600) / 60)}m played</div>
        <button className="btn-fantasy py-3" onClick={onResume}>Resume</button>
        <button className="btn-fantasy py-3" disabled={combat} onClick={() => { const ok = engine.save(false); setMsg(ok ? "Progress saved ✓" : "Save failed"); }}>{combat ? "Can't save during combat" : "Save Game"}</button>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy py-2.5 text-sm" onClick={() => onMenu("bag")}>Inventory</button>
          <button className="btn-fantasy py-2.5 text-sm" onClick={() => onMenu("journal")}>Journal</button>
          <button className="btn-fantasy py-2.5 text-sm" onClick={() => onMenu("skills")}>Skills</button>
          <button className="btn-fantasy py-2.5 text-sm" onClick={() => onMenu("map")}>Map</button>
        </div>
        <button className="btn-fantasy py-3" onClick={onSettings}>Settings</button>
        <button className="btn-fantasy py-3" onClick={onQuit}>Save & Quit to Title</button>
        {msg && <div className="text-center text-emerald-300 text-sm">{msg}</div>}
      </div>
    </div>
  );
}

export function Death({ onRespawn }: { onRespawn: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 1500); return () => clearTimeout(t); }, []);
  return (
    <div className="absolute inset-0 z-40 safe flex flex-col items-center justify-center" style={{ background: "radial-gradient(circle, rgba(60,0,0,0.5), rgba(0,0,0,0.92))" }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="font-display text-4xl sm:text-5xl text-red-200 tracking-[0.3em] fade-up">YOU HAVE FALLEN</div>
      <p className="mt-3 text-amber-100/70 text-sm italic">"The valley keeps its secrets from the careless."</p>
      <p className="text-amber-100/50 text-xs mt-1">You will lose 10% of your gold. Defeated bosses and progress are kept.</p>
      {ready && <button className="btn-fantasy mt-6 px-8 py-3 fade-up" onClick={onRespawn}>Rise Again</button>}
    </div>
  );
}

const ENDINGS: Record<string, { title: string; text: string[] }> = {
  guardian: {
    title: "Ending I · The Keeper's Oath",
    text: [
      "Kael placed the Sun Fragment in Mira's weathered hands. That night Hollowbrook lit lanterns for the first time in a generation.",
      "The Fragment sleeps beneath the village well, guarded by people who remember what power cost them.",
      "But six lands remain, and other shards still call out across the Lost World. The desert road is open.",
    ],
  },
  seeker: {
    title: "Ending II · The Seeker's Road",
    text: [
      "The Fragment pulses against Kael's chest like a second heartbeat. Mira watches him go without a word.",
      "In its warm light he sees flashes: a city of gold, a king with a shattered crown, a sky splitting in two.",
      "The truth of the Sundering lies further on, past the Golden Desert, where the Sand Colossus waits.",
    ],
  },
  betrayer: {
    title: "Ending III · The Ashen Bargain",
    text: [
      "Varek's gold is heavy and cold. The Ashen Company vanishes into the night with the Fragment.",
      "Hollowbrook's doors are closed to Kael now. Somewhere east, Varek's men are digging toward the capital.",
      "Kael is rich. But in his dreams, the Stone Warden's eyes still burn, and they look disappointed.",
    ],
  },
};

export function Ending({ id, onContinue }: { id: string; onContinue: () => void }) {
  const e = ENDINGS[id] ?? ENDINGS.seeker;
  const [step, setStep] = useState(0);
  useEffect(() => { if (step < e.text.length) { const t = setTimeout(() => setStep((s) => s + 1), 2600); return () => clearTimeout(t); } }, [step, e.text.length]);
  return (
    <div className="absolute inset-0 z-50 bg-black safe flex flex-col items-center justify-center px-8 text-center" onPointerDown={(ev) => { ev.stopPropagation(); if (step < e.text.length) setStep(e.text.length); }}>
      <div className="text-[11px] tracking-[0.4em] text-amber-300/60 font-display">CHAPTER I COMPLETE · THE FORGOTTEN VALLEY</div>
      <div className="font-display text-2xl sm:text-4xl gold-text mt-3 mb-6 tracking-wider">{e.title}</div>
      <div className="max-w-2xl space-y-3">
        {e.text.slice(0, step).map((t, i) => <p key={i} className="fade-up text-amber-50/90 text-[15px] leading-relaxed italic">{t}</p>)}
      </div>
      {step >= e.text.length && (
        <div className="fade-up mt-8 flex flex-col items-center gap-2">
          <div className="text-[12px] text-emerald-300">🏜️ Golden Desert unlocked on the world map</div>
          <button className="btn-fantasy px-8 py-3" onClick={onContinue}>Continue Exploring the Valley</button>
        </div>
      )}
    </div>
  );
}
