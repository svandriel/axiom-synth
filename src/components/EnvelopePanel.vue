<template>
  <Panel label="Envelope">
    <template #top-right>
      <Toggle :values="envelopes" v-model="current" />
    </template>
    <div class="mt-4 grid grid-cols-4 grid-rows-2 gap-4">
      <Knob
        class="col-start-1 row-start-1"
        size="sm"
        :from="1"
        :to="5000"
        :default="20"
        :log-base="2"
        v-model="attack"
        label="Attack"
        :format="timeDisplayMs"
        :show-value="false"
      />
      <Knob
        class="col-start-2 row-start-1"
        size="sm"
        :from="1"
        :to="5000"
        :default="10"
        :log-base="2"
        v-model="decay"
        label="Decay"
        :format="timeDisplayMs"
        :show-value="false"
      />
      <Knob
        class="col-start-1 row-start-2"
        size="sm"
        :from="0"
        :to="1"
        :default="0.6"
        v-model="sustain"
        label="Sustain"
        :format="dbDisplay"
        :show-value="false"
      />
      <Knob
        class="col-start-2 row-start-2"
        size="sm"
        :from="1"
        :to="10000"
        :log-base="2"
        :default="400"
        v-model="release"
        label="Release"
        :format="timeDisplayMs"
        :show-value="false"
      />
      <div
        class="relative col-span-2 col-start-3 row-span-2 row-start-1 overflow-hidden rounded-2xl bg-black"
      >
        <canvas
          ref="envGraph"
          class="block h-full w-full bg-primary-600 dark:bg-primary-800"
        />
      </div>
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef, watchEffect } from 'vue';
import type { EnvelopeConfig } from '../types/envelope-config.ts';
import type { NumericKeys } from '../types/numeric-keys.ts';
import { dbDisplay } from '../utils/db-display.ts';
import { timeDisplayMs } from '../utils/time-display.ts';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';

const amp = defineModel<EnvelopeConfig>('amp', { required: true });
const filter = defineModel<EnvelopeConfig>('filter', { required: true });

const current = ref('amp');
const envGraph = useTemplateRef('envGraph');

const styles = getComputedStyle(document.documentElement);
const scopeColor1 = styles.getPropertyValue('--color-accent-300');
const scopeColor2 = styles.getPropertyValue('--color-accent-500');
const scopeColor3 = styles.getPropertyValue('--color-accent-900');

function makeComputed<K extends NumericKeys<EnvelopeConfig>>(
  key: K,
  scale: number = 1,
) {
  return computed({
    get: () =>
      scale * (current.value === 'amp' ? amp.value[key] : filter.value[key]),
    set(value) {
      if (current.value === 'amp') {
        amp.value[key] = value / scale;
      } else {
        filter.value[key] = value / scale;
      }
    },
  });
}

const attack = makeComputed('attackSeconds', 1000);
const decay = makeComputed('decaySeconds', 1000);
const sustain = makeComputed('sustainLevel');
const release = makeComputed('releaseSeconds', 1000);

watchEffect(render);

const envelopes = [
  { id: 'amp', label: 'Amp' },
  { id: 'filter', label: 'Filter' },
];

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
  const canvas = envGraph.value;
  if (!canvas) {
    return;
  }

  const g = canvas.getContext('2d');
  if (!g) {
    return;
  }

  renderEnv(canvas, g);
}

function renderEnv(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D) {
  const sustainTimeMillis = 700;
  const { w, h, dpr } = fit(canvas);
  g.clearRect(0, 0, w, h);
  grid(g, w, h);
  const total = attack.value + decay.value + sustainTimeMillis + release.value;
  const px = (t: number) => (t / total) * (w - 8) + 4;
  const py = (v: number) => h - 6 - v * (h - 14);

  g.globalAlpha = 0.6;
  g.beginPath();
  g.moveTo(px(0), py(0));
  g.lineTo(px(attack.value), py(1));
  g.lineTo(px(attack.value + decay.value), py(sustain.value));
  g.lineTo(
    px(attack.value + decay.value + sustainTimeMillis),
    py(sustain.value),
  );
  g.lineTo(px(total), py(0));
  const fill = g.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, scopeColor2);
  fill.addColorStop(1, `rgba(0,0,0, 0.1`);
  g.fillStyle = fill;
  g.lineTo(px(total), py(0));
  g.fill();

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
  g.moveTo(px(0), py(0));
  g.lineTo(px(attack.value), py(1));
  g.lineTo(px(attack.value + decay.value), py(sustain.value));
  g.lineTo(
    px(attack.value + decay.value + sustainTimeMillis),
    py(sustain.value),
  );
  g.lineTo(px(total), py(0));
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
</script>
