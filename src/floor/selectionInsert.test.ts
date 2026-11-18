import { describe, expect, it } from 'vitest';
import { insertSelectedImageTag, selectedInsertion } from '@/floor/selectionInsert';

const old = '<bbi_image><tag>old</tag></bbi_image>';
const fresh = '<bbi_image><tag>new</tag></bbi_image>';

describe('selectedInsertion', () => {
  it('把选段图片放在所属段落后，后面的段落与标签原样保留', () => {
    const source = `第一段竹子练剑。\n${old}\n第二段雨停了。\n第三段收尾。`;
    const result = insertSelectedImageTag(source, '第二段雨停了', fresh);
    expect(result).toBe(`第一段竹子练剑。\n${old}\n第二段雨停了。\n${fresh}\n第三段收尾。`);
    expect(selectedInsertion(source, '第二段雨停了')?.seq).toBe(1);
  });
  it('重复文字无法唯一定位时拒绝写入', () => {
    expect(insertSelectedImageTag('竹子。\n竹子。', '竹子', fresh)).toBeNull();
  });
  it('跨行选区落在最后一行后', () => {
    expect(insertSelectedImageTag('甲。\n乙。\n丙。', '甲。 乙。', fresh)).toBe(`甲。\n乙。\n${fresh}\n丙。`);
  });
  it('跨段选择渲染后的 Markdown 文字，仍落在最后一段后', () => {
    const source = `**甲段。**\n\n_乙段。_\n丙段。`;
    expect(insertSelectedImageTag(source, '甲段。\n乙段。', fresh)).toBe(`**甲段。**\n\n_乙段。_\n${fresh}\n丙段。`);
  });
  it('跨段选择带链接和 HTML 样式的文字', () => {
    const source = `甲<a href="/x">乙</a>。\n[丙](https://example.com)丁。\n戊。`;
    expect(insertSelectedImageTag(source, '甲乙。\n丙丁。', fresh)).toBe(`甲<a href="/x">乙</a>。\n[丙](https://example.com)丁。\n${fresh}\n戊。`);
  });
  it('渲染后仍有多个匹配位置时拒绝猜测', () => {
    expect(insertSelectedImageTag('**甲段。**\n乙段。\n甲段。\n乙段。', '甲段。\n乙段。', fresh)).toBeNull();
  });
});
