// One vocabulary of motion for the 3D scene and the interface. The curves
// here match the CSS custom properties of the same names in styles/app.css
// (--ease-out, --ease-spring), so a panel and a book move alike.

export const DURATION = Object.freeze({
  press: 0.09,
  quick: 0.18,
  base: 0.32,
  slow: 0.52
});

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export const ease = Object.freeze({
  linear: (t) => clamp01(t),
  outCubic: (t) => 1 - Math.pow(1 - clamp01(t), 3),
  inCubic: (t) => Math.pow(clamp01(t), 3),
  inOutCubic: (t) => {
    const x = clamp01(t);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  },
  smooth: (t) => {
    const x = clamp01(t);
    return x * x * (3 - 2 * x);
  },
  smoother: (t) => {
    const x = clamp01(t);
    return x * x * x * (x * (x * 6 - 15) + 10);
  },
  /** Runs past the end and settles back; `overshoot` is how far. */
  outBack: (t, overshoot = 1.4) => {
    const x = clamp01(t) - 1;
    return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
  },
  /** 0 → 1 → 0 over the run: a pulse. */
  pulse: (t) => Math.sin(Math.PI * clamp01(t))
});

/**
 * Advance a damped spring by `delta` seconds. `state` is `{ value, velocity }`
 * and is updated in place. Returns true while it is still moving.
 * A damping ratio below 1 (`damping < 2 * sqrt(stiffness)`) overshoots.
 * It comes to rest once within `precision` of the target (and nearly still).
 */
export function stepSpring(state, target, stiffness, damping, delta, precision = 0.0002) {
  // Two half steps keep it stable at low frame rates.
  const step = Math.min(delta, 0.034) / 2;
  for (let index = 0; index < 2; index += 1) {
    const acceleration = (target - state.value) * stiffness - state.velocity * damping;
    state.velocity += acceleration * step;
    state.value += state.velocity * step;
  }
  if (Math.abs(target - state.value) < precision && Math.abs(state.velocity) < precision * 10) {
    state.value = target;
    state.velocity = 0;
    return false;
  }
  return true;
}

/** Run `work` when the browser has a quiet moment (or soon, where unsupported). */
export function whenIdle(work, timeout = 1200) {
  if (window.requestIdleCallback) return window.requestIdleCallback(work, { timeout });
  return setTimeout(() => work({ didTimeout: true, timeRemaining: () => 8 }), 60);
}
