<template>
  <Panel label="Shaper">
    <template #top-right>
      <Toggle v-model="type" :values="types" />
    </template>
    <div class="mt-4 grid grid-cols-4 gap-4">
      <Knob
        class="col-start-1 row-start-1"
        v-model="distortionAmount"
        :from="0"
        :to="100"
        label="Distortion"
        size="md"
        :format="v => `${v.toFixed(1)}%`"
      />
      <Knob
        class="col-start-2 row-start-1"
        v-model="drive"
        :from="0"
        :to="4"
        label="Drive"
        size="md"
        :format="d => dbDisplay(d + 1)"
      />
      <div
        class="relative col-span-2 col-start-3 row-start-1 overflow-hidden rounded-2xl bg-black"
      >
        <canvas
          ref="shaperGraph"
          class="block h-full w-full bg-primary-600 dark:bg-primary-800"
        />
      </div>
    </div>
  </Panel>
</template>
<script setup lang="ts">
import { type WaveshaperType } from '../engine/waveshaper.ts';
import { dbDisplay } from '../utils/db-display.ts';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';
import { useTemplateRef, watchEffect } from 'vue';

const curve = defineProps<{ curve: Float32Array }>();
const distortionAmount = defineModel<number>('distortionAmount', {
  required: true,
});
const drive = defineModel<number>('drive', { required: true });
const type = defineModel<WaveshaperType>('type', { required: true });

const styles = getComputedStyle(document.documentElement);
const scopeColor1 = styles.getPropertyValue('--color-accent-300');
const scopeColor2 = styles.getPropertyValue('--color-accent-500');
const scopeColor3 = styles.getPropertyValue('--color-accent-900');

const shaperGraph = useTemplateRef('shaperGraph');

watchEffect(render);

function fit(canvas: HTMLCanvasElement) {
  if (!canvas.parentNode) return { w: 0, h: 0, dpr: 1 };
  const r = (canvas.parentNode as HTMLElement).getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w: w, h: h, dpr: dpr };
}

function render() {
  const canvas = shaperGraph.value;
  if (!canvas) {
    return;
  }
  const g = canvas.getContext('2d');
  if (!g) {
    return;
  }
  const { w, h, dpr } = fit(canvas);
  g.clearRect(0, 0, w, h);
  grid(g, w, h);
  drawCurve(g, w, h, dpr);
}

function drawCurve(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
) {
  const samples = curve.curve;
  const n = samples.length;
  if (n < 2) {
    return;
  }
  const px = (i: number) => 4 + (i / (n - 1)) * (w - 8);
  const py = (v: number) => h - 6 - ((v + 1) / 2) * (h - 12);

  const pointCount = 100;
  const count = Math.min(pointCount, n);
  const step = count > 1 ? (n - 1) / (count - 1) : 0;
  const xp: number[] = [];
  const yp: number[] = [];
  for (let i = 0; i < count; ++i) {
    const idx = Math.round(i * step);
    xp.push(px(idx));
    yp.push(py(samples[idx]!));
  }

  const zeroY = py(0);
  g.globalAlpha = 0.6;
  g.beginPath();
  g.moveTo(xp[0]!, yp[0]!);
  for (let k = 1; k < xp.length; ++k) {
    g.lineTo(xp[k]!, yp[k]!);
  }
  g.lineTo(xp[xp.length - 1]!, zeroY);
  g.lineTo(xp[0]!, zeroY);
  g.closePath();
  const fill = g.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, scopeColor2);
  fill.addColorStop(1, `rgba(0,0,0, 0.1`);
  g.fillStyle = fill;
  g.fill();

  g.globalAlpha = 0.25;
  g.strokeStyle = scopeColor2;
  g.lineWidth = 1 * dpr;
  g.beginPath();
  g.moveTo(xp[0]!, zeroY);
  g.lineTo(xp[xp.length - 1]!, zeroY);
  g.stroke();

  g.globalAlpha = 1;
  const lineGradient = g.createLinearGradient(0, 0, 0, h);
  lineGradient.addColorStop(0, scopeColor1);
  lineGradient.addColorStop(0.5, scopeColor2);
  lineGradient.addColorStop(1, scopeColor3);
  g.strokeStyle = lineGradient;
  g.lineWidth = 2.2 * dpr;
  g.lineJoin = 'round';
  g.shadowBlur = 18 * dpr;
  g.shadowColor = 'rgba(255,45,149,1)';
  g.beginPath();
  g.moveTo(xp[0]!, yp[0]!);
  for (let k = 1; k < xp.length; ++k) {
    g.lineTo(xp[k]!, yp[k]!);
  }
  g.stroke();
  g.shadowBlur = 0;
}

function grid(g: CanvasRenderingContext2D, w: number, h: number) {
  g.strokeStyle = 'rgba(125,255,176,.12)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < 6; i++) {
    g.moveTo((w * i) / 6, 0);
    g.lineTo((w * i) / 6, h);
  }
  for (let i = 1; i < 4; i++) {
    g.moveTo(0, (h * i) / 4);
    g.lineTo(w, (h * i) / 4);
  }
  g.stroke();
}

const types: Array<{ id: WaveshaperType; label: string }> = [
  {
    id: 'soft-algebraic',
    label: 'Soft',
  },
  {
    id: 'atan',
    label: 'Atan',
  },
  {
    id: 'asymmetric-tube',
    label: 'Tube',
  },
  {
    id: 'hard-clipper',
    label: 'Clip',
  },
  {
    id: 'sine-shaper',
    label: 'Sine',
  },
  {
    id: 'chebyshev',
    label: 'Cheb',
  },
];
</script>
