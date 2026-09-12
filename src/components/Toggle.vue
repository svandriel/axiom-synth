<template>
  <div
    class="toggle-container inline-flex gap-1 rounded-md px-1 py-1 shadow-in-xs dark:shadow-in-xs-dark"
  >
    <div v-for="value in values" :key="value.id">
      <button
        @click="onClicked(value.id)"
        :aria-pressed="isPressed(value.id)"
        class="inline-flex cursor-pointer rounded-md px-1.5 py-1.5 font-mono text-2xs tracking-widest uppercase"
        :class="{
          'text-primary-400 dark:text-primary-400': !isPressed(value.id),
          'text-accent-600 dark:text-accent-300': isPressed(value.id),
        }"
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
  transition:
    transform 0.06s,
    box-shadow 0.06s,
    color 0.2s,
    background-color 0.2s;
}
button:active {
  transform: translateY(2px);
}
button[aria-pressed='true'] {
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
  transform: none;
}
</style>
