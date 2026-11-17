import type { ComfyImageResult } from '@/backends/comfyui';

export interface FocusRect { x: number; y: number; width: number; height: number }
export interface FocusedComposite {
  original: string;
  alphaMask: string;
  sourceWidth: number;
  sourceHeight: number;
  rect: FocusRect;
  requestWidth: number;
  requestHeight: number;
}

/** 自动选区：涂抹外留出上下文，并把极细长的区域扩展到适合模型的画幅。 */
export function focusedRect(
  bounds: FocusRect,
  imageWidth: number,
  imageHeight: number,
  manual = false,
): FocusRect {
  if (imageWidth < 1 || imageHeight < 1 || bounds.width < 1 || bounds.height < 1) throw new Error('聚焦区域无效');
  const margin = manual
    ? Math.max(32, Math.round(Math.max(bounds.width, bounds.height) * 0.15))
    : Math.max(48, Math.round(Math.max(bounds.width, bounds.height) * 0.35));
  let x0 = Math.max(0, Math.floor(bounds.x - margin));
  let y0 = Math.max(0, Math.floor(bounds.y - margin));
  let x1 = Math.min(imageWidth, Math.ceil(bounds.x + bounds.width + margin));
  let y1 = Math.min(imageHeight, Math.ceil(bounds.y + bounds.height + margin));
  const width = x1 - x0;
  const height = y1 - y0;
  // 聚焦太窄时扩大短边以保留肢体和周围环境，不拉伸原图。
  const wantedWidth = Math.min(imageWidth, Math.ceil(height * 0.6));
  const wantedHeight = Math.min(imageHeight, Math.ceil(width * 0.6));
  if (width < wantedWidth) {
    x0 = Math.max(0, Math.min(imageWidth - wantedWidth, Math.floor((x0 + x1 - wantedWidth) / 2)));
    x1 = x0 + wantedWidth;
  }
  if (height < wantedHeight) {
    y0 = Math.max(0, Math.min(imageHeight - wantedHeight, Math.floor((y0 + y1 - wantedHeight) / 2)));
    y1 = y0 + wantedHeight;
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** NovelAI 聚焦重绘约一百万像素；按原比例缩放至 64 的倍数。 */
export function focusedResolution(rect: FocusRect): { width: number; height: number } {
  const scale = Math.sqrt(1_048_576 / (rect.width * rect.height));
  let width = Math.max(64, Math.round(rect.width * scale / 64) * 64);
  let height = Math.max(64, Math.round(rect.height * scale / 64) * 64);
  while (width * height > 1_048_576) {
    if (width >= height && width > 64) width -= 64;
    else if (height > 64) height -= 64;
    else break;
  }
  return { width, height };
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const value = document.createElement('canvas');
  value.width = width;
  value.height = height;
  return value;
}

async function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取局部重绘图片'));
    image.src = src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
  });
}

/** 对原图裁切、放大，生成传给 NovelAI infill 的原图与黑白遮罩。 */
export function prepareFocusedInput(
  original: HTMLCanvasElement,
  alphaMask: HTMLCanvasElement,
  rect: FocusRect,
): { image: string; mask: string; width: number; height: number; composite: FocusedComposite } {
  const { width, height } = focusedResolution(rect);
  const crop = canvas(width, height);
  const imageContext = crop.getContext('2d')!;
  imageContext.imageSmoothingQuality = 'high';
  imageContext.drawImage(original, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
  const mask = canvas(width, height);
  const maskContext = mask.getContext('2d')!;
  maskContext.fillStyle = '#000';
  maskContext.fillRect(0, 0, width, height);
  maskContext.imageSmoothingEnabled = false;
  maskContext.drawImage(alphaMask, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
  return {
    image: crop.toDataURL('image/png').split(',')[1],
    mask: mask.toDataURL('image/png').split(',')[1],
    width, height,
    composite: {
      original: original.toDataURL('image/png').split(',')[1],
      alphaMask: alphaMask.toDataURL('image/png').split(',')[1],
      sourceWidth: original.width, sourceHeight: original.height,
      rect, requestWidth: width, requestHeight: height,
    },
  };
}

/** 将聚焦结果缩回原图，仅以涂抹 alpha 混合，未涂区域逐像素沿用原图。 */
export async function compositeFocusedResult(
  generated: ComfyImageResult,
  focus: FocusedComposite,
): Promise<ComfyImageResult> {
  const [original, result, alpha] = await Promise.all([
    load(focus.original), load(generated.url), load(focus.alphaMask),
  ]);
  if (result.naturalWidth !== focus.requestWidth || result.naturalHeight !== focus.requestHeight) {
    throw new Error('NovelAI 返回的聚焦图片尺寸与请求不一致，未覆盖原图');
  }
  const patch = canvas(focus.rect.width, focus.rect.height);
  const patchContext = patch.getContext('2d')!;
  patchContext.imageSmoothingQuality = 'high';
  patchContext.drawImage(result, 0, 0, patch.width, patch.height);
  patchContext.globalCompositeOperation = 'destination-in';
  // 只在遮罩边缘做轻微过渡，避免矩形裁切缝；不把聚焦区域外的颜色带进来。
  patchContext.filter = 'blur(1.5px)';
  patchContext.drawImage(alpha, focus.rect.x, focus.rect.y, focus.rect.width, focus.rect.height,
    0, 0, patch.width, patch.height);
  const full = canvas(focus.sourceWidth, focus.sourceHeight);
  const fullContext = full.getContext('2d')!;
  fullContext.drawImage(original, 0, 0);
  fullContext.drawImage(patch, focus.rect.x, focus.rect.y);
  return { url: full.toDataURL('image/png'), filename: `nai-focused-${Date.now()}.png`, format: 'png', revoke() {} };
}
