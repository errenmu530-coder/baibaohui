import type { FocusRect } from '@/floor/inpaintSelection';

export interface InpaintPoint { x: number; y: number }
export type InpaintStep =
  | { kind: 'focus'; rect: FocusRect }
  | { kind: 'brush'; points: InpaintPoint[]; width: number };

/** 最近的聚焦框保持可见，其后的每笔涂抹叠加；新的框替换之前的选区。 */
export function visibleInpaintSteps(steps: readonly InpaintStep[]): InpaintStep[] {
  if (!steps.length) return [];
  const lastFocus = steps.findLastIndex(step => step.kind === 'focus');
  return steps.slice(Math.max(0, lastFocus));
}
