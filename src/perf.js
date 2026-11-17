// Performance instrumentation. Collection is a handful of counters and is
// always on; the overlay only exists when the page is opened with `?perf`.
//
//   ?perf        overlay: frame rate, repaint cost per painter, uploads
//   ?perf=gpu    as above, and wait for the GPU each frame so the frame time
//                includes rendering (slower, but honest)
//   ?bench       run the scripted benchmark in src/dev/bench.js

const params = new URLSearchParams(location.search);
const enabled = params.has("perf") || params.has("bench");
const now = () => performance.now();

const FRAME_WINDOW = 180;
const frames = new Float32Array(FRAME_WINDOW);
const cpu = new Float32Array(FRAME_WINDOW);
let frameCursor = 0;
let frameCount = 0;
let frameTimes = []; // timestamps of recent frames, for frames-per-second
let lastFrameAt = 0;

const paints = new Map(); // painter -> { last, total, count }
let uploads = 0;
let uploadPixels = 0;
let editAt = 0;
const latency = []; // control -> pixel, last 40
const marks = new Map(); // name -> last ms
const trace = []; // [time, gap, work, note] per frame, when enabled
let info = () => ({});

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export const perf = {
  enabled,
  syncGpu: params.get("perf") === "gpu" || params.get("bench") === "gpu",

  /** One rendered frame: `delta` since the previous one, `work` spent in it. */
  frame(delta, work, note) {
    const at = now();
    if (enabled && note) {
      trace.push([Math.round(at), Math.round(delta * 10) / 10, Math.round(work * 10) / 10, note]);
      if (trace.length > 600) trace.splice(0, 200);
    }
    frames[frameCursor] = delta;
    cpu[frameCursor] = work;
    frameCursor = (frameCursor + 1) % FRAME_WINDOW;
    frameCount += 1;
    lastFrameAt = at;
    if (enabled) {
      frameTimes.push(at);
      if (frameTimes.length > 240) frameTimes = frameTimes.slice(-120);
    }
    if (editAt) {
      latency.push(at - editAt);
      if (latency.length > 40) latency.shift();
      editAt = 0;
    }
  },

  /** Time a painter; returns whatever `run` returns. */
  paint(name, run) {
    const started = now();
    const result = run();
    const spent = now() - started;
    const entry = paints.get(name) || { last: 0, total: 0, count: 0 };
    entry.last = spent;
    entry.total += spent;
    entry.count += 1;
    paints.set(name, entry);
    return result;
  },

  /** A canvas was handed to the GPU. */
  upload(pixels) {
    uploads += 1;
    uploadPixels += pixels;
  },

  /** An edit arrived; the next rendered frame closes the measurement. */
  edit(at = now()) {
    if (!editAt) editAt = at;
  },

  mark(name, ms) {
    marks.set(name, ms);
  },

  trace,

  setInfo(provider) {
    info = provider;
  },

  reset() {
    paints.clear();
    uploads = 0;
    uploadPixels = 0;
    latency.length = 0;
    frameCount = 0;
    frameTimes = [];
  },

  snapshot() {
    const count = Math.min(frameCount, FRAME_WINDOW);
    const recent = Array.from(frames.slice(0, count));
    const work = Array.from(cpu.slice(0, count));
    const at = now();
    const fps = frameTimes.filter((time) => at - time <= 1000).length;
    return {
      fps,
      idle: at - lastFrameAt > 400,
      frames: frameCount,
      frameAvg: recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : 0,
      frameP95: percentile(recent, 0.95),
      workAvg: work.length ? work.reduce((sum, value) => sum + value, 0) / work.length : 0,
      workP95: percentile(work, 0.95),
      paints: Object.fromEntries([...paints].map(([name, entry]) => [name, {
        last: entry.last, avg: entry.total / entry.count, count: entry.count
      }])),
      uploads,
      uploadMegapixels: uploadPixels / 1e6,
      latencyLast: latency[latency.length - 1] || 0,
      latencyAvg: latency.length ? latency.reduce((sum, value) => sum + value, 0) / latency.length : 0,
      latencyP95: percentile(latency, 0.95),
      marks: Object.fromEntries(marks),
      ...info()
    };
  }
};

function startOverlay() {
  const panel = document.createElement("pre");
  panel.id = "perf-overlay";
  panel.setAttribute("aria-hidden", "true");
  panel.style.cssText = [
    "position:fixed", "left:10px", "bottom:10px", "z-index:9999", "margin:0", "padding:8px 10px",
    "font:11px/1.45 ui-monospace,Consolas,monospace", "color:#e9f2e4", "background:rgba(12,16,12,0.82)",
    "border-radius:6px", "pointer-events:none", "white-space:pre", "max-width:46ch"
  ].join(";");
  document.body.append(panel);
  const ms = (value) => value.toFixed(1).padStart(5);
  let previous = "";
  setInterval(() => {
    const s = perf.snapshot();
    const lines = [
      `${s.idle ? "idle   " : `${String(s.fps).padStart(3)} fps`}  frame ${ms(s.frameAvg)} ms  p95 ${ms(s.frameP95)}`,
      `work  ${ms(s.workAvg)} ms  p95 ${ms(s.workP95)}   frames ${s.frames}`,
      `edit→pixel ${ms(s.latencyLast)} ms  avg ${ms(s.latencyAvg)}  p95 ${ms(s.latencyP95)}`,
      `uploads ${s.uploads}  ${s.uploadMegapixels.toFixed(1)} MP`,
      ...Object.entries(s.paints).map(([name, entry]) => (
        `${name.padEnd(9)} ${ms(entry.last)} ms  avg ${ms(entry.avg)}  ×${entry.count}`
      )),
      ...Object.entries(s.marks).map(([name, value]) => `${name.padEnd(9)} ${ms(value)} ms`),
      s.tier ? `${s.tier}  dpr ${s.pixelRatio}  scale ${s.scale}  ao ${s.post ? "on" : "off"}` : "",
      s.calls !== undefined ? `calls ${s.calls}  tris ${s.triangles}  tex ${s.textures}  geo ${s.geometries}` : ""
    ].filter(Boolean).join("\n");
    if (lines !== previous) {
      previous = lines;
      panel.textContent = lines;
    }
  }, 500);
}

if (enabled) {
  window.__folioPerf = perf;
  if (params.has("perf")) {
    if (document.body) startOverlay();
    else window.addEventListener("DOMContentLoaded", startOverlay, { once: true });
  }
}
