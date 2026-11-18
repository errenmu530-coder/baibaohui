import { IMAGE_TAG_FIND_REGEX } from '@/st/imageTagRegex';

/** 折叠空白，同时保存每个可见字符在原文中的坐标。 */
function compactSource(source: string, rendered: boolean): { text: string; positions: number[] } {
  let plain = source.replace(IMAGE_TAG_FIND_REGEX, match => ' '.repeat(match.length));
  if (rendered) {
    // 选区取自渲染后的正文：HTML 标签和 Markdown 标记本身不会出现在选中文字中。
    plain = plain.replace(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi, match =>
      /^<\/?(?:br|p|div|li)\b/i.test(match) ? ' '.repeat(match.length) : '\0'.repeat(match.length));
    plain = plain.replace(/!?\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, match => {
      const labelStart = match.indexOf('[') + 1;
      const labelEnd = match.indexOf(']');
      return '\0'.repeat(labelStart) + match.slice(labelStart, labelEnd) + '\0'.repeat(match.length - labelEnd);
    });
  }
  let compact = '';
  const positions: number[] = [];
  for (let i = 0; i < plain.length; i++) {
    if (plain[i] === '\0') continue;
    if (rendered && /[*_~`#>|]/.test(plain[i])) continue;
    const char = /\s/.test(plain[i]) ? ' ' : plain[i];
    if (char === ' ' && (!compact || compact.endsWith(' '))) continue;
    compact += char;
    positions.push(i);
  }
  return { text: compact, positions };
}

function uniqueEnd(source: ReturnType<typeof compactSource>, target: string): number | 'ambiguous' | null {
  const at = source.text.indexOf(target);
  if (at < 0) return null;
  if (source.text.indexOf(target, at + 1) >= 0) return 'ambiguous';
  return source.positions[at + target.length - 1] + 1;
}

/** 在原始正文中定位选段，标签落在选段所在段落之后；重复或失配时拒绝猜测。 */
export function selectedInsertion(text: string, selection: string): { offset: number; seq: number } | null {
  const target = selection.replace(/\s+/g, ' ').trim();
  if (!target) return null;
  // 两种视图都检查唯一性：不能因另一处带格式标记而误认唯一的原文匹配。
  const exact = uniqueEnd(compactSource(text, false), target);
  const rendered = uniqueEnd(compactSource(text, true), target);
  if (exact === 'ambiguous' || rendered === 'ambiguous') return null;
  if (exact !== null && rendered !== null && exact !== rendered) return null;
  const end = exact ?? rendered;
  if (end === null) return null;
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
