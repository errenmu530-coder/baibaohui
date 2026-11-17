import { describe, expect, it } from 'vitest';
import { focusedRect, focusedResolution } from '@/floor/focusedInpaint';

describe('focused inpainting geometry', () => {
  it('给脚部遮罩增加上下文，限制在原图范围，并提升至约百万像素', () => {
    const rect = focusedRect({ x: 312, y: 960, width: 167, height: 230 }, 832, 1216);
    expect(rect.x).toBeLessThan(312);
    expect(rect.y).toBeLessThan(960);
    expect(rect.x + rect.width).toBeLessThanOrEqual(832);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1216);
    const size = focusedResolution(rect);
    expect(size.width % 64).toBe(0);
    expect(size.height % 64).toBe(0);
    expect(size.width * size.height).toBeGreaterThan(750_000);
    expect(size.width * size.height).toBeLessThanOrEqual(1_048_576);
  });
  it('手动画框时在框外保留上下文，并为过窄区域补足上下文', () => {
    const rect = focusedRect({ x: 100, y: 200, width: 300, height: 300 }, 832, 1216, true);
    expect(rect.x).toBeLessThan(100);
    expect(rect.y).toBeLessThan(200);
    expect(rect.x + rect.width).toBeGreaterThan(400);
    expect(focusedRect({ x: 200, y: 300, width: 20, height: 200 }, 832, 1216, true).width).toBeGreaterThan(20);
  });
});
