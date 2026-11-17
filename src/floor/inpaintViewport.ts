export interface ScreenPoint { x: number; y: number }
export interface ViewTransform { scale: number; x: number; y: number }
export interface PinchStart {
  distance: number;
  scale: number;
  anchor: ScreenPoint;
}

export function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function beginPinch(a: ScreenPoint, b: ScreenPoint, current: ViewTransform): PinchStart {
  const middle = midpoint(a, b);
  return { distance: Math.max(1, distance(a, b)), scale: current.scale,
    anchor: { x: (middle.x - current.x) / current.scale, y: (middle.y - current.y) / current.scale } };
}

/** 双指中心锚定内容坐标；超出视口时钳住平移，避免图片被拖没。 */
export function movePinch(
  start: PinchStart,
  a: ScreenPoint,
  b: ScreenPoint,
  viewport: { width: number; height: number },
  maxScale = 5,
): ViewTransform {
  const scale = Math.max(1, Math.min(maxScale, start.scale * distance(a, b) / start.distance));
  const middle = midpoint(a, b);
  const x = middle.x - start.anchor.x * scale;
  const y = middle.y - start.anchor.y * scale;
  return {
    scale,
    x: Math.min(0, Math.max(viewport.width * (1 - scale), x)),
    y: Math.min(0, Math.max(viewport.height * (1 - scale), y)),
  };
}
