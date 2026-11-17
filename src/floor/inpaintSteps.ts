import type { FocusRect } from '@/floor/focusedInpaint';

export interface InpaintPoint { x: number; y: number }
export type InpaintStep =
  | { kind: 'focus'; rect: FocusRect }
  | { kind: 'brush'; points: InpaintPoint[]; width: number };

/** 聚焦框和涂抹互斥；同一模式的连续笔画可以逐笔撤回。 */
export function visibleInpaintSteps(steps: readonly InpaintStep[]): InpaintStep[] {
  if (!steps.length) return [];
  const last = steps[steps.length - 1];
  if (last.kind === 'focus') return [last];
  let start = steps.length - 1;
  while (start > 0 && steps[start - 1].kind === 'brush') start--;
  return steps.slice(start);
}
