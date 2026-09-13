<template>
  <Panel label="Scope">
    <div class="relative mt-3 h-32 overflow-hidden rounded-2xl">
      <canvas
        ref="scope"
        class="block h-full w-full bg-primary-600 dark:bg-primary-800"
      />
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import { useAudioEngine } from '../composables/use-audio-context';
import Panel from './Panel.vue';

const scope = useTemplateRef<HTMLCanvasElement>('scope');

const engine = useAudioEngine();

const styles = getComputedStyle(document.documentElement);

const scopeGridColor = styles.getPropertyValue('--color-accent-100');
const scopeColor1 = styles.getPropertyValue('--color-accent-300');
const scopeColor2 = styles.getPropertyValue('--color-accent-500');
const scopeColor3 = styles.getPropertyValue('--color-accent-900');

let rafId: number | undefined = undefined;
var timeData = new Float32Array(2048);

onMounted(() => {
  window.addEventListener('resize', onResize);
  if (scope.value) {
    const elem = scope.value;
    fit(elem);
    const sctxt = scope.value.getContext('2d');
    if (!sctxt) return;

    rafId = requestAnimationFrame(() => {
      render(elem, sctxt);
    });
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = undefined;
  }
});

function onResize() {
  if (scope.value) {
    fit(scope.value);
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

function render(scope: HTMLCanvasElement, sctx: CanvasRenderingContext2D) {
  const d = fit(scope);
  const w = d.w;
  const h = d.h;
  // Set background color
  sctx.clearRect(0, 0, w, h);
  sctx.strokeStyle = scopeGridColor;
  sctx.globalAlpha = 0.2;
  sctx.lineWidth = 1;
  for (var g = 1; g < 8; g++) {
    sctx.beginPath();
    sctx.moveTo((w * g) / 8, 0);
    sctx.lineTo((w * g) / 8, h);
    sctx.stroke();
  }
  sctx.beginPath();
  sctx.moveTo(0, h / 2);
  sctx.lineTo(w, h / 2);
  sctx.stroke();

  sctx.globalAlpha = 1;

  engine.value.getScopeData(timeData);
  const grad = sctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, scopeColor1);
  grad.addColorStop(0.5, scopeColor2);
  grad.addColorStop(1, scopeColor3);
  sctx.lineWidth = 2.2 * d.dpr;
  sctx.lineJoin = 'round';
  sctx.shadowBlur = 18 * d.dpr;
  sctx.shadowColor = 'rgba(255,45,149,1)';
  sctx.strokeStyle = grad;
  sctx.beginPath();

  // Find index of zero crossing
  let start = 0;
  for (let i = 1; i < timeData.length / 2; i++) {
    if (timeData[i - 1]! < 0 && timeData[i]! >= 0) {
      start = i;
      break;
    }
  }
  const n = Math.min(timeData.length - start, 1024);
  for (let i = 0; i < n; i++) {
    var v = timeData[start + i]! * 1.6;
    const x = (i / (n - 1)) * w;
    const y = h / 2 - (v * h) / 2;
    if (i === 0) {
      sctx.moveTo(x, y);
    } else {
      sctx.lineTo(x, y);
    }
  }
  sctx.stroke();
  sctx.shadowBlur = 0;

  rafId = requestAnimationFrame(() => {
    render(scope, sctx);
  });
}
</script>
