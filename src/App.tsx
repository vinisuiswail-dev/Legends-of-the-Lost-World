import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, type HudState } from "./game/Engine";
import { loadSave, loadSettings, newSave, writeSave, writeSettings, deleteSave, type SaveData, type Settings } from "./game/data";
import { audio } from "./game/audio";
import Hud, { type Toast } from "./ui/Hud";
import TouchControls from "./ui/TouchControls";
import { GameMenu, SettingsPanel } from "./ui/Panels";
import { Dialogue, Tablet, Pause, Death, Ending } from "./ui/Overlays";

type Screen = "title" | "game";

async function enterImmersive() {
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (!document.fullscreenElement && /Android|Mobile/i.test(navigator.userAgent)) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
      else el.webkitRequestFullscreen?.();
    }
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await so?.lock?.("landscape");
  } catch { /* not supported */ }
}

export default function App() {
  const [screenId, setScreen] = useState<Screen>("title");
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [save, setSave] = useState<SaveData | null>(null);
  const [intro, setIntro] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const updateSettings = (s: Settings) => { setSettings(s); writeSettings(s); audio.setVolumes(s.music, s.sfx); };

  const start = (fresh: boolean) => {
    audio.init();
    audio.setVolumes(settings.music, settings.sfx);
    enterImmersive();
    let s = fresh ? null : loadSave();
    if (!s) { deleteSave(); s = newSave(); writeSave(s); }
    setIntro(fresh);
    setSave(s);
    setScreen("game");
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {screenId === "title" && <Title settings={settings} onStart={start} onSettings={() => setShowSettings(true)} />}
      {screenId === "game" && save && (
        <Game key={save.savedAt ?? 0} save={save} settings={settings} intro={intro} onSettings={updateSettings} onQuit={() => { setScreen("title"); setSave(null); }} />
      )}
      {showSettings && screenId === "title" && <SettingsPanel settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />}
      <PortraitHint />
    </div>
  );
}

function PortraitHint() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth && matchMedia("(pointer: coarse)").matches);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  if (!portrait) return null;
  return (
    <div className="absolute inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center text-center p-8">
      <div className="text-6xl mb-4 animate-pulse" style={{ transform: "rotate(90deg)" }}>📱</div>
      <div className="font-display text-xl gold-text tracking-widest">ROTATE YOUR DEVICE</div>
      <p className="text-amber-100/70 text-sm mt-2">Legends of the Lost World is played in landscape.</p>
    </div>
  );
}

// ───────────────────────── Title screen ─────────────────────────
function Title({ settings, onStart, onSettings }: { settings: Settings; onStart: (fresh: boolean) => void; onSettings: () => void }) {
  const existing = loadSave();
  const [confirm, setConfirm] = useState(false);
  const [about, setAbout] = useState(false);
  const fmt = (s: SaveData) => `Level ${s.level} · ${Math.floor(s.playTime / 60)} min · ${s.savedAt ? new Date(s.savedAt).toLocaleString() : ""}`;
  return (
    <div className="absolute inset-0 safe">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(./images/keyart.jpg)", animation: "slowZoom 30s ease-in-out infinite alternate" }} />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
      <div className="relative h-full flex flex-col justify-center pl-[6%] max-w-xl gap-3">
        <div className="fade-up">
          <div className="text-[11px] tracking-[0.5em] text-amber-200/70 font-display">CHAPTER I · THE FORGOTTEN VALLEY</div>
          <h1 className="font-display leading-[0.95] mt-2 gold-text drop-shadow-2xl" style={{ fontSize: "clamp(34px, 7vw, 72px)" }}>LEGENDS<br /><span style={{ fontSize: "0.5em" }} className="tracking-[0.2em]">OF THE</span><br />LOST WORLD</h1>
        </div>
        <div className="flex flex-col gap-2 w-64 mt-2 fade-up" style={{ animationDelay: "0.15s" }}>
          {existing && (
            <button className="btn-fantasy py-3 text-left px-4" onClick={() => onStart(false)}>
              <div>Continue</div>
              <div className="text-[10px] text-amber-200/60 normal-case tracking-normal" style={{ fontFamily: "var(--font-body)" }}>{fmt(existing)}</div>
            </button>
          )}
          <button className="btn-fantasy py-3" onClick={() => (existing ? setConfirm(true) : onStart(true))}>New Game</button>
          <button className="btn-fantasy py-3" onClick={onSettings}>Settings</button>
          <button className="btn-fantasy py-2.5 text-sm" onClick={() => setAbout(true)}>Controls & About</button>
        </div>
        <div className="text-[10px] text-amber-100/40 mt-2">Offline single-player · No account required · Graphics: {settings.preset.toUpperCase()}</div>
      </div>
      {confirm && (
        <div className="absolute inset-0 z-40 bg-black/70 flex items-center justify-center">
          <div className="panel p-6 max-w-sm text-center">
            <div className="font-display text-amber-200 text-lg mb-2">Begin a new journey?</div>
            <p className="text-sm text-amber-100/70 mb-4">Your current save will be overwritten.</p>
            <div className="flex gap-2 justify-center"><button className="btn-fantasy px-5 py-2" onClick={() => setConfirm(false)}>Cancel</button><button className="btn-fantasy px-5 py-2" onClick={() => onStart(true)}>Start New</button></div>
          </div>
        </div>
      )}
      {about && (
        <div className="absolute inset-0 z-40 bg-black/75 flex items-center justify-center safe" onClick={() => setAbout(false)}>
          <div className="panel p-5 max-w-2xl w-full max-h-full scroll-y text-[13px] text-amber-50/85 leading-relaxed" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-amber-200 text-lg mb-2">Controls</div>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><b>Left side:</b> touch anywhere to summon the movement joystick. Toggle 🏃 for sprint.</li>
              <li><b>Right side:</b> drag to rotate the camera. Attack (tap repeatedly for combos), Heavy, Dodge (invulnerable roll), Jump, Block (hold; press just before a hit to <b>parry</b>).</li>
              <li><b>🎯 Lock:</b> lock the camera onto the nearest enemy; bows auto-aim at locked targets.</li>
              <li><b>Swap</b> cycles owned weapons. <b>🧪</b> drinks a healing draught. Tap the minimap for the world map.</li>
              <li>Keyboard: WASD · mouse drag · J/K/L · Space · F · Shift · E · Q · R · Tab · I · M · Esc</li>
            </ul>
            <div className="font-display text-amber-200 text-lg mt-3 mb-1">Tips</div>
            <p>Watch for red ground markers and flashing enemies; that's an incoming attack. The Stone Warden's Quake Ring can't be blocked: jump or dodge through it. Read ancient tablets for puzzle clues.</p>
            <div className="font-display text-amber-200 text-lg mt-3 mb-1">About this build</div>
            <p>Vertical slice: the Forgotten Valley, with the main quest, 3 side quests, 5 enemy types, a 2-phase boss, an environmental puzzle, crafting, upgrades, three skill trees, 3 endings and persistent local saves. All dialogue, AI behaviour (finite state machines) and music are handcrafted or procedural. No AI services, no network needed after load.</p>
            <button className="btn-fantasy mt-4 px-6 py-2" onClick={() => setAbout(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Game screen ─────────────────────────
function Game({ save, settings, intro, onSettings, onQuit }: { save: SaveData; settings: Settings; intro: boolean; onSettings: (s: Settings) => void; onQuit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paused, setPaused] = useState(false);
  const [menuTab, setMenuTab] = useState<string | null>(null);
  const [forge, setForge] = useState(false);
  const [dialogue, setDialogue] = useState<string | null>(null);
  const [tablet, setTablet] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const toastId = useRef(0);

  const toast = useCallback((msg: string, kind = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-5), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "quest" || kind === "level" ? 4200 : 2800);
  }, []);

  // create engine
  useEffect(() => {
    const canvas = canvasRef.current!;
    let eng: Engine | null = null;
    const t = setTimeout(() => {
      eng = new Engine(canvas, save, settings, {
        hud: (h) => setHud(h),
        toast: (m, k) => toast(m, k),
        dialogue: (n) => setDialogue(n),
        tablet: (id) => setTablet(id),
        forge: () => { setForge(true); setMenuTab("forge"); },
        ending: (id) => setEnding(id),
        death: () => setTimeout(() => setDead(true), 1200),
        bossDefeated: () => {},
      });
      engineRef.current = eng;
      (window as unknown as { __lotlw?: Engine }).__lotlw = eng;
      setEngine(eng);
      eng.start();
      if (intro) eng.introCinematic();
      setLoading(false);
    }, 50);
    const onResize = () => engineRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); eng?.dispose(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // settings → engine
  useEffect(() => { engineRef.current?.applySettings(settings); }, [settings]);

  const anyOverlay = paused || !!menuTab || !!dialogue || !!tablet || dead || !!ending || showSettings;
  useEffect(() => {
    const e = engineRef.current; if (!e) return;
    e.setPaused(anyOverlay && !dead);
    e.uiOpen = anyOverlay;
    if (dead) e.paused = false;
  }, [anyOverlay, dead, engine]);

  const closeTop = useCallback(() => {
    if (showSettings) setShowSettings(false);
    else if (tablet) setTablet(null);
    else if (menuTab) { setMenuTab(null); setForge(false); }
    else if (dialogue) setDialogue(null);
    else if (paused) setPaused(false);
    else if (!dead && !ending) setPaused(true);
  }, [showSettings, tablet, menuTab, dialogue, paused, dead, ending]);

  // Android back button → history popstate
  useEffect(() => {
    history.pushState({ game: true }, "");
    const onPop = () => { closeTop(); history.pushState({ game: true }, ""); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [closeTop]);

  // keyboard UI shortcuts
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      if (k === "escape") closeTop();
      else if (!anyOverlay && k === "i") setMenuTab("bag");
      else if (!anyOverlay && k === "m") setMenuTab("map");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeTop, anyOverlay]);

  // App pause / resume (Android task switch)
  useEffect(() => {
    const onVis = () => {
      const e = engineRef.current;
      if (document.hidden) {
        if (e && e.p.state !== "dead") e.save(true);
        audio.suspend();
        if (!dead && !ending) setPaused(true);
      } else audio.resume();
    };
    const onUnload = () => { const e = engineRef.current; if (e && e.p.state !== "dead") e.save(true); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onUnload);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onUnload); };
  }, [dead, ending]);

  const quit = () => { engineRef.current?.save(false); onQuit(); };

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      {engine && hud && (
        <>
          {!anyOverlay && <TouchControls engine={engine} settings={settings} hud={hud} />}
          <Hud hud={hud} engine={engine} settings={settings} toasts={toasts} onPause={() => setPaused(true)} onMenu={(t) => setMenuTab(t ?? "bag")} onMap={() => setMenuTab("map")} />
        </>
      )}
      {engine && paused && !menuTab && !showSettings && (
        <Pause engine={engine} combat={!!hud?.combat} onResume={() => setPaused(false)} onSettings={() => setShowSettings(true)} onMenu={(t) => setMenuTab(t)} onQuit={quit} />
      )}
      {engine && menuTab && <GameMenu engine={engine} tab={menuTab} setTab={setMenuTab} forgeUnlocked={forge} onClose={() => { setMenuTab(null); setForge(false); }} />}
      {engine && dialogue && <Dialogue engine={engine} npc={dialogue} onClose={() => setDialogue(null)} />}
      {tablet && <Tablet id={tablet} onClose={() => setTablet(null)} />}
      {engine && dead && <Death onRespawn={() => { engine.respawn(); setDead(false); }} />}
      {ending && <Ending id={ending} onContinue={() => setEnding(null)} />}
      {showSettings && <SettingsPanel settings={settings} onChange={onSettings} onClose={() => setShowSettings(false)} />}
      {loading && (
        <div className="absolute inset-0 z-[60] bg-black flex flex-col items-center justify-center">
          <div className="font-display gold-text text-2xl tracking-[0.3em]">LOADING</div>
          <div className="text-amber-100/60 text-sm mt-2 italic">Raising the Forgotten Valley…</div>
        </div>
      )}
    </div>
  );
}
