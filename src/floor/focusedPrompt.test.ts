import { describe, expect, it } from 'vitest';
import { parseFocusedPrompt } from '@/floor/focusedPrompt';

describe('局部重绘请求词校验', () => {
  it('接受只描述脚、鞋及紧邻地面的请求词', () => {
    expect(parseFocusedPrompt('{"tag":"feet in soft cloth boots, lower legs, gray pebbles","nl":"The boots fit the existing feet and meet the visible lower legs."}'))
      .toEqual({ tag: 'feet in soft cloth boots, lower legs, gray pebbles',
        nl: 'The boots fit the existing feet and meet the visible lower legs.' });
  });
  it('拒绝整幅场景和完整双人的请求词', () => {
    expect(() => parseFocusedPrompt('{"tag":"1boy 1girl, lakeside","nl":"two people by a lake"}')).toThrow('整幅构图');
    expect(() => parseFocusedPrompt('{"tag":"full body, soft boots","nl":""}')).toThrow('整幅构图');
  });
});
