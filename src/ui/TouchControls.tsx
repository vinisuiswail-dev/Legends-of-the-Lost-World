import { useRef, useState, type ReactNode } from "react";
import type { Engine, HudState } from "../game/Engine";
import type { Settings } from "../game/data";

interface Props { engine: Engine; settings: Settings; hud: HudState; }

function Btn({ size, label, sub, onDown, onUp, active, className = "", style }: { size: number; label: ReactNode; sub?: string; onDown: () => void; onUp?: () => void; active?: boolean; className?: string; style?: React.CSSProperties }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      className={`touch-btn absolute select-none ${pressed || active ? "active" : ""} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36, ...style }}
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setPressed(true); onDown(); }}
      onPointerUp={(e) => { e.stopPropagation(); setPressed(false); onUp?.(); }}
      onPointerCancel={() => { setPressed(false); onUp?.(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="flex flex-col items-center leading-none pointer-events-none">
        <span>{label}</span>
        {sub && <span className="mt-0.5 font-display tracking-wider" style={{ fontSize: Math.max(9, size * 0.14) }}>{sub}</span>}
      </span>
    </button>
  );
}

export default function TouchControls({ engine, settings, hud }: Props) {
  const joyRef = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const [joy, setJoy] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);
  const camRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const R = 60 * settings.buttonScale;

  const joyDown = (e: React.PointerEvent) => {
    if (joyRef.current) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    joyRef.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    setJoy({ ox: e.clientX, oy: e.clientY, kx: 0, ky: 0 });
  };
  const joyMove = (e: React.PointerEvent) => {
    const j = joyRef.current; if (!j || j.id !== e.pointerId) return;
    let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    engine.input.mx = dx / R; engine.input.my = -dy / R;
    setJoy({ ox: j.ox, oy: j.oy, kx: dx, ky: dy });
  };
  const joyUp = (e: React.PointerEvent) => {
    const j = joyRef.current; if (!j || j.id !== e.pointerId) return;
    joyRef.current = null; engine.input.mx = 0; engine.input.my = 0; setJoy(null);
  };

  const camDown = (e: React.PointerEvent) => {
    if (engine.cine) { engine.skipCine(); return; }
    if (camRef.current) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    camRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const camMove = (e: React.PointerEvent) => {
    const c = camRef.current; if (!c || c.id !== e.pointerId) return;
    engine.rotateCamera(e.clientX - c.x, e.clientY - c.y);
    c.x = e.clientX; c.y = e.clientY;
  };
  const camUp = (e: React.PointerEvent) => { if (camRef.current?.id === e.pointerId) camRef.current = null; };

  const s = settings.buttonScale;
  const big = 84 * s, mid = 62 * s, small = 50 * s;
  const ox = settings.buttonOffsetX, oy = settings.buttonOffsetY;
  const bow = hud.weaponCat === "bow";

  if (hud.letterbox) {
    return <div className="absolute inset-0 z-20" onPointerDown={() => engine.skipCine()} />;
  }

  return (
    <div className="absolute inset-0 z-10">
      {/* Camera drag area (right side & whole screen behind buttons) */}
      <div className="absolute inset-y-0 right-0 w-[60%]" onPointerDown={camDown} onPointerMove={camMove} onPointerUp={camUp} onPointerCancel={camUp} />
      {/* Joystick zone */}
      <div className="absolute left-0 bottom-0 w-[40%] h-[72%]" onPointerDown={joyDown} onPointerMove={joyMove} onPointerUp={joyUp} onPointerCancel={joyUp}>
        {joy ? (
          <div className="absolute pointer-events-none" style={{ left: joy.ox - R, top: joy.oy - R, width: R * 2, height: R * 2 }}>
            <div className="absolute inset-0 rounded-full border-2 border-amber-200/40 bg-black/25" />
            <div className="absolute rounded-full bg-amber-100/70 border-2 border-amber-300 shadow-lg" style={{ width: R * 0.9, height: R * 0.9, left: R - R * 0.45 + joy.kx, top: R - R * 0.45 + joy.ky }} />
          </div>
        ) : (
          <div className="absolute pointer-events-none opacity-60" style={{ left: "max(env(safe-area-inset-left), 36px)", bottom: "max(env(safe-area-inset-bottom), 36px)", width: R * 2, height: R * 2 }}>
            <div className="absolute inset-0 rounded-full border-2 border-amber-200/30 bg-black/15" />
            <div className="absolute rounded-full bg-amber-100/30" style={{ width: R * 0.9, height: R * 0.9, left: R * 0.55, top: R * 0.55 }} />
            <div className="absolute -top-6 w-full text-center text-[10px] text-amber-100/70 font-display tracking-widest">MOVE</div>
          </div>
        )}
      </div>
      {/* Sprint toggle (left) */}
      <Btn size={small} label="🏃" sub="SPRINT" active={hud.sprint} onDown={() => engine.toggleSprint()} style={{ left: "max(env(safe-area-inset-left), 24px)", bottom: `calc(max(env(safe-area-inset-bottom), 36px) + ${R * 2 + 26}px)` }} />

      {/* Right action cluster */}
      <div className="absolute pointer-events-none" style={{ right: `calc(max(env(safe-area-inset-right), 16px) + ${-ox}px)`, bottom: `calc(max(env(safe-area-inset-bottom), 16px) + ${-oy}px)`, width: 300 * s, height: 300 * s }}>
        <div className="pointer-events-auto">
          <Btn size={big} label={bow ? "🏹" : "⚔️"} sub={bow ? "SHOOT" : "ATTACK"} onDown={() => engine.attack()} style={{ right: 18 * s, bottom: 18 * s }} />
          <Btn size={mid} label="💥" sub={bow ? "CHARGE" : "HEAVY"} onDown={() => engine.heavy()} style={{ right: 18 * s + big + 8 * s, bottom: 6 * s }} />
          <Btn size={mid} label="🌀" sub="DODGE" onDown={() => engine.dodge()} style={{ right: 6 * s, bottom: 18 * s + big + 8 * s }} />
          <Btn size={mid} label="⤒" sub="JUMP" onDown={() => engine.jump()} style={{ right: 18 * s + big - 6 * s, bottom: 18 * s + big - 6 * s }} />
          {!bow && <Btn size={mid} label="🛡️" sub="BLOCK" active={hud.blocking} onDown={() => engine.setBlock(true)} onUp={() => engine.setBlock(false)} style={{ right: 18 * s + big + mid + 16 * s, bottom: 4 * s }} />}
          <Btn size={small} label="🎯" sub="LOCK" active={hud.lockOn} onDown={() => engine.toggleLock()} style={{ right: 10 * s, bottom: 18 * s + big + mid + 18 * s }} />
          <Btn size={small} label={hud.weaponIcon || "🗡️"} sub="SWAP" onDown={() => engine.switchWeapon()} style={{ right: 18 * s + big + mid + 4 * s, bottom: 18 * s + mid + 18 * s }} />
          <Btn size={small} label="🧪" sub={String(hud.potions)} onDown={() => engine.usePotion()} style={{ right: 18 * s + big + 2 * s, bottom: 18 * s + big + mid - 10 * s }} />
        </div>
      </div>

      {/* Context interact button */}
      {hud.interact && (
        <button
          className="absolute left-1/2 -translate-x-1/2 btn-fantasy px-6 py-3 text-base shadow-2xl fade-up flex items-center gap-2"
          style={{ bottom: "max(env(safe-area-inset-bottom), 22%)", fontSize: 16 * s }}
          onPointerDown={(e) => { e.stopPropagation(); engine.interact(); }}
        >
          <span className="w-6 h-6 rounded-full bg-amber-300 text-black text-xs flex items-center justify-center font-bold">E</span>
          {hud.interact}
        </button>
      )}
    </div>
  );
}
