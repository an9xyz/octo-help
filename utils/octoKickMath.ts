/**
 * Pure, dependency-free math helpers for the full-screen football kick
 * animation. Kept free of DOM / window access so they can be unit-tested and
 * shared between the (legacy) Canvas 2D renderer and the PixiJS renderer.
 */

export interface Point {
  x: number;
  y: number;
}

export type KickStyleId = 'lightning' | 'fire' | 'bullet' | 'comet' | 'cannon';

/** Canonical, ordered list of the supported kick styles. */
export const KICK_STYLE_IDS: readonly KickStyleId[] = [
  'lightning',
  'fire',
  'bullet',
  'comet',
  'cannon',
];

const KICK_STYLE_SET = new Set<string>(KICK_STYLE_IDS);

/** Default canvas pixel budget used to derive a device-pixel render ratio. */
export const MAX_CANVAS_PIXELS = 1_800_000;

/** Clamp `value` into the inclusive `[min, max]` range. */
export function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Derive the render ratio (device pixels per CSS pixel) for the animation
 * canvas, bounded so the backing store never exceeds `maxCanvasPixels` and
 * stays within a sane [0.75, 1.75] range.
 */
export function computeRenderRatio(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  maxCanvasPixels: number = MAX_CANVAS_PIXELS,
): number {
  const viewportPixels = Math.max(1, viewportWidth * viewportHeight);
  const budgetRatio = Math.sqrt(maxCanvasPixels / viewportPixels);
  const dpr = devicePixelRatio || 1;
  return clamp(0.75, Math.min(dpr, budgetRatio), 1.75);
}

/** Coerce an arbitrary style id into a known `KickStyleId`, defaulting to lightning. */
export function normalizeStyle(styleId: string): KickStyleId {
  return KICK_STYLE_SET.has(styleId) ? (styleId as KickStyleId) : 'lightning';
}

/**
 * Trail render-quality multiplier that degrades as more shots fly at once,
 * trading fidelity for frame budget.
 */
export function trailQuality(activeShotCount: number): number {
  if (activeShotCount <= 2) return 1;
  if (activeShotCount <= 4) return 0.72;
  return 0.46;
}

/**
 * Ballistic position of a shot at `elapsedMs`. Horizontal motion is linear;
 * vertical motion adds constant gravity. Elapsed time is clamped to the
 * shot's duration so the point never overshoots past the target.
 */
export function projectilePoint(
  start: Point,
  velocityX: number,
  velocityY: number,
  gravity: number,
  elapsedMs: number,
  durationMs: number,
): Point {
  const seconds = Math.min(elapsedMs, durationMs) / 1000;
  return {
    x: start.x + velocityX * seconds,
    y: start.y + velocityY * seconds + 0.5 * gravity * seconds * seconds,
  };
}


/**
 * Point on a quadratic Bézier curve at parameter `t` (0..1), defined by the
 * endpoints `p0`, `p2` and the control point `p1`. Used to fly the ball along
 * a smooth banana/curveball arc instead of a plain gravity parabola.
 */
export function bezierPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt;
  const b = 2 * mt * t;
  const c = t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x,
    y: a * p0.y + b * p1.y + c * p2.y,
  };
}

/**
 * Control point for a curveball: the chord midpoint pushed sideways along the
 * chord's perpendicular by `lateral` (signed — left/right bend) and lifted up
 * the screen by `lift` (arc height). Randomizing `lateral`/`lift` per shot
 * yields a different banana curve on every click.
 */
export function curveControlPoint(
  start: Point,
  target: Point,
  lateral: number,
  lift: number,
): Point {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  // Unit vector perpendicular to the chord (chord rotated by +90°).
  const nx = -dy / len;
  const ny = dx / len;
  return {
    x: (start.x + target.x) / 2 + nx * lateral,
    y: (start.y + target.y) / 2 + ny * lateral - lift,
  };
}


/**
 * Smooth ease-in-out (sine) over 0..1. Used to shape the ball's speed along
 * its curve so it accelerates off the foot and settles into the target rather
 * than moving at a constant parameter rate.
 */
export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp(0, t, 1)) - 1) / 2;
}
