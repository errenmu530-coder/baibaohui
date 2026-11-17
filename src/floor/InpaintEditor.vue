<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import ModalMask from '@/components/ModalMask.vue';
import { focusedRect, prepareFocusedInput, type FocusRect, type FocusedComposite } from '@/floor/focusedInpaint';

const props = defineProps<{ open: boolean; src: string; characters: string[]; busy?: boolean; generationError?: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'cancel'): void;
  (e: 'apply', value: { image: string; mask: string; width: number; height: number; strength: number; instruction: string; focus: FocusedComposite; targetCharacter?: string }): void;
}>();
const imageEl = ref<HTMLImageElement | null>(null);
const maskEl = ref<HTMLCanvasElement | null>(null);
const instruction = ref('');
const strength = ref(0.75);
const brush = ref(35);
const mode = ref<'brush' | 'focus'>('brush');
const painting = ref(false);
const hasMask = ref(false);
const focusBox = ref<FocusRect | null>(null);
const startPoint = ref<{ x: number; y: number } | null>(null);
const lastPoint = ref<{ x: number; y: number } | null>(null);
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
  ctx.lineWidth = brush.value * canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (lastPoint.value) { ctx.moveTo(lastPoint.value.x, lastPoint.value.y); ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
  else { ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
  lastPoint.value = pos;
  hasMask.value = true;
}
function start(event: PointerEvent): void {
  if (props.busy) return;
  painting.value = true;
  startPoint.value = point(event);
  lastPoint.value = null;
  maskEl.value?.setPointerCapture(event.pointerId);
  stroke(event);
}
function stop(): void { painting.value = false; lastPoint.value = null; }
function clear(): void {
  const canvas = maskEl.value;
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  hasMask.value = false;
  focusBox.value = null;
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
      ctx.fillStyle = '#fff';
      ctx.fillRect(focusBox.value.x, focusBox.value.y, focusBox.value.width, focusBox.value.height);
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
    const selected = focusBox.value && focusBox.value.width >= 2 && focusBox.value.height >= 2
      ? focusBox.value : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    const focus = focusedRect(selected, mask.width, mask.height, !!focusBox.value);
    if (focusBox.value && (x0 < focusBox.value.x || y0 < focusBox.value.y ||
      x1 > focusBox.value.x + focusBox.value.width || y1 > focusBox.value.y + focusBox.value.height)) {
      error.value = '涂抹超出了聚焦框，请清空后重新选择或扩大聚焦框。'; return;
    }
    const prepared = prepareFocusedInput(original, alpha, focus);
    emit('apply', { ...prepared, strength: strength.value, instruction: instruction.value.trim(),
      targetCharacter: targetCharacter.value && targetCharacter.value !== '*' ? targetCharacter.value : undefined,
      focus: prepared.composite });
    error.value = '';
  } catch (cause) {
    error.value = `无法处理原图：${cause instanceof Error ? cause.message : String(cause)}`;
  }
}
</script>

<template>
  <ModalMask :open="open" top-layer @close="!busy && emit('close')">
    <div class="bbi-modal bbi-inpaint" role="dialog" aria-modal="true" aria-label="NovelAI 聚焦局部重绘">
      <header class="bbi-modal-head"><span class="bbi-modal-title">NovelAI 聚焦局部重绘</span><button type="button" class="bbi-icon-mini" :disabled="busy" @click="emit('close')">×</button></header>
      <p>涂抹要修改的区域；插件会放大该区域交给 NovelAI 重绘，再贴回原图。也可以先画聚焦框，再涂抹；只有框时会重绘整个框。</p>
      <div class="bbi-inpaint-modes"><button type="button" :disabled="busy" :aria-pressed="mode === 'brush'" @click="mode = 'brush'">涂抹</button><button type="button" :disabled="busy" :aria-pressed="mode === 'focus'" @click="mode = 'focus'">画聚焦框</button></div>
      <div class="bbi-inpaint-canvas">
        <img ref="imageEl" :src="src" crossorigin="anonymous" alt="待重绘图片" @load="ready" />
        <canvas ref="maskEl" @pointerdown="start" @pointermove="stroke" @pointerup="stop" @pointercancel="stop" />
        <div v-if="focusBox && focusBox.width >= 2 && focusBox.height >= 2" class="bbi-inpaint-focus" :style="{ left: `${focusBox.x / (maskEl?.width || 1) * 100}%`, top: `${focusBox.y / (maskEl?.height || 1) * 100}%`, width: `${focusBox.width / (maskEl?.width || 1) * 100}%`, height: `${focusBox.height / (maskEl?.height || 1) * 100}%` }" />
      </div>
      <label>画笔大小 <input v-model.number="brush" type="range" min="5" max="100" :disabled="busy" /></label>
      <label>重绘强度 {{ strength }} <input v-model.number="strength" type="range" min="0.1" max="1" step="0.05" :disabled="busy" /></label>
      <label v-if="characters.length > 1">修改哪个角色的提示词 <select v-model="targetCharacter" :disabled="busy"><option value="">请选择</option><option v-for="name in characters" :key="name" :value="name">{{ name }}</option><option value="*">全部角色／画面</option></select></label>
      <label>局部修改要求 <textarea v-model="instruction" rows="2" :disabled="busy" placeholder="例如：给苏灿灿的双脚穿上软布靴，只修改脚和鞋" /></label>
      <p v-if="error || generationError" class="bbi-inpaint-error">{{ error || generationError }}</p>
      <footer><button v-if="busy" type="button" @click="emit('cancel')">取消生成</button><button v-else type="button" @click="clear">清空涂抹与聚焦框</button><button type="button" :disabled="busy || (!hasMask && !focusBox)" @click="apply">{{ busy ? '正在重绘…' : '生成局部重绘图' }}</button></footer>
    </div>
  </ModalMask>
</template>

<style scoped>
.bbi-inpaint { width: min(92vw, 850px); max-height: 90vh; overflow: auto; padding: 18px; display: grid; gap: 12px; }
.bbi-inpaint-canvas { position: relative; width: fit-content; max-width: 100%; margin: auto; line-height: 0; }
.bbi-inpaint-canvas img { max-width: 100%; max-height: 55vh; }
.bbi-inpaint-canvas canvas { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .55; touch-action: none; cursor: crosshair; }
.bbi-inpaint-focus { position: absolute; border: 2px dashed #00b7ff; box-shadow: 0 0 0 1px #000; pointer-events: none; }
.bbi-inpaint-modes { display: flex; gap: 8px; }
.bbi-inpaint-modes button[aria-pressed="true"] { background: #0873bd; color: white; }
.bbi-inpaint label { display: flex; gap: 10px; align-items: center; }
.bbi-inpaint textarea { flex: 1; min-width: 0; }
.bbi-inpaint footer { display: flex; justify-content: flex-end; gap: 10px; }
.bbi-inpaint-error { color: #f88; }
</style>
