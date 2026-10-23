export interface ChangeRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameOffset {
  readonly top: number;
  readonly left: number;
}

export function toHostRect(rect: ChangeRect, frameOrigin: FrameOffset): ChangeRect {
  return {
    top: frameOrigin.top + rect.top,
    left: frameOrigin.left + rect.left,
    width: rect.width,
    height: rect.height,
  };
}
