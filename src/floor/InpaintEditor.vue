<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import ModalMask from '@/components/ModalMask.vue';

const props = defineProps<{ open: boolean; src: string; busy?: boolean; generationError?: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'cancel'): void;
  (e: 'apply', value: { image: string; mask: string; width: number; height: number; strength: number; instruction: string }): void;
}>();
const imageEl = ref<HTMLImageElement | null>(null);
const maskEl = ref<HTMLCanvasElement | null>(null);
const instruction = ref('');
const strength = ref(0.55);
const brush = ref(35);
const painting = ref(false);
const hasMask = ref(false);
const error = ref('');

function ready(): void {
  const img = imageEl.value;
  const mask = maskEl.value;
  if (!img || !mask || !img.naturalWidth || !img.naturalHeight) return;
  mask.width = img.naturalWidth;
  mask.height = img.naturalHeight;
  hasMask.value = false;
  error.value = '';
}

watch(() => props.open, async value => {
  if (value) { await nextTick(); ready(); }
});

function point(event: PointerEvent): { x: number; y: number } | null {
  const canvas = maskEl.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return { x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height };
}

function stroke(event: PointerEvent): void {
  if (!painting.value) return;
  const canvas = maskEl.value;
  const pos = point(event);
  if (!canvas || !pos) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, brush.value * canvas.width / Math.max(1, canvas.getBoundingClientRect().width) / 2, 0, Math.PI * 2);
  ctx.fill();
  hasMask.value = true;
}
function start(event: PointerEvent): void {
  painting.value = true;
  maskEl.value?.setPointerCapture(event.pointerId);
  stroke(event);
}
function clear(): void {
  const canvas = maskEl.value;
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  hasMask.value = false;
}
function apply(): void {
  const img = imageEl.value;
  const mask = maskEl.value;
  if (!img || !mask || !hasMask.value || props.busy) return;
  try {
    const original = document.createElement('canvas');
    original.width = mask.width;
    original.height = mask.height;
    original.getContext('2d')!.drawImage(img, 0, 0, original.width, original.height);
    const binaryMask = document.createElement('canvas');
    binaryMask.width = mask.width;
    binaryMask.height = mask.height;
    const ctx = binaryMask.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, mask.width, mask.height);
    ctx.drawImage(mask, 0, 0);
    emit('apply', {
      image: original.toDataURL('image/png').split(',')[1],
      mask: binaryMask.toDataURL('image/png').split(',')[1],
      width: mask.width, height: mask.height, strength: strength.value,
      instruction: instruction.value.trim(),
    });
  } catch (cause) {
    error.value = `无法读取原图：${cause instanceof Error ? cause.message : String(cause)}`;
  }
}
</script>

<template>
  <ModalMask :open="open" top-layer @close="!busy && emit('close')">
    <div class="bbi-modal bbi-inpaint" role="dialog" aria-modal="true" aria-label="局部重绘">
      <header class="bbi-modal-head"><span class="bbi-modal-title">局部重绘</span><button type="button" class="bbi-icon-mini" :disabled="busy" @click="emit('close')">×</button></header>
      <p>在需要修改的位置涂抹。白色区域将被重新生成，其余区域尽量保持原图。</p>
      <div class="bbi-inpaint-canvas">
        <img ref="imageEl" :src="src" crossorigin="anonymous" alt="待重绘图片" @load="ready" />
        <canvas ref="maskEl" @pointerdown="start" @pointermove="stroke" @pointerup="painting = false" @pointercancel="painting = false" />
      </div>
      <label>画笔大小 <input v-model.number="brush" type="range" min="5" max="100" /></label>
      <label>重绘强度 {{ strength }} <input v-model.number="strength" type="range" min="0.1" max="1" step="0.05" /></label>
      <label>修改要求（可选）<textarea v-model="instruction" rows="2" placeholder="例如：竹子不要叶子，保留其他内容" /></label>
      <p v-if="error || generationError" class="bbi-inpaint-error">{{ error || generationError }}</p>
      <footer><button v-if="busy" type="button" @click="emit('cancel')">取消生成</button><button v-else type="button" @click="clear">清空涂抹</button><button type="button" :disabled="busy || !hasMask" @click="apply">{{ busy ? '正在重绘…' : '生成局部重绘图' }}</button></footer>
    </div>
  </ModalMask>
</template>

<style scoped>
.bbi-inpaint { width: min(92vw, 850px); max-height: 90vh; overflow: auto; padding: 18px; display: grid; gap: 12px; }
.bbi-inpaint-canvas { position: relative; width: fit-content; max-width: 100%; margin: auto; line-height: 0; }
.bbi-inpaint-canvas img { max-width: 100%; max-height: 55vh; }
.bbi-inpaint-canvas canvas { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .55; touch-action: none; cursor: crosshair; }
.bbi-inpaint label { display: flex; gap: 10px; align-items: center; }
.bbi-inpaint textarea { flex: 1; min-width: 0; }
.bbi-inpaint footer { display: flex; justify-content: flex-end; gap: 10px; }
.bbi-inpaint-error { color: #f88; }
</style>
