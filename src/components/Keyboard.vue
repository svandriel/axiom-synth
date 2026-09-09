<template>
  <div
    class="keyboard-container rounded-md p-3 shadow-in-sm dark:shadow-in-sm-dark"
  >
    <div class="keyboard relative flex gap-0.5">
      <!-- white keys -->
      <div
        v-for="note in whiteNotes"
        class="key white flex flex-1 cursor-pointer items-end justify-center rounded-b-lg bg-linear-to-b from-white via-[#f4f1ea] via-85% to-[#cfcac0] pb-2 text-2xs uppercase select-none"
        :class="{
          on: pressed[note.semi],
        }"
        :data-semi="note.semi"
        @pointerdown="e => onPianoKeyDown(note.semi, e)"
        @pointerup="e => onPianoKeyUp(note.semi, e)"
      >
        <span class="name absolute top-2.5 font-mono text-primary-500">
          {{ note.n }}
        </span>
        <span class="key font-mono text-primary-600">
          {{ note.k }}
        </span>
      </div>
      <!-- black keys -->
      <div
        v-for="note in blackNotes"
        class="key black absolute top-0 left-0 flex h-[60%] flex-1 cursor-pointer items-end justify-center rounded-b-sm bg-linear-to-b from-black to-gray-700 text-2xs text-gray-400 uppercase select-none"
        :data-semi="note.semi"
        :class="{
          on: pressed[note.semi],
        }"
        @pointerdown="e => onPianoKeyDown(note.semi, e)"
        @pointerup="e => onPianoKeyUp(note.semi, e)"
        :style="{
          '--width': '3.1%',
          '--location': pianoKeyLocations[note.semi],
        }"
      >
        <span class="key hidden font-mono sm:inline">
          {{ note.k }}
        </span>
      </div>
    </div>
    <div
      class="mt-3 font-mono text-xs text-primary-400 uppercase dark:text-primary-400"
    >
      Control with computer keys, change octave with - and =
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useAudioEngine } from '../composables/use-audio-context';
import { noteForKey, notes } from '../utils/key-map';

const engine = useAudioEngine();
const octave = ref(3);

const whiteNotes = notes.filter(note => !note.black);
const blackNotes = notes.filter(note => note.black);

const pressed = ref<{ [semi: number]: boolean }>({});

function onPianoKeyDown(semi: number, e?: PointerEvent) {
  engine.value.noteOn(semi + (octave.value - 4) * 12, 127);
  pressed.value[semi] = true;
  if (e?.currentTarget && e.currentTarget instanceof HTMLDivElement) {
    e.currentTarget.setPointerCapture(e.pointerId);
  }
}

function onPianoKeyUp(semi: number, e?: PointerEvent) {
  engine.value.noteOff(semi + (octave.value - 4) * 12);
  pressed.value[semi] = false;
  if (e?.currentTarget && e.currentTarget instanceof HTMLDivElement) {
    e.currentTarget.releasePointerCapture(e.pointerId);
  }
}

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

    onPianoKeyDown(semi);
  }
}

function onKeyUp(e: KeyboardEvent) {
  var k = e.key.toLowerCase();
  const semi = noteForKey(k);
  if (semi !== undefined) {
    e.preventDefault();
    onPianoKeyUp(semi);
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

// Mapping of semitones to logical piano key location
// e.g. C is 0, C# is 0, D is 1, D# is 1, etc
const pianoKeyLocations: Record<number, number> = {};
let currentLocation = 0;
for (let i = 0; i < notes.length; i++) {
  const note = notes[i];
  if (note.black) {
    pianoKeyLocations[note.semi] = currentLocation - 1;
  } else {
    pianoKeyLocations[note.semi] = currentLocation;
    currentLocation++;
  }
}
</script>

<style scoped>
.keyboard {
  height: clamp(110px, 18vw, 170px);
}

.key {
  transition: transform 0.15s;
}

.key.white {
  box-shadow:
    inset 0 -4px 0 rgba(0, 0, 0, 0.12),
    inset 1px 0 0 rgba(255, 255, 255, 0.6),
    0 2px 0 #7a7670,
    6px 6px 10px rgba(0, 0, 0, 0.3);
}

.key.white.on {
  background: linear-gradient(180deg, #ffe0a3, #ffc766);
  box-shadow:
    inset 0 -2px 0 rgba(0, 0, 0, 0.15),
    0 0 14px rgba(255, 177, 59, 0.6) 6px 6px 10px rgba(0, 0, 0, 0.5);
  transform: translateY(2px);
}

.key.black {
  box-shadow:
    0 4px 0 #000,
    inset 0 -6px 0 rgba(255, 255, 255, 0.06),
    inset 1px 0 0 rgba(255, 255, 255, 0.08);
  width: var(--width);
  left: calc((var(--location) + 1) * (100% + 2px) / 15 - (var(--width) / 2));
}

.key.black.on {
  background: linear-gradient(180deg, #ff9a3b, #c76a12);
  box-shadow:
    0 2px 0 #000,
    0 0 14px rgba(255, 177, 59, 0.6);
  /* transform: translateY(2px); */
  height: 62%;
  color: #2b1a00;
}
</style>
