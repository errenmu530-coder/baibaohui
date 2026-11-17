import { requestCompletion, requestViaMainApi, type ChatMsg } from '@/api/client';
import { getTagGenChannel } from '@/state/settings';
import type { ImageTagContent } from '@/st/imageTagRegex';

export interface FocusedPrompt { tag: string; nl: string }

/** 局部画面专用请求词：拒绝整幅构图和人数标签，避免把双人全景缩进脚部遮罩。 */
export function parseFocusedPrompt(raw: string, instruction = ''): FocusedPrompt {
  const candidate = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error('AI 没有返回局部请求词 JSON');
  const parsed = JSON.parse(candidate) as Partial<FocusedPrompt>;
  const tag = typeof parsed.tag === 'string' ? parsed.tag.trim() : '';
  const nl = typeof parsed.nl === 'string' ? parsed.nl.trim() : '';
  if (!tag || tag.length > 350 || nl.length > 350 || /[<>\r\n]/.test(tag + nl))
    throw new Error('AI 返回的局部请求词无效');
  if (/[^\x00-\x7f]/.test(tag + nl))
    throw new Error('局部请求词必须是英文');
  if (/\b(?:\d+\s*(?:boys?|girls?)|two people|multiple people|full body|whole scene|entire scene|wide shot|medium shot|group shot)\b/i.test(tag + nl))
    throw new Error('局部请求词不能包含整幅构图或完整人物');
  if (/(穿上|穿着|换上|给.{0,8}穿|put on|wear.{0,12}(?:shoes?|boots?))/i.test(instruction) &&
    !/(脱鞋|脱掉|不穿|赤脚|barefoot)/i.test(instruction) &&
    /\b(?:bare\s+feet|barefoot|unshod|without shoes?)\b/i.test(tag + nl))
    throw new Error('给脚穿鞋时，局部请求词不能继续描述赤脚');
  return { tag, nl };
}

/** 把自然语言要求变成只描述遮罩内物体及相邻连接处的 NAI 提示词。 */
export async function requestFocusedPrompt(
  full: ImageTagContent,
  instruction: string,
  targetCharacter?: string,
  signal?: AbortSignal,
): Promise<FocusedPrompt> {
  const messages: ChatMsg[] = [
    { role: 'system', content: '你是 NovelAI 局部重绘提示词编写器。只输出 JSON：{"tag":"英文短标签，用逗号隔开","nl":"一句英文局部描述"}。图像已裁切到用户选中的区域，原图的周围像素会作为视觉上下文。只描述用户要改变的局部物体、与它相连的身体部位和紧邻背景；不要描述整个人、两个人、整幅场景、构图或镜头。不要写 1boy、1girl、full body 等人数和全身词。只写修改后的最终状态，不要重复原来不想要的状态；给脚穿鞋时不要再写 bare feet、barefoot 或赤脚。不要凭空补充与修改无关的外貌。若用户要求给脚穿鞋，重点写鞋、脚、小腿与地面，强调鞋完整包住脚；不要生成缩小的完整人物。质量词和画师串由程序另外加入，这里不要写。' },
    { role: 'user', content: `用户局部修改要求：${instruction}\n目标角色：${targetCharacter || '画面物体或全部角色'}\n修改后的整图提示词（仅用于提取局部细节，禁止整段复制）：${JSON.stringify(full)}` },
  ];
  let prompt: FocusedPrompt | null = null;
  let validationError = '';
  const validate = (raw: string) => {
    try { prompt = parseFocusedPrompt(raw, instruction); }
    catch (error) { validationError = error instanceof Error ? error.message : String(error); throw error; }
  };
  const channel = getTagGenChannel();
  for (let attempt = 0; attempt < 2; attempt++) {
    validationError = '';
    try {
      if (channel) await requestCompletion(channel, messages, { source: '聚焦局部请求词', validate, signal });
      else await requestViaMainApi(messages, { source: '聚焦局部请求词', validate, signal });
      break;
    } catch (error) {
      if (!validationError || attempt > 0 || signal?.aborted) throw error;
      messages.push({ role: 'user', content: `上次返回无效：${validationError}。请只描述遮罩内的局部物体，重新输出 JSON。` });
    }
  }
  if (!prompt) throw new Error('AI 没有给出有效的局部请求词');
  return prompt;
}
