import { IMAGE_TAG_FIND_REGEX } from '@/st/imageTagRegex';

/** 在原始正文中定位选段，标签落在选段所在段落之后；重复或失配时拒绝猜测。 */
export function selectedInsertion(text: string, selection: string): { offset: number; seq: number } | null {
  const needle = selection.trim();
  if (!needle) return null;
  const plain = text.replace(IMAGE_TAG_FIND_REGEX, match => ' '.repeat(match.length));
  const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();
  const target = normalized(needle);
  if (!target) return null;
  // 把折叠空白后的每个字符映射回正文坐标，容忍渲染侧把换行变成空格。
  let compact = '';
  const positions: number[] = [];
  for (let i = 0; i < plain.length; i++) {
    const char = /\s/.test(plain[i]) ? ' ' : plain[i];
    if (char === ' ' && (!compact || compact.endsWith(' '))) continue;
    compact += char;
    positions.push(i);
  }
  const at = compact.indexOf(target);
  if (at < 0 || compact.indexOf(target, at + 1) >= 0) return null;
  const end = positions[at + target.length - 1] + 1;
  if (!end) return null;
  const lineEnd = text.indexOf('\n', end);
  // 段落内选中的文字：放在段落末尾；多段选区：放在最后一段末尾。
  const offset = lineEnd < 0 ? text.length : lineEnd;
  const before = text.slice(0, offset);
  const seq = [...before.matchAll(/<bbi_image>[\s\S]+?<\/bbi_image>/gi)].length;
  return { offset, seq };
}

export function insertSelectedImageTag(text: string, selection: string, tag: string): string | null {
  const target = selectedInsertion(text, selection);
  if (!target) return null;
  const { offset } = target;
  return `${text.slice(0, offset)}\n${tag}${text.slice(offset)}`;
}
