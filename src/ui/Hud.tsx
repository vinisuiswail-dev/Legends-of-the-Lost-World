import { useCallback } from "react";
import type { Engine, HudState } from "../game/Engine";
import type { Settings } from "../game/data";

export interface Toast { id: number; msg: string; kind: string; }

function Bar({ v, max, color, w, h = 12, label }: { v: number; max: number; color: string; w: number; h?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="relative rounded-full border border-amber-200/40 bg-black/60 overflow-hidden shadow-md" style={{ width: w, height: h }}>
      <div className="absolute inset-y-0 left-0 transition-[width] duration-150" style={{ width: `${pct}%`, background: color }} />
      <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent h-1/2" />
      {label && <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 drop-shadow">{label}</div>}
    </div>
  );
}

export default function Hud({ hud, engine, settings, toasts, onPause, onMenu, onMap }: { hud: HudState; engine: Engine; settings: Settings; toasts: Toast[]; onPause: () => void; onMenu: (tab?: string) => void; onMap: () => void }) {
  const mapRef = useCallback((el: HTMLCanvasElement | null) => { engine.minimap = el; }, [engine]);

  if (hud.letterbox) {
    return (
      <div className="absolute inset-0 z-30 pointer-events-none">
        <div className="absolute top-0 inset-x-0 h-[12%] bg-black" />
        <div className="absolute bottom-0 inset-x-0 h-[16%] bg-black flex items-center justify-center px-10">
          {hud.cinematic && <p key={hud.cinematic} className="fade-up text-center font-display text-amber-100 text-sm sm:text-lg max-w-3xl leading-snug">{hud.cinematic}</p>}
        </div>
        <div className="absolute top-[13%] right-4 text-[11px] text-white/60 font-display tracking-widest">TAP TO SKIP</div>
      </div>
    );
  }

  const lowHp = hud.hp / hud.maxHp < 0.25;
  return (
    <div className="absolute inset-0 z-20 pointer-events-none safe">
      {lowHp && <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 120px rgba(200,0,0,0.55)" }} />}
      {/* Top-left: vitals + quest */}
      <div className="absolute flex flex-col gap-1.5" style={{ top: "max(env(safe-area-inset-top), 10px)", left: "max(env(safe-area-inset-left), 12px)" }}>
        <div className="flex items-center gap-2">
          <button className="pointer-events-auto relative w-11 h-11 rounded-full border-2 border-amber-300/70 bg-gradient-to-b from-amber-700 to-amber-950 flex items-center justify-center font-display font-bold text-amber-100 shadow-lg" onPointerDown={(e) => { e.stopPropagation(); onMenu("skills"); }}>
            {hud.level}
            {hud.skillPoints > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 text-[10px] text-black flex items-center justify-center animate-pulse">+</span>}
          </button>
          <div className="flex flex-col gap-1">
            <Bar v={hud.hp} max={hud.maxHp} w={170} h={13} color="linear-gradient(90deg,#8b1a1a,#e2483a)" label={`${Math.ceil(hud.hp)} / ${hud.maxHp}`} />
            <Bar v={hud.st} max={hud.maxSt} w={140} h={8} color="linear-gradient(90deg,#3c7a2a,#9ae05a)" />
            <Bar v={hud.xp} max={hud.xpNext} w={110} h={4} color="#d6a548" />
          </div>
        </div>
        <div className="text-[11px] text-amber-200/90 font-semibold drop-shadow">🪙 {hud.gold}</div>
        {hud.questName && (
          <div className="pointer-events-auto mt-1 max-w-[230px] rounded-lg bg-black/45 border-l-2 border-amber-400 px-2.5 py-1.5 backdrop-blur-[2px]" onPointerDown={(e) => { e.stopPropagation(); onMenu("journal"); }}>
            <div className="text-[10px] font-display tracking-widest text-amber-300">◆ {hud.questName}</div>
            <div className="text-[12px] leading-tight text-amber-50">{hud.questText} {hud.questProgress && <span className="text-amber-300 font-bold">({hud.questProgress})</span>}</div>
          </div>
        )}
      </div>

      {/* Top-right: minimap + buttons */}
      <div className="absolute flex items-start gap-2" style={{ top: "max(env(safe-area-inset-top), 10px)", right: "max(env(safe-area-inset-right), 12px)" }}>
        <div className="flex flex-col gap-2 pointer-events-auto">
          <button className="w-11 h-11 rounded-xl btn-fantasy text-lg" onPointerDown={(e) => { e.stopPropagation(); onPause(); }}>⏸</button>
          <button className="w-11 h-11 rounded-xl btn-fantasy text-lg" onPointerDown={(e) => { e.stopPropagation(); onMenu("bag"); }}>🎒</button>
          <button className="w-11 h-11 rounded-xl btn-fantasy text-lg" onPointerDown={(e) => { e.stopPropagation(); onMap(); }}>🗺️</button>
        </div>
        <div className="flex flex-col items-center">
          <div className="pointer-events-auto relative rounded-full border-2 border-amber-300/70 shadow-xl bg-black/50" style={{ width: 122, height: 122 }} onPointerDown={(e) => { e.stopPropagation(); onMap(); }}>
            <canvas ref={mapRef} width={120} height={120} className="rounded-full" />
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-amber-200 drop-shadow">N</div>
          </div>
          <div className="mt-1 text-[10px] text-amber-100/90 text-center drop-shadow font-display">{hud.region}</div>
          <div className="text-[10px] text-amber-100/70">{hud.weather} {hud.clock}{settings.showFps ? ` · ${hud.fps} fps` : ""}</div>
        </div>
      </div>

      {/* Boss / target bar */}
      {hud.boss && (
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center fade-up" style={{ top: hud.boss.phase ? "max(env(safe-area-inset-top), 14px)" : "max(env(safe-area-inset-top), 18px)" }}>
          <div className={`font-display tracking-[0.2em] drop-shadow ${hud.boss.phase ? "text-amber-200 text-sm" : "text-red-100 text-[11px]"}`}>
            {hud.boss.name}{hud.boss.phase === 2 ? " · ENRAGED" : ""}
          </div>
          <Bar v={hud.boss.hp} max={hud.boss.max} w={hud.boss.phase ? 340 : 180} h={hud.boss.phase ? 12 : 7} color={hud.boss.phase === 2 ? "linear-gradient(90deg,#7a0d0d,#ff5a1a)" : "linear-gradient(90deg,#6b1010,#c83a2a)"} />
        </div>
      )}

      {/* Toasts */}
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1" style={{ top: hud.boss ? 64 : 22 }}>
        {toasts.slice(-4).map((t) => (
          <div key={t.id} className={`fade-up px-3 py-1 rounded-full text-[12px] shadow-lg border ${
            t.kind === "quest" ? "bg-amber-900/85 border-amber-400 text-amber-100 font-display" :
            t.kind === "level" ? "bg-emerald-900/85 border-emerald-300 text-emerald-50 font-display tracking-wide" :
            t.kind === "warn" ? "bg-red-950/85 border-red-400/60 text-red-100" :
            t.kind === "discover" ? "bg-sky-950/85 border-sky-300/60 text-sky-50 font-display" :
            t.kind === "save" ? "bg-black/70 border-white/20 text-white/80" :
            "bg-black/70 border-amber-200/30 text-amber-50"}`}>{t.kind === "save" ? "💾 " : ""}{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
