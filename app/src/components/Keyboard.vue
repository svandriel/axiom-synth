<template>
  <div
    class="keyboard-container rounded-md p-3 shadow-in-sm select-none dark:shadow-in-sm-dark"
    @contextmenu.prevent="() => {}"
  >
    <div class="keyboard relative flex gap-0.5">
      <!-- white keys -->
      <div
        v-for="note in whiteNotes"
        class="key white flex flex-1 cursor-pointer items-end justify-center rounded-b-lg bg-linear-to-b from-white via-[#f4f1ea] via-85% to-[#cfcac0] pb-2 text-2xs uppercase select-none"
        :class="{ on: pressed[note.semi] }"
        :data-semi="note.semi"
        @pointerdown="e => onPianoKeyDown(note.semi, e)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @lostpointercapture="onLostPointerCapture"
      >
        <span class="name absolute top-2.5 font-mono text-primary-500">
          {{ note.n }}
        </span>
        <span class="key font-mono text-primary-600">{{ note.label }}</span>
      </div>
      <!-- black keys -->
      <div
        v-for="note in blackNotes"
        class="key black absolute top-0 left-0 flex h-[60%] flex-1 cursor-pointer items-end justify-center rounded-b-sm bg-linear-to-b from-black to-gray-700 text-2xs text-gray-400 uppercase select-none"
        :data-semi="note.semi"
        :class="{ on: pressed[note.semi] }"
        @pointerdown="e => onPianoKeyDown(note.semi, e)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @lostpointercapture="onLostPointerCapture"
        :style="{
          '--width': '3.1%',
          '--location': pianoKeyLocations[note.semi],
        }"
      >
        <span class="key hidden font-mono sm:inline">{{ note.label }}</span>
      </div>
    </div>
    <div
      class="mt-3 flex flex-row justify-between gap-3 font-mono text-xs text-primary-400 uppercase dark:text-primary-400"
    >
      <div>Control with computer keys, change octave with - and =</div>
      <div>Octave: {{ octave }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useAxiomSynth } from '../composables/use-axiom-synth';
import { noteForKey, notes } from '../utils';

const synth = useAxiomSynth();
const octave = ref(3);
const whiteNotes = notes.filter(note => !note.black);
const blackNotes = notes.filter(note => note.black);

const midiNotesActive = ref<Set<number>>(new Set());
const pressed = computed<Readonly<{ [semi: number]: boolean }>>(() => {
  const result: { [semi: number]: boolean } = {};
  midiNotesActive.value.forEach(midi => {
    const semi = midi - octave.value * 12;
    result[semi] = true;
  });
  return result;
});

// Pointer capture keeps a gesture alive outside its starting key. Track each
// pointer independently so multiple fingers can play notes simultaneously.
const activePointers = new Map<number, { semi: number; midi: number }>();

function addNote(semi: number) {
  const midi = semi + octave.value * 12;
  synth.value.noteOn(midi, 127);
  midiNotesActive.value.add(midi);
}

function removeNote(midi: number) {
  synth.value.noteOff(midi);
  midiNotesActive.value.delete(midi);
}

function clearAllNotes() {
  synth.value.allNotesOff();
  midiNotesActive.value.clear();
}

function movePointerTo(pointerId: number, semi: number) {
  const active = activePointers.get(pointerId);
  if (!active || active.semi === semi) {
    return;
  }
  removeNote(active.midi);
  const midi = semi + octave.value * 12;
  activePointers.set(pointerId, { semi, midi });
  addNote(semi);
}

function onPianoKeyDown(semi: number, e: PointerEvent) {
  if (e.button !== 0 || activePointers.has(e.pointerId)) {
    return;
  }
  e.preventDefault();
  const target = e.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  target.setPointerCapture(e.pointerId);
  const midi = semi + octave.value * 12;
  activePointers.set(e.pointerId, { semi, midi });
  addNote(semi);
}

function onPointerMove(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) {
    return;
  }
  // With pointer capture, event.target remains the capture element. Hit-test
  // the actual pointer position to detect keys crossed during a glissando.
  const pointElem = document.elementFromPoint(e.clientX, e.clientY);
  const hit = pointElem?.closest<HTMLElement>('[data-semi]');
  const keyboard = (e.currentTarget as HTMLElement | null)?.closest(
    '.keyboard',
  );
  if (!hit || !keyboard?.contains(hit)) {
    return;
  }
  const semi = Number(hit.dataset.semi);
  if (Number.isInteger(semi)) movePointerTo(e.pointerId, semi);
}

function finishPointer(pointerId: number) {
  const active = activePointers.get(pointerId);
  if (!active) return;
  activePointers.delete(pointerId);
  removeNote(active.midi);
}

function onPointerUp(e: PointerEvent) {
  finishPointer(e.pointerId);
  const target = e.currentTarget;
  if (target instanceof HTMLElement && target.hasPointerCapture(e.pointerId)) {
    target.releasePointerCapture(e.pointerId);
  }
}

function onPointerCancel(e: PointerEvent) {
  finishPointer(e.pointerId);
}

function onLostPointerCapture(e: PointerEvent) {
  finishPointer(e.pointerId);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.code) {
    case 'Minus':
      octave.value = Math.max(0, octave.value - 1);
      break;
    case 'Equal':
    case 'Plus':
      octave.value = Math.min(8, octave.value + 1);
      break;
    case 'Escape':
      clearAllNotes();
      break;
  }
  const semi = noteForKey(e.code);
  if (semi !== undefined) {
    e.preventDefault();

    addNote(semi);
  }
}

function onKeyUp(e: KeyboardEvent) {
  const semi = noteForKey(e.code);
  if (semi === undefined) return;

  if (e.shiftKey) return;
  e.preventDefault();
  const midi = semi + octave.value * 12;
  removeNote(midi);
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  for (const pointerId of activePointers.keys()) finishPointer(pointerId);
});

const pianoKeyLocations: Record<number, number> = {};
let currentLocation = 0;
for (const note of notes) {
  if (note.black) pianoKeyLocations[note.semi] = currentLocation - 1;
  else {
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
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}
.keyboard-container {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
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
  height: 62%;
  color: #2b1a00;
}
</style>
