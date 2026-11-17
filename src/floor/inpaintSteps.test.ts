import { describe, expect, it } from 'vitest';
import { visibleInpaintSteps, type InpaintStep } from '@/floor/inpaintSteps';

const first: InpaintStep = { kind: 'brush', points: [{ x: 1, y: 2 }], width: 10 };
const second: InpaintStep = { kind: 'brush', points: [{ x: 3, y: 4 }], width: 10 };
const box: InpaintStep = { kind: 'focus', rect: { x: 5, y: 6, width: 100, height: 80 } };

describe('局部重绘逐步撤回', () => {
  it('连续涂抹按笔画累积并逐笔撤回', () => {
    const steps = [first, second];
    expect(visibleInpaintSteps(steps)).toEqual([first, second]);
    steps.pop();
    expect(visibleInpaintSteps(steps)).toEqual([first]);
  });
  it('新框替换当前选区，撤回后恢复之前的涂抹', () => {
    const steps = [first, second, box];
    expect(visibleInpaintSteps(steps)).toEqual([box]);
    steps.pop();
    expect(visibleInpaintSteps(steps)).toEqual([first, second]);
  });
  it('框后涂抹时保留聚焦框，撤回该笔后仍显示框选', () => {
    const steps = [box, first];
    expect(visibleInpaintSteps(steps)).toEqual([box, first]);
    steps.pop();
    expect(visibleInpaintSteps(steps)).toEqual([box]);
  });
});
