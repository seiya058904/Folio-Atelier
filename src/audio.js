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
const audioVolume = document.querySelector("#audio-volume");
const audioStatus = document.querySelector("#audio-status");

export function createAudioSystem(sources) {
  const MUSIC_GAIN = 0.24;
  const MAX_VOICES = 8;
  const cueGains = {
    select: 0.62,
    navigate: 0.42,
    open: 0.7,
    page: 0.62,
    close: 0.68
  };
  const cueIntervals = {
    select: 180,
    navigate: 120,
    open: 260,
    page: 150,
    close: 260
  };
  const activeVoices = new Set();
  const lastCueAt = new Map();
  const music = new Audio(sources.music);
  let cueCount = 0;
  let unlocked = false;
  let muted = false;
  let volume = 0.55;

  music.loop = true;
  music.preload = "auto";
  music.playsInline = true;

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
    audioToggle.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound");
    audioVolume.value = String(volume);
    audioControls.dataset.state = muted ? "muted" : unlocked ? "playing" : "ready";
    audioStatus.textContent = muted
      ? "Sound muted"
      : unlocked
        ? `Sound on at ${Math.round(volume * 100)} percent`
        : `Sound ready at ${Math.round(volume * 100)} percent`;
    music.volume = muted ? 0 : clamp(volume * MUSIC_GAIN, 0, 1);
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
    unlocked = true;
    updateInterface();
    startMusic();
  }

  function playCue(name, options = {}) {
    const source = sources[name];
    if (!source) return;
    unlock();
    if (muted || document.hidden) return;

    const now = performance.now();
    const minimumInterval = options.minimumInterval ?? cueIntervals[name] ?? 100;
    if (now - (lastCueAt.get(name) || -Infinity) < minimumInterval) return;
    lastCueAt.set(name, now);
    cueCount += 1;
    audioControls.dataset.lastCue = name;
    audioControls.dataset.cueCount = String(cueCount);

    if (activeVoices.size >= MAX_VOICES) {
      const oldest = activeVoices.values().next().value;
      oldest.pause();
      activeVoices.delete(oldest);
    }

    const voice = new Audio(source);
    voice.preload = "auto";
    voice.playsInline = true;
    voice.playbackRate = clamp(options.rate ?? 1, 0.82, 1.18);
    voice.dataset.cueGain = String((cueGains[name] ?? 0.6) * (options.gain ?? 1));
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
    } else {
      startMusic();
    }
  }

  function dispose() {
    audioToggle.removeEventListener("click", onToggleClick);
    audioVolume.removeEventListener("input", onVolumeInput);
    music.pause();
    music.removeAttribute("src");
    music.load();
    activeVoices.forEach((voice) => {
      voice.pause();
      voice.removeAttribute("src");
    });
    activeVoices.clear();
  }

  function onToggleClick() {
    setMuted(!muted);
  }

  function onVolumeInput(event) {
    setVolume(event.currentTarget.value);
  }

  audioToggle.addEventListener("click", onToggleClick);
  audioVolume.addEventListener("input", onVolumeInput);
  updateInterface();

  return {
    unlock,
    playCue,
    handleVisibility,
    dispose
  };
}
