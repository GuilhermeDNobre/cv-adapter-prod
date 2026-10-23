export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_DRAWER: [number, number, number, number] = [0.32, 0.72, 0, 1];
export const PRESS_MS = 120;
export const POPOVER_IN_MS = 160;
export const POPOVER_OUT_MS = 120;
export const DRAWER_IN_MS = 260;
export const DRAWER_OUT_MS = 200;
export const PROGRESS_SWAP_MS = 180;
export const STEP_ENTER_MS = 220;
export const DIALOG_MS = 180;
export const CHEVRON_MS = 150;
export const PROGRESS_BAR_MS = 300;
export const MATCH_COUNT_MS = 520;
export const TOAST_IN_MS = 200;
export const TOAST_OUT_MS = 160;
export const STEP_OFFSET_PX = 8;

export function toCubicBezier(curve: readonly [number, number, number, number]): string {
  return `cubic-bezier(${curve[0]}, ${curve[1]}, ${curve[2]}, ${curve[3]})`;
}

export function ms(value: number): string {
  return `${value}ms`;
}
