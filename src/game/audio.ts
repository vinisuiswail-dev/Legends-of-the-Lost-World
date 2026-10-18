// Procedural, original audio: synthesized music, ambience and SFX (no external assets).
export type Sfx = "swing" | "heavy" | "hit" | "clang" | "parry" | "hurt" | "pickup" | "chest" | "level" | "dodge" | "arrow" | "step" | "boss" | "puzzle" | "slam" | "ui" | "death";

class AudioManager {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicGain!: GainNode;
  sfxGain!: GainNode;
  ambGain!: GainNode;
  noiseBuf!: AudioBuffer;
  combat = false;
  night = false;
  temple = false;
  private timer: number | null = null;
  private nextNote = 0;
  private step = 0;
  private windSrc: AudioBufferSourceNode | null = null;
  private windFilter!: BiquadFilterNode;
  musicVol = 0.5;
  sfxVol = 0.8;

  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain(); this.musicGain.connect(this.master);
    this.sfxGain = ctx.createGain(); this.sfxGain.connect(this.master);
    this.ambGain = ctx.createGain(); this.ambGain.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startWind();
    this.nextNote = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicGain.gain.value = music * 0.35;
    this.sfxGain.gain.value = sfx * 0.7;
    this.ambGain.gain.value = sfx * 0.25;
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  private startWind() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 400; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.25;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain(); lfoG.gain.value = 200;
    lfo.connect(lfoG).connect(f.frequency);
    src.connect(f).connect(g).connect(this.ambGain);
    src.start(); lfo.start();
    this.windSrc = src; this.windFilter = f;
  }

  setRegionAmbience(temple: boolean) {
    this.temple = temple;
    if (this.windFilter && this.ctx) this.windFilter.Q.setTargetAtTime(temple ? 4 : 0.6, this.ctx.currentTime, 1);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, attack = 0.01) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, freq: number, vol: number, type: BiquadFilterType = "lowpass", dest?: AudioNode) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest ?? this.sfxGain);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // Dorian-flavoured original theme for the Valley
  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const tempo = this.combat ? 0.19 : 0.42;
    const root = this.combat ? 110 : this.night ? 98 : 130.81;
    const scale = this.combat ? [0, 1, 3, 5, 7, 8, 10, 12] : [0, 2, 3, 5, 7, 9, 10, 12];
    const melody = [0, 2, 4, 3, 2, 4, 5, 7, 6, 4, 3, 2, 1, 2, 0, -1];
    while (this.nextNote < ctx.currentTime + 0.3) {
      const t = this.nextNote;
      const st = this.step;
      // pad every 8 steps
      if (st % 16 === 0) {
        const chordRoot = [0, 5, 3, 4][(st / 16) % 4 | 0];
        [0, 2, 4].forEach((iv) => {
          const deg = scale[(chordRoot + iv) % 7] + (chordRoot + iv >= 7 ? 12 : 0);
          this.tone(root * Math.pow(2, deg / 12), t, tempo * 16, "triangle", 0.08, this.musicGain, 1.2);
        });
        this.tone(root / 2 * Math.pow(2, scale[chordRoot] / 12), t, tempo * 16, "sine", 0.12, this.musicGain, 0.5);
      }
      // melody pluck
      const m = melody[st % 16];
      const play = this.combat ? st % 2 === 0 : (st % 2 === 0 && Math.random() > 0.25);
      if (play && m >= 0) {
        const deg = scale[m % 8] + 12;
        this.tone(root * Math.pow(2, deg / 12), t, tempo * 3, this.combat ? "sawtooth" : "sine", this.combat ? 0.04 : 0.07, this.musicGain);
      }
      if (this.combat) {
        if (st % 4 === 0) this.tone(55, t, 0.25, "sine", 0.5, this.musicGain); // kick
        if (st % 4 === 2) this.noise(t, 0.12, 2500, 0.15, "highpass", this.musicGain);
        if (st % 8 === 6) this.tone(82, t, 0.18, "square", 0.08, this.musicGain);
      }
      // ambience
      if (!this.combat && Math.random() < 0.06) {
        if (this.night) this.cricket(t);
        else if (!this.temple) this.bird(t);
      }
      this.nextNote += tempo;
      this.step++;
    }
  }

  private bird(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = "sine";
    const g = ctx.createGain(); g.gain.value = 0;
    const base = 2200 + Math.random() * 1500;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.12;
      o.frequency.setValueAtTime(base, tt);
      o.frequency.exponentialRampToValueAtTime(base * 1.4, tt + 0.08);
      g.gain.setValueAtTime(0.05, tt); g.gain.linearRampToValueAtTime(0, tt + 0.09);
    }
    o.connect(g).connect(this.ambGain); o.start(t); o.stop(t + 0.5);
  }
  private cricket(t: number) {
    for (let i = 0; i < 4; i++) this.tone(4200, t + i * 0.05, 0.03, "square", 0.02, this.ambGain);
  }

  play(s: Sfx) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (s) {
      case "swing": this.noise(t, 0.15, 1800, 0.35, "bandpass"); break;
      case "heavy": this.noise(t, 0.3, 700, 0.5, "bandpass"); break;
      case "dodge": this.noise(t, 0.2, 500, 0.3); break;
      case "arrow": this.noise(t, 0.12, 3000, 0.25, "highpass"); this.tone(900, t, 0.1, "triangle", 0.1, this.sfxGain); break;
      case "hit": this.noise(t, 0.12, 900, 0.6); this.tone(120, t, 0.15, "sine", 0.5, this.sfxGain); break;
      case "slam": this.noise(t, 0.6, 250, 0.9); this.tone(50, t, 0.6, "sine", 0.8, this.sfxGain); break;
      case "clang": this.tone(1400, t, 0.25, "square", 0.08, this.sfxGain); this.tone(2100, t, 0.2, "sine", 0.12, this.sfxGain); break;
      case "parry": [1200, 1800, 2400].forEach((f, i) => this.tone(f, t + i * 0.03, 0.4, "sine", 0.15, this.sfxGain)); break;
      case "hurt": this.tone(220, t, 0.2, "sawtooth", 0.15, this.sfxGain); this.noise(t, 0.1, 600, 0.4); break;
      case "pickup": [660, 880, 1320].forEach((f, i) => this.tone(f, t + i * 0.06, 0.2, "triangle", 0.15, this.sfxGain)); break;
      case "chest": [392, 523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.09, 0.5, "triangle", 0.15, this.sfxGain)); break;
      case "level": [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t + i * 0.1, 0.7, "triangle", 0.16, this.sfxGain)); break;
      case "puzzle": [440, 554, 659].forEach((f, i) => this.tone(f, t + i * 0.12, 0.8, "sine", 0.15, this.sfxGain)); break;
      case "boss": this.tone(55, t, 2.5, "sawtooth", 0.25, this.sfxGain, 0.4); this.tone(82, t + 0.3, 2.2, "sawtooth", 0.18, this.sfxGain, 0.4); this.noise(t, 2, 200, 0.5); break;
      case "death": this.tone(196, t, 1.2, "triangle", 0.2, this.sfxGain); this.tone(147, t + 0.4, 1.5, "triangle", 0.2, this.sfxGain); break;
      case "ui": this.tone(880, t, 0.06, "sine", 0.08, this.sfxGain); break;
      case "step": this.noise(t, 0.05, 400, 0.08); break;
    }
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.windSrc?.stop();
  }
}

export const audio = new AudioManager();
