<template>
  <div class="relative h-32 w-2 overflow-hidden rounded-2xl">
    <canvas
      ref="canvas"
      class="block h-full w-full bg-primary-600 dark:bg-primary-800"
    />
  </div>
</template>

<script setup lang="ts">
import { toRef, useTemplateRef } from 'vue';
import {
  useCanvasRender,
  type RenderSize,
} from '../composables/use-canvas-render';

const props = withDefaults(
  defineProps<{
    getValue: () => number;
    maxLevel?: number;
    isIdle?: boolean;
  }>(),
  {
    maxLevel: 1.2,
    isIdle: false,
  },
);

const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

const isIdle = toRef(props, 'isIdle');

const styles = getComputedStyle(document.documentElement);
const scopeColor1 = styles.getPropertyValue('--color-green-500');
const scopeColor2 = styles.getPropertyValue('--color-orange-500');
const scopeOverthresholdColor = styles.getPropertyValue('--color-red-500');

function render(sctx: CanvasRenderingContext2D, size: RenderSize): void {
  const w = size.width;
  const h = size.height;
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
}

useCanvasRender(canvas, {
  label: 'vu',
  paused: isIdle,
  render,
});
</script>
