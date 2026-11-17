<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import ModalMask from '@/components/ModalMask.vue';
import type { FocusRect } from '@/floor/inpaintSelection';
import { visibleInpaintSteps, type InpaintPoint, type InpaintStep } from '@/floor/inpaintSteps';
import { beginPinch, movePinch, type PinchStart, type ScreenPoint } from '@/floor/inpaintViewport';

const props = defineProps<{ open: boolean; src: string; characters: string[]; busy?: boolean; generationError?: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'cancel'): void;
  (e: 'apply', value: { image: string; mask: string; width: number; height: number; strength: number; instruction: string; selection: FocusRect; targetCharacter?: string }): void;
}>();
const imageEl = ref<HTMLImageElement | null>(null);
const maskEl = ref<HTMLCanvasElement | null>(null);
const viewportEl = ref<HTMLDivElement | null>(null);
const instruction = ref('');
const strength = ref(0.95);
const brush = ref(18);
const mode = ref<'brush' | 'focus'>('focus');
const painting = ref(false);
const hasMask = ref(false);
const focusBox = ref<FocusRect | null>(null);
const startPoint = ref<{ x: number; y: number } | null>(null);
const lastPoint = ref<{ x: number; y: number } | null>(null);
const steps = ref<InpaintStep[]>([]);
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const transformStyle = computed(() => ({ transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})` }));
const pointers = new Map<number, ScreenPoint>();
let pinchStart: PinchStart | null = null;
let multiTouch = false;
let currentStroke: InpaintPoint[] = [];
let currentWidth = 0;
const targetCharacter = ref('');
const error = ref('');

function ready(): void {
  const img = imageEl.value;
  const mask = maskEl.value;
  if (!img || !mask || !img.naturalWidth || !img.naturalHeight) return;
  mask.width = img.naturalWidth;
  mask.height = img.naturalHeight;
  hasMask.value = false;
  focusBox.value = null;
  mode.value = 'focus';
  steps.value = [];
  zoom.value = 1; panX.value = 0; panY.value = 0;
  pointers.clear(); pinchStart = null; multiTouch = false;
  error.value = '';
}
watch(() => props.open, async value => { if (value) { await nextTick(); ready(); } });

function point(event: PointerEvent): { x: number; y: number } | null {
  const canvas = maskEl.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height)),
  };
}
function stroke(event: PointerEvent): void {
  if (!painting.value) return;
  const canvas = maskEl.value;
  const pos = point(event);
  if (!canvas || !pos) return;
  if (mode.value === 'focus') {
    const start = startPoint.value!;
    focusBox.value = { x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y),
      width: Math.abs(pos.x - start.x), height: Math.abs(pos.y - start.y) };
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.strokeStyle = '#00b7ff';
  ctx.fillStyle = '#00b7ff';
  ctx.lineWidth = currentWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (focusBox.value) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(focusBox.value.x, focusBox.value.y, focusBox.value.width, focusBox.value.height);
    ctx.clip();
  }
  ctx.beginPath();
  if (lastPoint.value) { ctx.moveTo(lastPoint.value.x, lastPoint.value.y); ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
  else { ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
  if (focusBox.value) ctx.restore();
  lastPoint.value = pos;
  currentStroke.push(pos);
  hasMask.value = true;
}
function replaySteps(): void {
  const canvas = maskEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  focusBox.value = null;
  hasMask.value = false;
  for (const step of visibleInpaintSteps(steps.value)) {
    if (step.kind === 'focus') {
      focusBox.value = { ...step.rect };
      continue;
    }
    ctx.strokeStyle = '#00b7ff';
    ctx.fillStyle = '#00b7ff';
    ctx.lineWidth = step.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (focusBox.value) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(focusBox.value.x, focusBox.value.y, focusBox.value.width, focusBox.value.height);
      ctx.clip();
    }
    step.points.forEach((point, index) => {
      ctx.beginPath();
      if (index) {
        ctx.moveTo(step.points[index - 1].x, step.points[index - 1].y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      } else {
        ctx.arc(point.x, point.y, step.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (focusBox.value) ctx.restore();
    hasMask.value = true;
  }
}
function beginSingle(event: PointerEvent): void {
  if (props.busy) return;
  if (mode.value === 'focus') {
    const canvas = maskEl.value;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    hasMask.value = false;
    focusBox.value = null;
  } else if (focusBox.value) {
    const pos = point(event);
    const box = focusBox.value;
    if (!pos || pos.x < box.x || pos.x > box.x + box.width ||
      pos.y < box.y || pos.y > box.y + box.height) {
      error.value = '请在聚焦框内部涂抹；双指可移动或放大图片。';
      return;
    }
  }
  painting.value = true;
  startPoint.value = point(event);
  lastPoint.value = null;
  currentStroke = [];
  currentWidth = brush.value * (maskEl.value?.width || 1) / Math.max(1, maskEl.value?.getBoundingClientRect().width || 1);
  stroke(event);
}
function finishSingle(): void {
  if (!painting.value) return;
  painting.value = false;
  lastPoint.value = null;
  if (mode.value === 'focus' && focusBox.value && focusBox.value.width >= 2 && focusBox.value.height >= 2)
    steps.value.push({ kind: 'focus', rect: { ...focusBox.value } });
  else if (mode.value === 'brush' && currentStroke.length)
    steps.value.push({ kind: 'brush', points: [...currentStroke], width: currentWidth });
  else replaySteps();
  currentStroke = [];
}
function rollbackSingle(): void {
  if (!painting.value) return;
  painting.value = false;
  lastPoint.value = null;
  currentStroke = [];
  replaySteps();
}
function localTouches(): [ScreenPoint, ScreenPoint] | null {
  const rect = viewportEl.value?.getBoundingClientRect();
  if (!rect || pointers.size !== 2) return null;
  const [a, b] = [...pointers.values()];
  return [{ x: a.x - rect.left, y: a.y - rect.top }, { x: b.x - rect.left, y: b.y - rect.top }];
}
function resetPinch(): void {
  const pair = localTouches();
  pinchStart = pair ? beginPinch(pair[0], pair[1],
    { scale: zoom.value, x: panX.value, y: panY.value }) : null;
}
function pointerDown(event: PointerEvent): void {
  if (props.busy) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  maskEl.value?.setPointerCapture(event.pointerId);
  if (pointers.size === 1 && !multiTouch) beginSingle(event);
  else {
    // 第二根手指加入时撤销未完成的单指笔画，之后直到全部手指离开都不绘制。
    rollbackSingle();
    multiTouch = true;
    resetPinch();
  }
}
function pointerMove(event: PointerEvent): void {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (multiTouch) {
    const pair = localTouches();
    if (!pair) { pinchStart = null; return; }
    if (!pinchStart) resetPinch();
    else {
      const viewport = viewportEl.value;
      if (!viewport) return;
      const next = movePinch(pinchStart, pair[0], pair[1],
        { width: viewport.clientWidth, height: viewport.clientHeight });
      zoom.value = next.scale; panX.value = next.x; panY.value = next.y;
    }
    return;
  }
  stroke(event);
}
function pointerEnd(event: PointerEvent, cancelled = false): void {
  if (!pointers.has(event.pointerId)) return;
  if (!multiTouch && !cancelled) stroke(event);
  pointers.delete(event.pointerId);
  if (multiTouch) {
    resetPinch();
    if (!pointers.size) multiTouch = false;
  } else if (cancelled) rollbackSingle();
  else finishSingle();
}
function resetView(): void {
  zoom.value = 1; panX.value = 0; panY.value = 0;
}
function undo(): void {
  if (props.busy || painting.value || !steps.value.length) return;
  steps.value.pop();
  replaySteps();
  error.value = '';
}
function clear(): void {
  const canvas = maskEl.value;
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  hasMask.value = false;
  focusBox.value = null;
  steps.value = [];
  error.value = '';
}
function apply(): void {
  const img = imageEl.value;
  const mask = maskEl.value;
  if (!img || !mask || (!hasMask.value && !focusBox.value) || props.busy) return;
  if (!instruction.value.trim()) {
    error.value = '请描述遮罩内要改成什么，例如「给她穿上软布靴」。';
    return;
  }
  if (instruction.value.trim() && props.characters.length > 1 && !targetCharacter.value) {
    error.value = '请先选择本次要修改提示词的角色，或选择「全部角色」。';
    return;
  }
  try {
    const original = document.createElement('canvas');
    original.width = mask.width;
    original.height = mask.height;
    original.getContext('2d')!.drawImage(img, 0, 0, original.width, original.height);
    const alpha = document.createElement('canvas');
    alpha.width = mask.width;
    alpha.height = mask.height;
    const ctx = alpha.getContext('2d')!;
    ctx.drawImage(mask, 0, 0);
    if (focusBox.value && !hasMask.value) {
      if (focusBox.value.width < 8 || focusBox.value.height < 8) {
        error.value = '聚焦框太小，请按住图片拖出覆盖整个目标的矩形。'; return;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(focusBox.value.x, focusBox.value.y, focusBox.value.width, focusBox.value.height);
    }
    if (focusBox.value && (focusBox.value.width < 8 || focusBox.value.height < 8)) {
      error.value = '聚焦框太小，请重新画出覆盖目标的矩形。'; return;
    }
    const pixels = ctx.getImageData(0, 0, alpha.width, alpha.height);
    let x0 = alpha.width, y0 = alpha.height, x1 = 0, y1 = 0;
    for (let y = 0; y < alpha.height; y++) for (let x = 0; x < alpha.width; x++) {
      const at = (y * alpha.width + x) * 4;
      if (!pixels.data[at + 3]) continue;
      pixels.data[at] = pixels.data[at + 1] = pixels.data[at + 2] = 255;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
    }
    if (x1 <= x0 || y1 <= y0) { error.value = '请涂抹要重绘的区域，或画出聚焦框。'; return; }
    ctx.putImageData(pixels, 0, 0);
    const selection = focusBox.value ?? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    const naiMask = document.createElement('canvas');
    naiMask.width = original.width; naiMask.height = original.height;
    const naiContext = naiMask.getContext('2d')!;
    naiContext.fillStyle = '#000';
    naiContext.fillRect(0, 0, naiMask.width, naiMask.height);
    naiContext.drawImage(alpha, 0, 0);
    emit('apply', { image: original.toDataURL('image/png').split(',')[1],
      mask: naiMask.toDataURL('image/png').split(',')[1],
      width: original.width, height: original.height, selection,
      strength: strength.value, instruction: instruction.value.trim(),
      targetCharacter: targetCharacter.value && targetCharacter.value !== '*' ? targetCharacter.value : undefined,
    });
    error.value = '';
  } catch (cause) {
    error.value = `无法处理原图：${cause instanceof Error ? cause.message : String(cause)}`;
  }
}
</script>

<template>
  <ModalMask :open="open" top-layer @close="emit('close')">
    <div class="bbi-modal bbi-inpaint" role="dialog" aria-modal="true" aria-label="NovelAI 局部重绘">
      <header class="bbi-modal-head"><span class="bbi-modal-title">NovelAI 局部重绘</span><button type="button" class="bbi-icon-mini" :title="busy ? '关闭窗口，后台继续生成' : '关闭'" @click="emit('close')">×</button></header>
      <p class="bbi-inpaint-help">整张原图和遮罩交给 NovelAI；返回的整张图直接保存，不再裁切和贴回。</p>
      <p class="bbi-inpaint-help">画框后可切换到涂抹，只重绘框内刷到的位置；不涂抹则重绘整个框。双指缩放和移动，单指绘制。要改鞋时请缩小画笔，只覆盖鞋和脚，避免把周围地面涂进遮罩。</p>
      <div class="bbi-inpaint-modes"><button type="button" :disabled="busy" :aria-pressed="mode === 'brush'" @click="mode = 'brush'">涂抹</button><button type="button" :disabled="busy" :aria-pressed="mode === 'focus'" @click="mode = 'focus'">画聚焦框</button><span class="bbi-inpaint-current">当前：{{ mode === 'focus' ? '画聚焦框' : '涂抹' }}</span></div>
      <p v-if="focusBox && hasMask" class="bbi-inpaint-selection">保留聚焦框；只重绘框内蓝色涂抹区域</p>
      <p v-else-if="focusBox && focusBox.width >= 8 && focusBox.height >= 8" class="bbi-inpaint-selection">未涂抹时将重绘整个蓝色框</p>
      <p v-else-if="hasMask" class="bbi-inpaint-selection">只重绘蓝色笔迹覆盖的区域；圈出轮廓不会自动填充内部</p>
      <div ref="viewportEl" class="bbi-inpaint-viewport">
        <div class="bbi-inpaint-canvas" :style="transformStyle">
          <img ref="imageEl" :src="src" crossorigin="anonymous" alt="待重绘图片" @load="ready" />
          <canvas ref="maskEl" @pointerdown.prevent="pointerDown" @pointermove.prevent="pointerMove" @pointerup="pointerEnd($event)" @pointercancel="pointerEnd($event, true)" />
          <div v-if="focusBox && focusBox.width >= 2 && focusBox.height >= 2" class="bbi-inpaint-focus" :style="{ left: `${focusBox.x / (maskEl?.width || 1) * 100}%`, top: `${focusBox.y / (maskEl?.height || 1) * 100}%`, width: `${focusBox.width / (maskEl?.width || 1) * 100}%`, height: `${focusBox.height / (maskEl?.height || 1) * 100}%` }" />
        </div>
      </div>
      <div class="bbi-inpaint-zoom"><span>图片 {{ Math.round(zoom * 100) }}%</span><button type="button" :disabled="busy || zoom === 1" @click="resetView">还原大小</button><span>双指放大／移动</span></div>
      <label>画笔大小 <input v-model.number="brush" type="range" min="5" max="100" :disabled="busy" /></label>
      <label>重绘强度 {{ strength }} <input v-model.number="strength" type="range" min="0.1" max="1" step="0.05" :disabled="busy" /></label>
      <label v-if="characters.length > 1">修改哪个角色的提示词 <select v-model="targetCharacter" :disabled="busy"><option value="">请选择</option><option v-for="name in characters" :key="name" :value="name">{{ name }}</option><option value="*">全部角色／画面</option></select></label>
      <label>局部修改要求 <textarea v-model="instruction" rows="2" :disabled="busy" placeholder="例如：给苏灿灿的双脚穿上软布靴，只修改脚和鞋" /></label>
      <p v-if="error || generationError" class="bbi-inpaint-error">{{ error || generationError }}</p>
      <footer>
        <button v-if="busy" type="button" @click="emit('close')">关闭窗口，后台继续</button>
        <button v-if="busy" type="button" @click="emit('cancel')">取消生成</button>
        <template v-else>
          <button type="button" :disabled="!steps.length" @click="undo">撤回一步</button>
          <button type="button" :disabled="!steps.length" @click="clear">全部清空</button>
        </template>
        <button type="button" :disabled="busy || (!hasMask && !focusBox)" @click="apply">{{ busy ? '正在重绘…' : '生成局部重绘图' }}</button>
      </footer>
    </div>
  </ModalMask>
</template>

<style scoped>
.bbi-inpaint { width: min(92vw, 850px); max-height: 88vh; max-height: 88dvh; overflow: auto; padding: 18px; display: grid; gap: 10px; }
.bbi-inpaint-help { margin: 0; }
.bbi-inpaint-viewport { position: relative; width: fit-content; max-width: 100%; margin: auto; overflow: hidden; touch-action: none; line-height: 0; }
.bbi-inpaint-canvas { position: relative; width: fit-content; max-width: 100%; transform-origin: 0 0; line-height: 0; }
.bbi-inpaint-canvas img { display: block; max-width: 100%; max-height: 38vh; max-height: 38dvh; width: auto; height: auto; }
.bbi-inpaint-canvas canvas { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .55; touch-action: none; cursor: crosshair; }
.bbi-inpaint-focus { position: absolute; border: 2px dashed #00b7ff; box-shadow: 0 0 0 1px #000; pointer-events: none; }
.bbi-inpaint-modes { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.bbi-inpaint-modes button[aria-pressed="true"] { background: #0873bd; color: white; border-color: #0873bd; }
.bbi-inpaint-current { font-size: 12px; color: var(--bbi-ink-soft); }
.bbi-inpaint-zoom { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 12px; color: var(--bbi-ink-soft); }
.bbi-inpaint label { display: flex; gap: 10px; align-items: center; }
.bbi-inpaint textarea { flex: 1; min-width: 0; }
.bbi-inpaint footer { display: flex; justify-content: flex-end; gap: 10px; }
.bbi-inpaint-error { color: #f88; }
@media (max-width: 640px) {
  .bbi-inpaint { width: min(94vw, 520px); padding: 12px; gap: 8px; }
  .bbi-inpaint-canvas img { max-height: 35vh; max-height: 35dvh; }
  .bbi-inpaint label { flex-wrap: wrap; }
  .bbi-inpaint footer { flex-wrap: wrap; }
}
</style>
