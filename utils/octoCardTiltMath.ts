/** Lightweight, DOM-free math behind the Bot profile card's 3D pointer effect. */

export interface CardTilt {
  /** rotateX in degrees */
  rx: number;
  /** rotateY in degrees */
  ry: number;
  /** glare origin X as a percentage */
  mx: number;
  /** glare origin Y as a percentage */
  my: number;
}

export interface CardTiltRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const CARD_TILT_NEUTRAL: Readonly<CardTilt> = Object.freeze({
  rx: 0,
  ry: 0,
  mx: 50,
  my: 50,
});

const MAX_TILT_DEGREES = 10;
const SETTLE_EPSILON = 0.08;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Map a pointer position to bounded card rotation and holographic glare origin. */
export function cardTiltForPointer(
  rect: CardTiltRect,
  clientX: number,
  clientY: number,
): CardTilt {
  const x = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0.5;
  const y = rect.height > 0 ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0.5;
  return {
    rx: (0.5 - y) * MAX_TILT_DEGREES,
    ry: (x - 0.5) * MAX_TILT_DEGREES,
    mx: x * 100,
    my: y * 100,
  };
}

/** One easing step toward the latest pointer target. `amount` is clamped to [0, 1]. */
export function interpolateCardTilt(current: CardTilt, target: CardTilt, amount: number): CardTilt {
  const t = clamp(amount, 0, 1);
  return {
    rx: current.rx + (target.rx - current.rx) * t,
    ry: current.ry + (target.ry - current.ry) * t,
    mx: current.mx + (target.mx - current.mx) * t,
    my: current.my + (target.my - current.my) * t,
  };
}

/** Stop requesting animation frames once every channel is visually at its target. */
export function isCardTiltSettled(current: CardTilt, target: CardTilt): boolean {
  return (
    Math.abs(current.rx - target.rx) <= SETTLE_EPSILON &&
    Math.abs(current.ry - target.ry) <= SETTLE_EPSILON &&
    Math.abs(current.mx - target.mx) <= SETTLE_EPSILON &&
    Math.abs(current.my - target.my) <= SETTLE_EPSILON
  );
}
