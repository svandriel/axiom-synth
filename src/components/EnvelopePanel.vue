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
// const scopeColor3 = styles.getPropertyValue('--color-accent-900');

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

watchEffect(renderEnv);

const envelopes = [
  { id: 'amp', label: 'Amp' },
  { id: 'filter', label: 'Filter' },
];

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

function renderEnv() {
  const envC = envGraph.value;
  if (!envC) {
    return;
  }

  const sctx = envC.getContext('2d');
  if (!sctx) {
    return;
  }

  const { w, h, dpr } = fit(envC);
  // grid(g, w, h);
  sctx.clearRect(0, 0, w, h);
  const total = attack.value + decay.value + 0.6 + release.value;
  const px = (t: number) => (t / total) * (w - 8) + 4;
  const py = (v: number) => h - 6 - v * (h - 14);

  sctx.globalAlpha = 0.6;
  sctx.beginPath();
  sctx.moveTo(px(0), py(0));
  sctx.lineTo(px(attack.value), py(1));
  sctx.lineTo(px(attack.value + decay.value), py(sustain.value));
  sctx.lineTo(px(attack.value + decay.value + 0.6), py(sustain.value));
  sctx.lineTo(px(total), py(0));
  const fill = sctx.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, scopeColor2);
  fill.addColorStop(1, `rgba(0,0,0, 0.1`);
  sctx.fillStyle = fill;
  sctx.lineTo(px(total), py(0));
  sctx.fill();
  // trace(g, w, h);

  sctx.globalAlpha = 1;
  sctx.strokeStyle = scopeColor1;
  sctx.lineWidth = 2.2 * dpr;
  sctx.lineJoin = 'round';
  sctx.shadowBlur = 18 * dpr;
  sctx.shadowColor = 'rgba(255,45,149,1)';
  sctx.beginPath();
  sctx.moveTo(px(0), py(0));
  sctx.lineTo(px(attack.value), py(1));
  sctx.lineTo(px(attack.value + decay.value), py(sustain.value));
  sctx.lineTo(px(attack.value + decay.value + 0.6), py(sustain.value));
  sctx.lineTo(px(total), py(0));
  sctx.stroke();
  sctx.shadowBlur = 0;
}
</script>
