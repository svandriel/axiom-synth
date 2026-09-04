<template>
  <div
    class="toggle-container inline-flex px-1 py-1 bg-slate-400 dark:bg-slate-800 rounded-md gap-1"
  >
    <div v-for="value in values" :key="value.id">
      <button
        @click="onClicked(value.id)"
        :aria-pressed="isPressed(value.id)"
        class="inline-flex px-2 py-1.5 rounded-md font-mono tracking-widest text-slate-700 dark:text-slate-500 aria-pressed:text-slate-100 dark:aria-pressed:text-slate-100 cursor-pointer uppercase text-2xs"
      >
        {{ value.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  values: { id: string; label: string }[];
}>();
const model = defineModel<string>();

function isPressed(id: string) {
  return model.value === id;
}

function onClicked(id: string) {
  model.value = id;
}
</script>

<style lang="css" scoped>
button {
  /* font-size: 10px; */

  transition:
    transform 0.06s,
    box-shadow 0.06s,
    background-color 0.2s;
}
button:active {
  transform: translateY(2px);
}
button[aria-pressed="true"] {
  /* color: #fff; */
  background: linear-gradient(180deg, var(--rubber-hi), var(--rubber));
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
  transform: none;
}
</style>
