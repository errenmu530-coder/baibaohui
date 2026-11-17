import { requestCompletion, requestViaMainApi, type ChatMsg } from '@/api/client';
import { getTagGenChannel, settings } from '@/state/settings';
import { containsTagMarkup, type ImageTagContent } from '@/st/imageTagRegex';

interface Edit { field: 'tag' | 'nl' | 'negative' | 'character.tag' | 'character.nl'; name?: string; old: string; next: string }

/** 只允许模型对原有字段中的唯一精确片段做替换，或在字段末尾追加。 */
export function applyTargetedEdits(base: ImageTagContent, edits: Edit[], allowNegative = true): ImageTagContent {
  if (!Array.isArray(edits) || !edits.length || edits.length > 8) throw new Error('AI 没有给出可应用的局部修改');
  const next: ImageTagContent = { ...base, characters: base.characters.map(item => ({ ...item })) };
  for (const edit of edits) {
    if (!edit || typeof edit.old !== 'string' || typeof edit.next !== 'string' ||
      !['tag', 'nl', 'negative', 'character.tag', 'character.nl'].includes(edit.field) ||
      containsTagMarkup(edit.next)) throw new Error('AI 返回的修改格式无效');
    if (edit.field === 'negative' && !allowNegative) throw new Error('当前 NovelAI 渠道不读取画面负面字段，请让 AI 修改正向词');
    const character = edit.field.startsWith('character.')
      ? next.characters.find(item => item.name === edit.name) : null;
    if (edit.field.startsWith('character.') && !character) throw new Error(`找不到角色「${edit.name ?? ''}」`);
    const target = (character ?? next) as unknown as Record<string, string>;
    const field = edit.field.split('.').pop()!;
    const original = target[field] ?? '';
    if (edit.old) {
      const at = original.indexOf(edit.old);
      if (at < 0 || original.indexOf(edit.old, at + 1) >= 0) throw new Error(`AI 指定的原词无法唯一定位：${edit.old}`);
      target[field] = `${original.slice(0, at)}${edit.next}${original.slice(at + edit.old.length)}`;
    } else {
      if (!edit.next.trim()) throw new Error('AI 给出了空追加词');
      target[field] = original ? `${original}${field === 'nl' ? ' ' : ', '}${edit.next}` : edit.next;
    }
  }
  if (!next.tag.trim()) throw new Error('修改会清空画面提示词');
  return next;
}

export async function requestTargetedRewrite(base: ImageTagContent, instruction: string, signal?: AbortSignal): Promise<ImageTagContent> {
  const allowNegative = settings.defaultBackend !== 'nai';
  const messages: ChatMsg[] = [
    { role: 'system', content: `你是图片提示词局部修改器。只输出 JSON：{"edits":[{"field":"tag|nl|${allowNegative ? 'negative|' : ''}character.tag|character.nl","name":"角色名（角色字段必填）","old":"原字段中精确且唯一的连续片段；追加时留空","next":"替换后的片段或追加词"}]}。不要输出完整提示词。仅修改用户要求涉及的词，其他角色、构图、画风和提示词保持原样。如果要去掉竹叶，替换竹叶相关词或在对应字段追加 leafless bamboo 等约束。old 必须逐字复制自对应原字段，不能猜测。最多 8 项。${allowNegative ? '' : '当前 NovelAI 不读取画面 negative 字段，禁止修改它；限制词写进正向 tag 或 nl。'}` },
    { role: 'user', content: `原提示词 JSON：${JSON.stringify(base)}\n用户修改要求：${instruction}` },
  ];
  let edited: ImageTagContent | null = null;
  let validationError = '';
  const validate = (raw: string) => {
    try {
      const candidate = raw.match(/\{[\s\S]*\}/)?.[0];
      if (!candidate) throw new Error('AI 没有返回局部修改 JSON');
      const object = JSON.parse(candidate) as { edits?: Edit[] };
      edited = applyTargetedEdits(base, object.edits ?? [], allowNegative);
    } catch (error) {
      validationError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  };
  const channel = getTagGenChannel();
  for (let attempt = 0; attempt < 2; attempt++) {
    validationError = '';
    try {
      if (channel) await requestCompletion(channel, messages, { source: '局部修改提示词', validate, signal });
      else await requestViaMainApi(messages, { source: '局部修改提示词', validate, signal });
      break;
    } catch (error) {
      if (!validationError || attempt > 0 || signal?.aborted) throw error;
      messages.push({ role: 'user', content: `上次修改无法应用：${validationError}。请严格从原字段逐字复制 old，重新输出 JSON。` });
    }
  }
  if (!edited) throw new Error('AI 没有给出有效修改');
  return edited;
}
