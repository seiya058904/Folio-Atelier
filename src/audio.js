import { t } from "./i18n.js";
import { createSlider } from "./ui/controls.js";
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const AUDIO_SOURCES = Object.freeze({
  music: "./assets/audio/music.mp3",
  select: "./assets/audio/select.mp3",
  navigate: "./assets/audio/navigate.mp3",
  open: "./assets/audio/open.mp3",
  page: "./assets/audio/page.mp3",
  close: "./assets/audio/close.mp3"
});

const audioControls = document.querySelector("#audio-controls");
const audioToggle = document.querySelector("#audio-toggle");
let audioVolume = document.querySelector("#audio-volume");
const audioStatus = document.querySelector("#audio-status");

export function createAudioSystem(sources) {
  const MUSIC_GAIN = 0.24;
  const MAX_VOICES = 8;
  const cueGains = {
    select: 0.62,
    navigate: 0.42,
    open: 0.7,
    page: 0.62,
    close: 0.68,
    tap: 0.14,
    toggle: 0.18,
    swatch: 0.13,
    detent: 0.14,
    shutter: 0.48
  };
  const cueIntervals = {
    select: 180,
    navigate: 110,
    open: 260,
    page: 140,
    close: 260,
    tap: 45,
    toggle: 65,
    swatch: 55,
    detent: 70,
    shutter: 260
  };

  // Web Audio graph for zero-latency sample playback and soft micro-tactile cues.
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let masterGain = null;
  const decodedBuffers = new Map();
  const decoding = new Set();
  const activeNodes = new Set();

  // Fallback pooled HTMLAudio elements if Web Audio isn't ready yet.
  const activeVoices = new Set();
  const lastCueAt = new Map();
  const music = new Audio(sources.music);
  let cueCount = 0;
  let unlocked = false;
  let muted = false;
  let volume = 0.55;
  let warmed = false;

  music.loop = true;
  // The soundtrack is fetched once the page has settled, not ahead of the
  // first paint; a visitor who clicks sooner simply starts it loading then.
  music.preload = "none";
  music.playsInline = true;

  function ensureContext() {
    if (!AudioCtx) return null;
    if (!ctx) {
      try {
        ctx = new AudioCtx();
        masterGain = ctx.createGain();
        masterGain.gain.value = muted ? 0 : volume;
        masterGain.connect(ctx.destination);
      } catch (error) {
        return null;
      }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function loadBuffer(name) {
    const url = sources[name];
    if (!url || name === "music" || decodedBuffers.has(name) || decoding.has(name)) return;
    const context = ensureContext();
    if (!context) return;
    decoding.add(name);
    fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => (buf && ctx ? ctx.decodeAudioData(buf) : null))
      .then((decoded) => {
        if (decoded) decodedBuffers.set(name, decoded);
      })
      .catch(() => {})
      .finally(() => { decoding.delete(name); });
  }

  const warm = () => {
    if (warmed) return;
    warmed = true;
    music.preload = "auto";
    // Pre-decode short SFX buffers quietly when AudioContext is unlocked.
    if (unlocked) ["select", "navigate", "open", "page", "close"].forEach(loadBuffer);
  };
  if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 5000 });
  else setTimeout(warm, 2500);

  try {
    const savedVolumeValue = localStorage.getItem("folio-atelier-audio-volume");
    const savedVolume = Number(savedVolumeValue);
    const savedMuted = localStorage.getItem("folio-atelier-audio-muted");
    if (
      savedVolumeValue !== null
      && Number.isFinite(savedVolume)
      && savedVolume >= 0
      && savedVolume <= 1
    ) {
      volume = savedVolume;
    }
    muted = savedMuted === "true";
  } catch (error) {
    // Privacy modes may disable storage; the in-memory controls still work.
  }

  function persist() {
    try {
      localStorage.setItem("folio-atelier-audio-volume", String(volume));
      localStorage.setItem("folio-atelier-audio-muted", String(muted));
    } catch (error) {
      // Persistence is optional.
    }
  }

  function setVoiceVolume(voice) {
    const gain = Number(voice.dataset.cueGain || 1);
    voice.volume = muted ? 0 : clamp(volume * gain, 0, 1);
  }

  function updateInterface() {
    audioToggle.setAttribute("aria-pressed", String(muted));
    audioToggle.setAttribute("aria-label", t(muted ? "Turn sound on" : "Mute sound"));
    audioVolume.setValue?.(volume);
    audioControls.dataset.state = muted ? "muted" : unlocked ? "playing" : "ready";
    audioStatus.textContent = muted
      ? t("Sound muted")
      : unlocked
        ? t("Sound on at {n} percent", { n: Math.round(volume * 100) })
        : t("Sound ready at {n} percent", { n: Math.round(volume * 100) });
    music.volume = muted ? 0 : clamp(volume * MUSIC_GAIN, 0, 1);
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.015);
    }
    activeVoices.forEach(setVoiceVolume);
  }

  function startMusic() {
    if (!unlocked || muted || document.hidden || !music.paused) return;
    const promise = music.play();
    promise?.catch(() => {
      audioControls.dataset.state = "ready";
    });
  }

  function unlock() {
    const first = !unlocked;
    unlocked = true;
    ensureContext();
    if (first) {
      ["select", "navigate", "open", "page", "close"].forEach(loadBuffer);
    }
    updateInterface();
    startMusic();
  }

  /** Synthesize an ultra-quiet, warm wooden/paper tactile tick via Web Audio. */
  function playMicroCue(name, options = {}) {
    if (!unlocked || muted || document.hidden) return;
    const context = ensureContext();
    if (!context || !masterGain) return;
    const now = context.currentTime;
    const gainValue = clamp((cueGains[name] ?? 0.14) * (options.gain ?? 1), 0, 0.35);

    const osc = context.createOscillator();
    const env = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";

    if (name === "shutter") {
      // Crisp 2-stage mechanical camera shutter: metallic blade click + 42ms damped curtain thump.
      const noiseLen = Math.floor(context.sampleRate * 0.055);
      const noiseBuf = context.createBuffer(1, noiseLen, context.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i += 1) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.24));
      const stage = (offset, freq, q, gainScale) => {
        const src = context.createBufferSource();
        src.buffer = noiseBuf;
        const bp = context.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(freq, now + offset);
        bp.Q.setValueAtTime(q, now + offset);
        const g = context.createGain();
        g.gain.setValueAtTime(0.0001, now + offset);
        g.gain.linearRampToValueAtTime(gainValue * gainScale, now + offset + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.048);
        src.connect(bp).connect(g).connect(masterGain);
        src.start(now + offset);
        src.stop(now + offset + 0.055);
      };
      stage(0, 2600, 2.2, 0.9);
      stage(0.042, 1350, 1.5, 0.72);
      // Warm body thump on release
      osc.type = "sine";
      osc.frequency.setValueAtTime(165, now + 0.04);
      osc.frequency.exponentialRampToValueAtTime(62, now + 0.095);
      filter.frequency.setValueAtTime(420, now + 0.04);
      env.gain.setValueAtTime(0.0001, now + 0.04);
      env.gain.linearRampToValueAtTime(gainValue * 0.55, now + 0.044);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.connect(filter).connect(env).connect(masterGain);
      osc.start(now + 0.04);
      osc.stop(now + 0.11);
      return;
    } else if (name === "detent") {
      // Soft wooden center-detent tick
      osc.type = "sine";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(135, now + 0.018);
      filter.frequency.setValueAtTime(680, now);
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(gainValue * 0.85, now + 0.0025);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
      osc.connect(filter).connect(env).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.025);
    } else if (name === "toggle") {
      const high = options.on !== false;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(high ? 320 : 255, now);
      osc.frequency.exponentialRampToValueAtTime(high ? 460 : 185, now + 0.028);
      filter.frequency.setValueAtTime(1100, now);
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(gainValue, now + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.036);
      osc.connect(filter).connect(env).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (name === "swatch") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(520 * clamp(options.rate ?? 1, 0.85, 1.2), now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.022);
      filter.frequency.setValueAtTime(1400, now);
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(gainValue, now + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
      osc.connect(filter).connect(env).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.032);
    } else {
      // Soft muted paper/wood tap
      osc.type = "triangle";
      osc.frequency.setValueAtTime(380 * clamp(options.rate ?? 1, 0.85, 1.2), now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.02);
      filter.frequency.setValueAtTime(920, now);
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(gainValue, now + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.026);
      osc.connect(filter).connect(env).connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.03);
    }
  }

  function playCue(name, options = {}) {
    const isSynth = name === "tap" || name === "toggle" || name === "swatch" || name === "detent" || name === "shutter";
    const isMicro = isSynth && name !== "shutter";
    const source = sources[name];
    if (!source && !isSynth) return;
    if (!isMicro) unlock();
    else if (!unlocked) return;
    if (muted || document.hidden) return;

    const now = performance.now();
    const minimumInterval = options.minimumInterval ?? cueIntervals[name] ?? 100;
    if (now - (lastCueAt.get(name) || -Infinity) < minimumInterval) return;
    lastCueAt.set(name, now);

    if (isSynth) {
      playMicroCue(name, options);
      return;
    }

    cueCount += 1;
    audioControls.dataset.lastCue = name;
    audioControls.dataset.cueCount = String(cueCount);

    const gainFactor = clamp((cueGains[name] ?? 0.6) * (options.gain ?? 1), 0, 1);
    const rate = clamp(options.rate ?? 1, 0.82, 1.18);

    // Fast path: pre-decoded Web Audio buffer (zero element creation, zero latency).
    const buffer = decodedBuffers.get(name);
    if (buffer && ctx && masterGain) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      if (activeNodes.size >= MAX_VOICES) {
        const oldest = activeNodes.values().next().value;
        try { oldest.stop(); } catch (e) {}
        activeNodes.delete(oldest);
      }
      const node = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      node.buffer = buffer;
      node.playbackRate.value = rate;
      gainNode.gain.value = gainFactor;
      node.connect(gainNode).connect(masterGain);
      activeNodes.add(node);
      node.onended = () => {
        activeNodes.delete(node);
        node.disconnect();
        gainNode.disconnect();
      };
      node.start(0);
      return;
    }

    // Trigger background decode for subsequent plays.
    loadBuffer(name);

    // Fallback while buffer is still decoding on very first interaction.
    if (activeVoices.size >= MAX_VOICES) {
      const oldest = activeVoices.values().next().value;
      oldest.pause();
      activeVoices.delete(oldest);
    }

    const voice = new Audio(source);
    voice.preload = "auto";
    voice.playsInline = true;
    voice.playbackRate = rate;
    voice.dataset.cueGain = String(gainFactor);
    setVoiceVolume(voice);
    activeVoices.add(voice);

    const release = () => {
      activeVoices.delete(voice);
      voice.removeAttribute("src");
      voice.load();
    };
    voice.addEventListener("ended", release, { once: true });
    voice.addEventListener("error", release, { once: true });
    const promise = voice.play();
    promise?.catch(release);
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    if (muted) {
      music.pause();
    } else {
      if (volume <= 0) volume = 0.55;
      unlock();
    }
    persist();
    updateInterface();
  }

  function setVolume(nextVolume) {
    volume = clamp(Number(nextVolume) || 0, 0, 1);
    muted = volume === 0;
    if (!muted) unlock();
    else music.pause();
    persist();
    updateInterface();
  }

  function handleVisibility(hidden) {
    if (hidden) {
      music.pause();
      activeVoices.forEach((voice) => voice.pause());
      activeVoices.clear();
      activeNodes.forEach((node) => { try { node.stop(); } catch (e) {} });
      activeNodes.clear();
      if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
    } else {
      if (ctx && ctx.state === "suspended" && unlocked && !muted) ctx.resume().catch(() => {});
      startMusic();
    }
  }

  function dispose() {
    audioToggle.removeEventListener("click", onToggleClick);
    music.pause();
    music.removeAttribute("src");
    music.load();
    activeVoices.forEach((voice) => {
      voice.pause();
      voice.removeAttribute("src");
    });
    activeVoices.clear();
    activeNodes.forEach((node) => { try { node.stop(); } catch (e) {} });
    activeNodes.clear();
    ctx?.close?.().catch(() => {});
    ctx = null;
  }

  function onToggleClick() {
    setMuted(!muted);
  }

  // The atelier's own slider in place of the placeholder in the page.
  const volumeSlider = createSlider({
    id: "audio-volume", label: "Sound volume", value: volume, min: 0, max: 1, step: 0.05,
    format: (value) => `${Math.round(value * 100)}%`, onInput: (value) => setVolume(value), className: "audio-volume"
  });
  audioVolume.replaceWith(volumeSlider);
  audioVolume = volumeSlider;

  audioToggle.addEventListener("click", onToggleClick);
  updateInterface();

  return {
    unlock,
    playCue,
    handleVisibility,
    dispose
  };
}
