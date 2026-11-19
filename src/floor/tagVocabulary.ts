import { activeNaiPlan, isOfficialNaiEndpoint, settings } from '@/state/settings';

export interface TagCandidate {
  tag: string;
  zh: string;
  category: string;
  source: '本地分类' | 'NovelAI' | 'Danbooru';
  count?: number;
  confidence?: number;
}

// 自行整理的常用入口词，只用于分类与中文检索；完整候选由两家服务实时提供。
const GROUPS: Record<string, string> = {
  人物: '1girl:一个女孩|1boy:一个男孩|2girls:两个女孩|2boys:两个男孩|solo:单人|multiple girls:多个女孩|multiple boys:多个男孩',
  头发: 'long hair:长发|short hair:短发|ponytail:马尾|high ponytail:高马尾|braid:辫子|twintails:双马尾|bangs:刘海|black hair:黑发|white hair:白发|blonde hair:金发|brown hair:棕发|grey hair:灰发|hair ornament:发饰',
  眼睛表情: 'blue eyes:蓝眼睛|green eyes:绿眼睛|brown eyes:棕眼睛|red eyes:红眼睛|looking at viewer:看向镜头|looking at another:看向另一个人|looking down:低头看|smile:微笑|grin:咧嘴笑|blush:脸红|serious:严肃|crying:哭泣|expressionless:面无表情',
  服装: 'dress:连衣裙|robe:长袍|shirt:衬衫|skirt:裙子|cloak:斗篷|cape:披肩|school uniform:校服|armor:铠甲|boots:靴子|ankle boots:短靴|sandals:凉鞋|barefoot:赤脚|gloves:手套|bandages:绷带|belt:腰带',
  姿势动作: 'standing:站立|sitting:坐着|lying:躺着|kneeling:跪着|walking:行走|running:奔跑|holding:拿着|holding hands:牵手|hug:拥抱|sword:剑|holding sword:持剑|looking back:回头看',
  场景: 'outdoors:室外|indoors:室内|forest:森林|lake:湖|river:河流|beach:海滩|mountain:山|classroom:教室|bedroom:卧室|tree:树|bamboo:竹子|flowers:花朵|sky:天空',
  光照构图: 'sunlight:阳光|sunset:日落|moonlight:月光|dappled sunlight:斑驳阳光|backlighting:逆光|cinematic lighting:电影光照|close-up:特写|portrait:肖像|full body:全身|upper body:上半身|from above:俯视|from below:仰视|depth of field:景深',
};

export const TAG_CATEGORIES = Object.keys(GROUPS);
export const LOCAL_TAGS: TagCandidate[] = Object.entries(GROUPS).flatMap(([category, items]) =>
  items.split('|').map(item => {
    const [tag, zh] = item.split(':');
    return { tag, zh, category, source: '本地分类' as const };
  }),
);
const byTag = new Map(LOCAL_TAGS.map(item => [item.tag.toLowerCase(), item]));

export function tagTranslation(tag: string): string {
  return byTag.get(tag.trim().toLowerCase().replaceAll('_', ' '))?.zh ?? '';
}

export function localTagSearch(query: string, category = ''): TagCandidate[] {
  const needle = query.trim().toLowerCase();
  return LOCAL_TAGS.filter(item =>
    (!category || item.category === category) &&
    (!needle || item.tag.includes(needle) || item.zh.includes(needle)),
  );
}

function normalizeRemoteTag(value: unknown): string {
  return typeof value === 'string' ? value.trim().replaceAll('_', ' ') : '';
}

export async function searchNovelAiTags(query: string, signal?: AbortSignal): Promise<TagCandidate[]> {
  const endpoint = settings.nai.endpoints.find(item => isOfficialNaiEndpoint(item.id));
  if (!endpoint?.key.trim()) {
    throw new Error('NovelAI 官方候选词需要在渠道中配置官方接入点与密钥');
  }
  const url = new URL('/ai/generate-image/suggest-tags', endpoint.url);
  url.searchParams.set('model', activeNaiPlan().model);
  url.searchParams.set('prompt', query);
  url.searchParams.set('lang', 'en');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${endpoint.key.trim()}` }, signal });
  if (!response.ok) throw new Error(`NovelAI 候选词请求失败：HTTP ${response.status}`);
  const data = await response.json() as { tags?: Array<{ tag?: unknown; count?: unknown; confidence?: unknown }> };
  return (Array.isArray(data.tags) ? data.tags : []).slice(0, 30).flatMap(item => {
    const tag = normalizeRemoteTag(item.tag);
    return tag ? [{
      tag, zh: tagTranslation(tag), category: byTag.get(tag.toLowerCase())?.category ?? '',
      source: 'NovelAI' as const,
      count: typeof item.count === 'number' ? item.count : undefined,
      confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
    }] : [];
  });
}

export async function searchDanbooruTags(query: string, signal?: AbortSignal): Promise<TagCandidate[]> {
  const url = new URL('https://danbooru.donmai.us/tags.json');
  url.searchParams.set('search[name_matches]', `*${query.trim().replaceAll(' ', '_')}*`);
  url.searchParams.set('search[order]', 'count');
  url.searchParams.set('limit', '50');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Danbooru 候选词请求失败：HTTP ${response.status}`);
  const data = await response.json() as Array<{ name?: unknown; post_count?: unknown; category?: unknown }>;
  // 通配搜索会返回大量没有作品的冷门/拼接词；只给用户看实际被使用的候选。
  return (Array.isArray(data) ? data : []).filter(item => typeof item.post_count === 'number' && item.post_count > 0).slice(0, 30).flatMap(item => {
    const tag = normalizeRemoteTag(item.name);
    return tag ? [{
      tag, zh: tagTranslation(tag), category: byTag.get(tag.toLowerCase())?.category ?? '',
      source: 'Danbooru' as const,
      count: typeof item.post_count === 'number' ? item.post_count : undefined,
    }] : [];
  });
}
