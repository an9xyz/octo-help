import { describe, expect, it } from 'vitest';
import { calculateComposerPetPosition } from './octoPetRenderer';

describe('calculateComposerPetPosition', () => {
  it('sits the pet just above the composer with a restrained left inset', () => {
    expect(calculateComposerPetPosition(
      { left: 200, top: 620, width: 800 },
      { width: 72, height: 64 },
      { width: 1200, height: 800 },
    )).toEqual({ x: 224, y: 563 });
  });

  it('keeps the pet inside the viewport near an edge', () => {
    expect(calculateComposerPetPosition(
      { left: 2, top: 30, width: 180 },
      { width: 72, height: 64 },
      { width: 320, height: 240 },
    )).toEqual({ x: 10, y: 8 });
  });
});
