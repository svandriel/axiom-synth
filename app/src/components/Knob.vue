<template>
  <div
    class="knob-block flex touch-none flex-col items-center gap-2"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="release"
    @pointercancel="release"
    @dblclick="resetToDefault"
    @lostpointercapture="release"
  >
    <div
      class="knob relative cursor-ns-resize rounded-full shadow-out-sm duration-200 ease-in-out outline-none dark:shadow-out-sm-dark"
      :class="{
        active,
        'h-18 w-18': size === 'lg',
        'h-12 w-12': size === 'md',
        'h-8 w-8': size === 'sm',
      }"
      role="slider"
      tabindex="0"
      :aria-label="label"
      :aria-valuemin="from"
      :aria-valuemax="to"
      :aria-valuenow="value"
      :data-size="size"
      ref="knob"
      :style="{
        '--angle': `${angle}deg`,
        '--sweep-start': `${sweepStart}deg`,
        '--sweep': `${sweep}deg`,
      }"
    >
      <div class="arc absolute rounded-full"></div>
      <div class="pointer absolute"></div>
    </div>
    <div
      class="knob-label mt-0 text-2xs tracking-wide text-primary-500 dark:text-primary-400"
    >
      <span v-if="!showValue && active">
        {{ format(value) }}
      </span>
      <span v-else class="uppercase">
        {{ label }}
      </span>
    </div>
    <div
      v-if="showValue"
      class="knob-value rounded-lg p-1 font-mono text-2xs text-primary-500 shadow-in-sm dark:text-primary-300 dark:shadow-in-sm-dark"
    >
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
    logBase?: number;
    format?: (value: number) => string;
    size?: 'sm' | 'md' | 'lg';
    showValue?: boolean;
  }>(),
  {
    from: 0,
    to: 1,
    default: 0,
    logBase: 0,
    format: (value: number) => `${value}`,
    size: 'lg',
    showValue: true,
  },
);
const angleMin = -135; // corresponds to normalized 0
const angleRange = 270;

const normalizedZeroValue = convertValueToNormalized(Math.max(0, props.from));
const sweepZero = convertNormalizedToAngle(normalizedZeroValue);

const displayValue = computed(() => {
  return props.format(value.value);
});
const value = defineModel<number>({ required: true });

// Range: 0..1
const normalizedValue = computed({
  get: () => convertValueToNormalized(value.value),
  set(normalized: number) {
    value.value = convertNormalizedToValue(normalized);
  },
});

const angle = computed(() => angleMin + normalizedValue.value * angleRange);

// Start angle of the sweep
const sweepStart = computed(() => {
  const valueAngle = convertNormalizedToAngle(normalizedValue.value);
  return Math.min(sweepZero, valueAngle);
});

// The sweep angle of the knob, representing the difference between the current value angle and the zero angle
const sweep = computed(() => {
  const valueAngle = convertNormalizedToAngle(normalizedValue.value);
  return Math.abs(valueAngle - sweepZero);
});

// Converts a value from the component's range to a normalized 0..1 range
function convertValueToNormalized(value: number) {
  if (props.logBase !== 0) {
    const minExponent = Math.log(props.from) / Math.log(props.logBase);
    const maxExponent = Math.log(props.to) / Math.log(props.logBase);
    return (
      (Math.log(value) / Math.log(props.logBase) - minExponent) /
      (maxExponent - minExponent)
    );
  }

  return (value - props.from) / (props.to - props.from);
}

// Converts a normalized 0..1 value back to the component's range
function convertNormalizedToValue(normalized: number) {
  if (props.logBase !== 0) {
    const minExponent = Math.log(props.from) / Math.log(props.logBase);
    const maxExponent = Math.log(props.to) / Math.log(props.logBase);
    return Math.pow(
      props.logBase,
      minExponent + normalized * (maxExponent - minExponent),
    );
  }
  return normalized * (props.to - props.from) + props.from;
}

// Converts a normalized 0..1 value to the corresponding angle on the knob
function convertNormalizedToAngle(normalized: number) {
  return angleMin + normalized * angleRange;
}

const active = ref(false);
let startY = 0;
let startV = 0;

function onPointerDown(e: PointerEvent) {
  if (!knob.value) return;
  startY = e.clientY;
  startV = normalizedValue.value;
  active.value = true;
  knob.value.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
  if (!active.value) return;
  var dy = startY - e.clientY;
  set(startV + dy / (e.shiftKey ? 600 : 180));
}

function set(newNormalizedValue: number) {
  const newValue = convertNormalizedToValue(clamp(newNormalizedValue));
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
  active.value = false;
}

function resetToDefault() {
  set(convertValueToNormalized(props.default));
}
</script>

<style scoped>
@reference 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));

.knob {
  background: linear-gradient(
    145deg,
    var(--color-primary-200),
    var(--color-primary-300)
  );
  transition-property: box-shadow, transform;
}

.knob:focus-visible {
  box-shadow:
    var(--shadow-out-sm),
    0 0 0 3px var(--color-accent-500);
}

.knob.active {
  box-shadow: var(--shadow-in-sm);
  transform: scale(0.97);
  cursor: none;
}

.knob::before {
  content: '';
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: linear-gradient(
    145deg,
    var(--color-primary-300),
    var(--color-primary-100)
  );
  box-shadow:
    inset 2px 2px 4px var(--color-primary-400),
    inset -2px -2px 4px var(--color-primary-100);
}
.knob[data-size='sm']::before {
  display: none;
}

@variant dark {
  .knob {
    background: linear-gradient(
      145deg,
      var(--color-primary-300),
      var(--color-primary-700),
      var(--color-primary-800)
    );
  }

  .knob:focus-visible {
    box-shadow:
      var(--shadow-out-sm-dark),
      0 0 0 3px var(--color-accent-500);
  }
  .knob.active {
    box-shadow: var(--shadow-in-sm-dark);
  }
  .knob::before {
    background: linear-gradient(
      145deg,
      var(--color-primary-700),
      var(--color-primary-600),
      var(--color-primary-400)
    );
    box-shadow:
      inset 2px 2px 4px var(--color-primary-900),
      inset -2px -2px 4px var(--color-primary-500);
  }
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

  transition: transform 0.01s ease-in-out;
}
.knob[data-size='sm'] .pointer {
  width: 2px;
  height: 12px;
  transform: translateY(-100%) rotate(var(--angle)) translateY(-2px);
}

.knob .arc {
  inset: -6px;
  background: conic-gradient(
    from var(--sweep-start),
    var(--color-accent-300) 0deg,
    var(--color-accent-700) var(--sweep),
    transparent var(--sweep)
  );
  mask: radial-gradient(
    farthest-side,
    transparent calc(100% - 4px),
    #000 calc(100% - 3px)
  );
  opacity: 0.9;
  pointer-events: none;
}

.knob-value {
  min-width: 58px;
  text-align: center;
}

.knob[data-size='md']::before {
  inset: 5px;
}
.knob[data-size='md'] .pointer {
  width: 3px;
  height: 15px;
  transform: translateY(-100%) rotate(var(--angle)) translateY(-6px);
}
</style>
