import { describe, expect, it } from 'vitest';
import { applyTargetedEdits } from '@/floor/targetedRewrite';
import type { ImageTagContent } from '@/st/imageTagRegex';

const base: ImageTagContent = {
  tag: '2girls, bamboo with leaves, sword practice, river',
  nl: 'Two friends practice by a river.', negative: 'bad hands', size: 'landscape',
  characters: [
    { name: 'A', tag: 'long black hair, white dress', nl: 'A stands left.' },
    { name: 'B', tag: 'short brown hair, red coat', nl: 'B stands right.' },
  ],
};

describe('applyTargetedEdits', () => {
  it('只替换竹叶词，保留其他角色和画面', () => {
    const next = applyTargetedEdits(base, [{ field: 'tag', old: 'bamboo with leaves', next: 'leafless bamboo' }]);
    expect(next.tag).toBe('2girls, leafless bamboo, sword practice, river');
    expect(next.characters).toEqual(base.characters);
    expect(base.tag).toContain('with leaves');
  });
  it('只改指定角色', () => {
    const next = applyTargetedEdits(base, [{ field: 'character.tag', name: 'B', old: 'short brown hair', next: 'long brown hair' }]);
    expect(next.characters[0]).toEqual(base.characters[0]);
    expect(next.characters[1].tag).toBe('long brown hair, red coat');
  });
  it('指定重绘角色时拒绝改动其他角色或全局画面', () => {
    expect(() => applyTargetedEdits(base, [{ field: 'character.tag', name: 'B', old: 'red coat', next: 'blue coat' }], false, 'A')).toThrow('只允许修改角色');
    expect(() => applyTargetedEdits(base, [{ field: 'tag', old: 'river', next: 'lake' }], false, 'A')).toThrow('只允许修改角色');
    const edited = applyTargetedEdits(base, [{ field: 'character.tag', name: 'A', old: 'white dress', next: 'blue dress' }], false, 'A');
    expect(edited.characters[0].tag).toContain('blue dress');
    expect(edited.characters[1]).toEqual(base.characters[1]);
  });
  it('拒绝原词不匹配和 NovelAI 不生效的画面负面字段', () => {
    expect(() => applyTargetedEdits(base, [{ field: 'tag', old: 'pine', next: 'bamboo' }])).toThrow();
    expect(() => applyTargetedEdits(base, [{ field: 'negative', old: '', next: 'leaves' }], false)).toThrow();
  });
});
