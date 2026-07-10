import { describe, expect, it } from 'vitest';
import {
  bezierPoint,
  clamp,
  computeRenderRatio,
  curveControlPoint,
  distance,
  easeInOutSine,
  KICK_STYLE_IDS,
  MAX_CANVAS_PIXELS,
  normalizeStyle,
  projectilePoint,
  trailQuality,
} from './octoKickMath';

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(0, 5, 10)).toBe(5);
  });
  it('clamps to the lower bound', () => {
    expect(clamp(0, -3, 10)).toBe(0);
  });
  it('clamps to the upper bound', () => {
    expect(clamp(0, 42, 10)).toBe(10);
  });
  it('handles equal bounds', () => {
    expect(clamp(5, 1, 5)).toBe(5);
  });
});

describe('distance', () => {
  it('computes a 3-4-5 triangle', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it('is zero for identical points', () => {
    expect(distance({ x: 7, y: -2 }, { x: 7, y: -2 })).toBe(0);
  });
});

describe('computeRenderRatio', () => {
  it('never drops below the 0.75 floor', () => {
    // Huge viewport + high dpr would push budgetRatio tiny; floor protects it.
    const ratio = computeRenderRatio(8000, 4000, 3);
    expect(ratio).toBe(0.75);
  });
  it('never exceeds the 1.75 ceiling', () => {
    const ratio = computeRenderRatio(100, 100, 4);
    expect(ratio).toBe(1.75);
  });
  it('tracks devicePixelRatio when within budget and bounds', () => {
    // 1280x720 * 1.25^2 ~= 1.44M < budget, dpr 1.25 within [0.75,1.75].
    expect(computeRenderRatio(1280, 720, 1.25)).toBeCloseTo(1.25, 5);
  });
  it('falls back to dpr=1 when devicePixelRatio is 0/NaN', () => {
    expect(computeRenderRatio(1280, 720, 0)).toBeCloseTo(1, 5);
  });
  it('respects a custom pixel budget', () => {
    const big = computeRenderRatio(1000, 1000, 2, MAX_CANVAS_PIXELS);
    const small = computeRenderRatio(1000, 1000, 2, 500_000);
    expect(small).toBeLessThan(big);
  });
});

describe('normalizeStyle', () => {
  it('passes through every known style id', () => {
    for (const id of KICK_STYLE_IDS) {
      expect(normalizeStyle(id)).toBe(id);
    }
  });
  it('defaults unknown ids to lightning', () => {
    expect(normalizeStyle('nope')).toBe('lightning');
    expect(normalizeStyle('')).toBe('lightning');
    expect(normalizeStyle('LIGHTNING')).toBe('lightning');
  });
});

describe('trailQuality', () => {
  it('is full quality with few shots', () => {
    expect(trailQuality(0)).toBe(1);
    expect(trailQuality(2)).toBe(1);
  });
  it('degrades at the mid tier', () => {
    expect(trailQuality(3)).toBeCloseTo(0.72, 5);
    expect(trailQuality(4)).toBeCloseTo(0.72, 5);
  });
  it('degrades furthest when saturated', () => {
    expect(trailQuality(5)).toBeCloseTo(0.46, 5);
    expect(trailQuality(20)).toBeCloseTo(0.46, 5);
  });
});

describe('projectilePoint', () => {
  const start = { x: 100, y: 200 };

  it('returns the start at t=0', () => {
    expect(projectilePoint(start, 500, -300, 600, 0, 1000)).toEqual(start);
  });

  it('applies linear horizontal motion and gravity vertically', () => {
    // At 1s: x = 100 + 500*1 = 600; y = 200 + (-300)*1 + 0.5*600*1 = 200.
    const p = projectilePoint(start, 500, -300, 600, 1000, 1000);
    expect(p.x).toBeCloseTo(600, 5);
    expect(p.y).toBeCloseTo(200, 5);
  });

  it('clamps elapsed time to the duration (no overshoot)', () => {
    const atEnd = projectilePoint(start, 500, -300, 600, 1000, 1000);
    const past = projectilePoint(start, 500, -300, 600, 5000, 1000);
    expect(past).toEqual(atEnd);
  });

  it('has zero gravity contribution when gravity is 0', () => {
    const p = projectilePoint(start, 400, 0, 0, 500, 1000);
    expect(p.x).toBeCloseTo(300, 5);
    expect(p.y).toBeCloseTo(200, 5);
  });
});

describe('bezierPoint', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 50, y: 100 };
  const p2 = { x: 100, y: 0 };

  it('returns the start endpoint at t=0', () => {
    expect(bezierPoint(p0, p1, p2, 0)).toEqual(p0);
  });
  it('returns the end endpoint at t=1', () => {
    expect(bezierPoint(p0, p1, p2, 1)).toEqual(p2);
  });
  it('applies the quadratic weights at t=0.5 (0.25/0.5/0.25)', () => {
    const p = bezierPoint(p0, p1, p2, 0.5);
    expect(p.x).toBeCloseTo(0.25 * 0 + 0.5 * 50 + 0.25 * 100, 5); // 50
    expect(p.y).toBeCloseTo(0.25 * 0 + 0.5 * 100 + 0.25 * 0, 5); // 50
  });
  it('is a straight line when the control point is on the chord', () => {
    const straight = bezierPoint({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, 0.5);
    expect(straight.y).toBeCloseTo(0, 5);
  });
});

describe('curveControlPoint', () => {
  it('offsets vertically-perpendicular for a horizontal chord', () => {
    // chord (0,0)->(100,0): perpendicular is (0,1); lateral bends in y.
    const c = curveControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, 0);
    expect(c.x).toBeCloseTo(50, 5);
    expect(c.y).toBeCloseTo(20, 5);
  });
  it('offsets horizontally-perpendicular for a vertical chord', () => {
    // chord (0,0)->(0,100): perpendicular is (-1,0); lateral bends in x.
    const c = curveControlPoint({ x: 0, y: 0 }, { x: 0, y: 100 }, 20, 0);
    expect(c.x).toBeCloseTo(-20, 5);
    expect(c.y).toBeCloseTo(50, 5);
  });
  it('lift raises the control point up the screen (smaller y)', () => {
    const c = curveControlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 30);
    expect(c.x).toBeCloseTo(50, 5);
    expect(c.y).toBeCloseTo(-30, 5);
  });
  it('flips bend direction with the sign of lateral', () => {
    const left = curveControlPoint({ x: 0, y: 0 }, { x: 100, y: 100 }, 25, 0);
    const right = curveControlPoint({ x: 0, y: 0 }, { x: 100, y: 100 }, -25, 0);
    // Opposite lateral signs mirror the control point across the chord midpoint.
    const mid = { x: 50, y: 50 };
    expect(left.x - mid.x).toBeCloseTo(-(right.x - mid.x), 5);
    expect(left.y - mid.y).toBeCloseTo(-(right.y - mid.y), 5);
  });
});

describe('easeInOutSine', () => {
  it('pins the endpoints', () => {
    expect(easeInOutSine(0)).toBeCloseTo(0, 6);
    expect(easeInOutSine(1)).toBeCloseTo(1, 6);
  });
  it('passes through 0.5 at the midpoint', () => {
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 6);
  });
  it('is symmetric about the midpoint', () => {
    expect(easeInOutSine(0.25) + easeInOutSine(0.75)).toBeCloseTo(1, 6);
  });
  it('clamps out-of-range input', () => {
    expect(easeInOutSine(-1)).toBeCloseTo(0, 6);
    expect(easeInOutSine(2)).toBeCloseTo(1, 6);
  });
});
