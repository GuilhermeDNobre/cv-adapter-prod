import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';
import {
  CHEVRON_MS,
  DIALOG_MS,
  DRAWER_IN_MS,
  DRAWER_OUT_MS,
  EASE_DRAWER,
  EASE_OUT,
  MATCH_COUNT_MS,
  POPOVER_IN_MS,
  POPOVER_OUT_MS,
  PRESS_MS,
  PROGRESS_BAR_MS,
  PROGRESS_SWAP_MS,
  STEP_ENTER_MS,
  STEP_OFFSET_PX,
  TOAST_IN_MS,
  TOAST_OUT_MS,
  ms,
  toCubicBezier,
} from './motion';

describe('motion tokens', () => {
  it('should match the handoff timings', () => {
    expect(EASE_OUT).toEqual([0.16, 1, 0.3, 1]);
    expect(PRESS_MS).toBe(120);
    expect(POPOVER_IN_MS).toBe(160);
    expect(DRAWER_IN_MS).toBe(260);
    expect(DRAWER_OUT_MS).toBe(200);
    expect(PROGRESS_SWAP_MS).toBe(180);
    expect(STEP_ENTER_MS).toBe(220);
    expect(DIALOG_MS).toBe(180);
    expect(CHEVRON_MS).toBe(150);
    expect(PROGRESS_BAR_MS).toBe(300);
    expect(MATCH_COUNT_MS).toBe(520);
    expect(TOAST_IN_MS).toBe(200);
    expect(TOAST_OUT_MS).toBe(160);
    expect(STEP_OFFSET_PX).toBe(8);
  });

  it('should make exits faster than entrances', () => {
    expect(POPOVER_OUT_MS).toBeLessThan(POPOVER_IN_MS);
    expect(DRAWER_OUT_MS).toBeLessThan(DRAWER_IN_MS);
    expect(TOAST_OUT_MS).toBeLessThan(TOAST_IN_MS);
  });

  it('should format curves and durations as CSS strings', () => {
    expect(toCubicBezier(EASE_OUT)).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(ms(PRESS_MS)).toBe('120ms');
  });

  it('should build the tailwind drawer-in animation from the motion tokens', () => {
    const animation = (
      config.theme?.extend?.animation as Record<string, string> | undefined
    )?.['drawer-in'];
    expect(animation).toBe(`drawer-in ${ms(DRAWER_IN_MS)} ${toCubicBezier(EASE_DRAWER)}`);
  });
});
