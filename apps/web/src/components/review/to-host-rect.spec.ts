import { describe, expect, it } from 'vitest';
import { toHostRect } from './to-host-rect';

describe('toHostRect', () => {
  it('should add the frame origin without scaling', () => {
    const result = toHostRect(
      { top: 10, left: 20, width: 100, height: 30 },
      { top: 50, left: 40 },
    );

    expect(result).toEqual({ top: 60, left: 60, width: 100, height: 30 });
  });

  it('should not scale an already-scaled rect from a reduced preview', () => {
    const rectFromZoomHalf = { top: 100, left: 50, width: 150, height: 20 };
    const result = toHostRect(rectFromZoomHalf, { top: 10, left: 20 });

    expect(result).toEqual({ top: 110, left: 70, width: 150, height: 20 });
  });

  it('should include a 1px iframe border already summed into the origin', () => {
    const result = toHostRect({ top: 10, left: 20, width: 100, height: 30 }, { top: 201, left: 101 });

    expect(result).toEqual({ top: 211, left: 121, width: 100, height: 30 });
  });

  it('should add the rect as-is when the iframe content is scrolled', () => {
    const result = toHostRect({ top: 30, left: 10, width: 60, height: 20 }, { top: 200, left: 100 });

    expect(result).toEqual({ top: 230, left: 110, width: 60, height: 20 });
  });
});
