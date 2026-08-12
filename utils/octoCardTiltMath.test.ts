import { describe, expect, it } from 'vitest';

import {
  CARD_TILT_NEUTRAL,
  cardTiltForPointer,
  interpolateCardTilt,
  isCardTiltSettled,
} from './octoCardTiltMath';

describe('cardTiltForPointer', () => {
  const rect = { left: 100, top: 200, width: 400, height: 200 };

  it('keeps the card neutral at its visual center', () => {
    expect(cardTiltForPointer(rect, 300, 300)).toEqual(CARD_TILT_NEUTRAL);
  });

  it('maps the card edge to a bounded tilt and matching glare origin', () => {
    expect(cardTiltForPointer(rect, 500, 200)).toEqual({
      rx: 5,
      ry: 10,
      mx: 100,
      my: 0,
    });
  });

  it('clamps a pointer outside the card instead of overshooting the frame', () => {
    expect(cardTiltForPointer(rect, 900, -100)).toEqual({
      rx: 5,
      ry: 10,
      mx: 100,
      my: 0,
    });
  });
});

describe('interpolateCardTilt', () => {
  it('moves partway toward the target without overshoot', () => {
    expect(interpolateCardTilt(CARD_TILT_NEUTRAL, { rx: 5, ry: 10, mx: 100, my: 0 }, 0.2)).toEqual({
      rx: 1,
      ry: 2,
      mx: 60,
      my: 40,
    });
  });

  it('recognizes when a release animation has settled back at neutral', () => {
    expect(isCardTiltSettled({ rx: 0.01, ry: -0.01, mx: 50.05, my: 49.95 }, CARD_TILT_NEUTRAL)).toBe(true);
    expect(isCardTiltSettled({ rx: 0.2, ry: 0, mx: 50, my: 50 }, CARD_TILT_NEUTRAL)).toBe(false);
  });
});
