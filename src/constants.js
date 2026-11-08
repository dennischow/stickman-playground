export const GRAVITY = 1500;
export const WALK_SPEED = 70;
export const RUN_SPEED = 200;
export const STRIDE_WALK = 78;
export const STRIDE_RUN = 112;
export const EDGE_MARGIN = 50;

export const INK = '#1b1a17';
export const PAPER = '#f7f6f2';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const pick = list => list[Math.floor(Math.random() * list.length)];
