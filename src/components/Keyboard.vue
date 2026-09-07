<template>
  <div class="flex flex-row justify-between">
    <div v-for="note in notes">
      <div
        class="key bg-white"
        :class="{ black: note.black }"
        :data-semi="note.semi"
      >
        {{ note.n }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useAudioEngine } from '../composables/use-audio-context';
import { noteForKey, notes } from '../utils/key-map';

const engine = useAudioEngine();
const octave = ref(4);

watch(octave, (newVal, oldVal) => {
  console.log('octave changed from', oldVal, 'to', newVal);
});

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  var k = e.key.toLowerCase();

  switch (k) {
    case '-':
      octave.value = Math.max(0, octave.value - 1);
      break;
    case '=':
      octave.value = Math.min(8, octave.value + 1);
      break;
    case 'escape':
      engine.value.allNotesOff();
      break;
  }

  const semi = noteForKey(k);
  if (semi !== undefined) {
    e.preventDefault();
    engine.value.noteOn(semi + (octave.value - 4) * 12);
  }
}

function onKeyUp(e: KeyboardEvent) {
  var k = e.key.toLowerCase();
  const semi = noteForKey(k);
  if (semi !== undefined) {
    e.preventDefault();
    engine.value.noteOff(semi + (octave.value - 4) * 12);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
});
</script>
