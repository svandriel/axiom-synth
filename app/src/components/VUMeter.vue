<template>
  <div class="relative h-32 w-2 overflow-hidden rounded-2xl">
    <canvas
      ref="canvas"
      class="block h-full w-full bg-primary-600 dark:bg-primary-800"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue';

const props = withDefaults(
  defineProps<{
    getValue: () => number;
    maxLevel?: number;
  }>(),
  {
    maxLevel: 1.2,
  },
);

let rafId: number | undefined = undefined;
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

const styles = getComputedStyle(document.documentElement);
const scopeColor1 = styles.getPropertyValue('--color-green-500');
const scopeColor2 = styles.getPropertyValue('--color-orange-500');
const scopeOverthresholdColor = styles.getPropertyValue('--color-red-500');

onMounted(() => {
  window.addEventListener('resize', onResize);
  const canvasValue = canvas.value;
  if (!canvasValue) {
    return;
  }
  const sctxt = canvasValue.getContext('2d');
  if (!sctxt) {
    return;
  }
  rafId = requestAnimationFrame(() => {
    render(canvasValue, sctxt);
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (rafId !== undefined) {
    cancelAnimationFrame(rafId);
  }
});

function onResize() {
  if (canvas.value) {
    fit(canvas.value);
  }
}

function fit(c: HTMLCanvasElement) {
  if (!c.parentNode) return { w: 0, h: 0, dpr: 1 };
  const r = (c.parentNode as HTMLElement).getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return { w: w, h: h, dpr: dpr };
}

function render(canvas: HTMLCanvasElement, sctx: CanvasRenderingContext2D) {
  const d = fit(canvas);
  const w = d.w;
  const h = d.h;
  sctx.clearRect(0, 0, w, h);

  const threshold = 1 / props.maxLevel;

  const grad = sctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, scopeOverthresholdColor);
  grad.addColorStop(1 - threshold, scopeOverthresholdColor);
  grad.addColorStop(1 - threshold, scopeColor2);
  grad.addColorStop(1, scopeColor1);

  const height = (props.getValue() / props.maxLevel) * h;

  sctx.fillStyle = grad;
  sctx.fillRect(0, h - height, w, height);

  rafId = requestAnimationFrame(() => {
    render(canvas, sctx);
  });
}
</script>
