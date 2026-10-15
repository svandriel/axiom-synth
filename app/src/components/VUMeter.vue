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

let fillGradient: CanvasGradient | null = null;

const styles = getComputedStyle(document.documentElement);
const scopeColor1 = styles.getPropertyValue('--color-green-500');
const scopeColor2 = styles.getPropertyValue('--color-orange-500');
const scopeOverthresholdColor = styles.getPropertyValue('--color-red-500');

function prepare(sctx: CanvasRenderingContext2D, size: RenderSize): void {
  const threshold = 1 / props.maxLevel;
  fillGradient = sctx.createLinearGradient(0, 0, 0, size.height);
  fillGradient.addColorStop(0, scopeOverthresholdColor);
  fillGradient.addColorStop(1 - threshold, scopeOverthresholdColor);
  fillGradient.addColorStop(1 - threshold, scopeColor2);
  fillGradient.addColorStop(1, scopeColor1);
}

function render(sctx: CanvasRenderingContext2D, size: RenderSize): void {
  const w = size.width;
  const h = size.height;
  sctx.clearRect(0, 0, w, h);

  const height = (props.getValue() / props.maxLevel) * h;

  sctx.fillStyle = fillGradient ?? scopeColor1;
  sctx.fillRect(0, h - height, w, height);
}

useCanvasRender(canvas, {
  label: 'vu',
  paused: isIdle,
  prepare,
  render,
});
</script>
