<template>
  <Panel label="Scope">
    <div class="flex flex-row gap-4">
      <VUMeter :get-value="() => audioEngine.meterLevel" :is-idle="isIdle" />
      <div class="relative h-full w-full overflow-hidden rounded-2xl">
        <canvas
          ref="scope"
          class="block h-32 w-full bg-primary-600 dark:bg-primary-800"
        />
      </div>
    </div>
  </Panel>
</template>

<script setup lang="ts">
import type { AudioEngine } from '@axiom/audio-engine';
import { useTemplateRef } from 'vue';
import {
  useCanvasRender,
  type RenderSize,
} from '../composables/use-canvas-render';
import { useObservable } from '../composables/use-observable';
import Panel from './Panel.vue';
import VUMeter from './VUMeter.vue';

const { audioEngine } = defineProps<{ audioEngine: AudioEngine }>();

const scope = useTemplateRef<HTMLCanvasElement>('scope');

const styles = getComputedStyle(document.documentElement);

const scopeGridColor = styles.getPropertyValue('--color-accent-100');
const scopeColor1 = styles.getPropertyValue('--color-accent-300');
const scopeColor2 = styles.getPropertyValue('--color-accent-500');
const scopeColor3 = styles.getPropertyValue('--color-accent-900');

const timeData = new Float32Array(2048);

const isIdle = useObservable(audioEngine.idle);

function render(sctx: CanvasRenderingContext2D, size: RenderSize): void {
  const w = size.width;
  const h = size.height;
  sctx.clearRect(0, 0, w, h);
  sctx.strokeStyle = scopeGridColor;
  sctx.globalAlpha = 0.2;
  sctx.lineWidth = 1;
  for (let g = 1; g < 8; g++) {
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

  audioEngine.getScopeData(timeData);
  const grad = sctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, scopeColor1);
  grad.addColorStop(0.5, scopeColor2);
  grad.addColorStop(1, scopeColor3);

  sctx.lineWidth = 2.2 * size.dpr;
  sctx.lineJoin = 'round';
  sctx.shadowBlur = 18 * size.dpr;
  sctx.shadowColor = 'rgba(255,45,149,1)';
  sctx.strokeStyle = grad;
  sctx.beginPath();

  let start = 0;
  for (let i = 1; i < timeData.length / 2; i++) {
    if (timeData[i - 1]! < 0 && timeData[i]! >= 0) {
      start = i;
      break;
    }
  }
  const n = Math.min(timeData.length - start, 1024);
  for (let i = 0; i < n; i++) {
    const v = timeData[start + i]! * 1.6;
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
}

useCanvasRender(scope, {
  label: 'scope',
  paused: isIdle,
  render,
});
</script>
