<template>
  <div
    class="knob-block flex flex-col items-center gap-2"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="release"
    @pointercancel="release"
    @dblclick="resetToDefault"
  >
    <div
      class="knob dark:shadow-out-sm-dark relative h-18 w-18 cursor-ns-resize rounded-full shadow-out-sm duration-200 ease-in-out outline-none"
      :class="{ active }"
      role="slider"
      tabindex="0"
      :aria-label="label"
      :aria-valuemin="from"
      :aria-valuemax="to"
      :aria-valuenow="value"
      ref="knob"
      :style="{
        '--angle': `${angle - 135}deg`,
        '--sweep': `${angle}deg`,
      }"
    >
      <div class="arc absolute"></div>
      <div class="pointer absolute"></div>
    </div>
    <div class="knob-label text-primary-500 dark:text-primary-400">
      {{ label }}
    </div>
    <div class="knob-value p-1 font-mono shadow-in-sm dark:shadow-in-sm-dark">
      {{ displayValue }}
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';

const knob = useTemplateRef<HTMLDivElement>('knob');
const props = withDefaults(
  defineProps<{
    from?: number;
    to?: number;
    default?: number;
    label: string;
    tickSize?: number;
    format?: (value: number) => string;
    size?: 'md' | 'lg';
  }>(),
  {
    from: 0,
    to: 1,
    default: 0,
    format: (value: number) => `${value}`,
    size: 'lg',
  },
);
const displayValue = computed(() => {
  return props.format(value.value);
});
const value = defineModel<number>({ required: true });

// Range: 0..1
const normalizedValue = computed({
  get: () => toNormalized(value.value),
  set(normalized: number) {
    value.value = fromNormalized(normalized);
  },
});

function toNormalized(value: number) {
  return (value - props.from) / (props.to - props.from);
}

function fromNormalized(normalized: number) {
  return normalized * (props.to - props.from) + props.from;
}

const angle = computed(() => normalizedValue.value * 270);

const active = ref(false);
let startY = 0;
let startV = 0;
let dragging = false;
function onPointerDown(e: PointerEvent) {
  dragging = true;
  startY = e.clientY;
  startV = normalizedValue.value;
  active.value = true;
  knob.value?.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  var dy = startY - e.clientY;
  set(startV + dy / (e.shiftKey ? 600 : 180));
}

function set(newNormalizedValue: number) {
  const newValue = fromNormalized(clamp(newNormalizedValue));
  let newValueTickApplied = newValue;
  if (props.tickSize) {
    const ticks = Math.round(newValueTickApplied / props.tickSize);
    newValueTickApplied = ticks * props.tickSize;
  }
  value.value = newValueTickApplied;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function release() {
  dragging = false;
  active.value = false;
}

function resetToDefault() {
  set(toNormalized(props.default));
}
</script>

<style scoped>
@reference 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));

.knob {
  background: linear-gradient(
    145deg,
    var(--color-default),
    var(--color-default-light)
  ); /* #d3d9e2 */
  transition-property: box-shadow, transform;
}

@variant dark {
  .knob {
    background: linear-gradient(145deg, var(--color-default-dark), #d3d9e2);
  }
}

.knob:focus-visible {
  box-shadow:
    var(--shadow-out-sm),
    0 0 0 3px var(--color-accent-500);
}

.knob.active {
  box-shadow: var(--shadow-in-sm);
  transform: scale(0.97);
}

.knob::before {
  content: '';
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: linear-gradient(145deg, #d6dce5, var(--color-default));
  box-shadow:
    inset 2px 2px 4px var(--color-primary-400),
    inset -2px -2px 4px var(--color-primary-100);
}

.knob .pointer {
  left: 50%;
  top: 50%;
  width: 4px;
  height: 22px;
  margin-left: -2px;
  transform-origin: 50% 100%;
  transform: translateY(-100%) rotate(var(--angle)) translateY(-8px);
  border-radius: 2px;
  background: var(--color-accent-500);
  box-shadow: 0 0 3px
    color-mix(in srgb, var(--color-accent-500) 60%, transparent);
}

.knob .arc {
  inset: -6px;
  border-radius: 50%;
  background: conic-gradient(
    from 225deg,
    var(--color-accent-300) 0deg,
    var(--color-accent-700) var(--sweep, 0deg),
    transparent var(--sweep, 0deg)
  );
  mask: radial-gradient(
    farthest-side,
    transparent calc(100% - 4px),
    #000 calc(100% - 3px)
  );
  opacity: 0.9;
  pointer-events: none;
}

.knob-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.knob-value {
  font-size: 12px;
  min-width: 58px;
  text-align: center;
  border-radius: 8px;
  /* box-shadow: var(--in-sm); */
}
</style>
