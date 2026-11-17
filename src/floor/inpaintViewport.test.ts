import { describe, expect, it } from 'vitest';
import { beginPinch, movePinch } from '@/floor/inpaintViewport';

describe('局部重绘双指缩放', () => {
  it('双指放大时保持两指中心下的图像位置', () => {
    const start = beginPinch({ x: 50, y: 100 }, { x: 150, y: 100 }, { scale: 1, x: 0, y: 0 });
    const next = movePinch(start, { x: 0, y: 100 }, { x: 200, y: 100 }, { width: 300, height: 400 });
    expect(next).toEqual({ scale: 2, x: -100, y: -100 });
    expect((100 - next.x) / next.scale).toBe(100);
  });
  it('双指平移和缩小都保持在图像边界内', () => {
    const start = beginPinch({ x: 80, y: 100 }, { x: 180, y: 100 }, { scale: 2, x: -50, y: -80 });
    const moved = movePinch(start, { x: 200, y: 200 }, { x: 300, y: 200 }, { width: 300, height: 400 });
    expect(moved.scale).toBe(2);
    expect(moved.x).toBeLessThanOrEqual(0);
    expect(moved.y).toBeLessThanOrEqual(0);
    const reset = movePinch(start, { x: 120, y: 200 }, { x: 130, y: 200 }, { width: 300, height: 400 });
    expect(reset).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
