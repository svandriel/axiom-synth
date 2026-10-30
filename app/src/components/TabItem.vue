<template>
  <button
    class="flex cursor-pointer flex-row items-center gap-3 rounded-lg p-3 font-mono text-xs text-primary-400 uppercase shadow-in-xs transition-colors duration-150 hover:bg-primary-300 dark:shadow-in-xs-dark dark:hover:bg-primary-800"
    :class="{ active }"
    @click="$emit('click')"
    :aria-pressed="active"
    role="tab"
    :aria-label="label"
  >
    <Icon v-if="icon" :name="icon" size="md" />
    <div class="label transition-transform duration-150">
      {{ label }}
    </div>
  </button>
</template>
<script setup lang="ts">
import Icon, { type IconName } from './Icon.vue';

defineProps<{
  label: string;
  active?: boolean;
  icon?: IconName;
}>();

defineEmits<{
  (e: 'click'): void;
}>();
</script>

<style scoped>
@reference 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));

button {
  background-image: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-primary-800) 15%, transparent),
    color-mix(in srgb, var(--color-primary-700) 0%, transparent)
  );
}

button.active {
  color: var(--color-accent-600);
  background-color: color-mix(
    in srgb,
    var(--color-accent-400) 10%,
    transparent
  );
  box-shadow:
    inset 2px 2px 3px
      color-mix(in srgb, var(--color-accent-300) 70%, transparent),
    inset -2px -2px 3px
      color-mix(in srgb, var(--color-accent-300) 70%, transparent);

  outline: 1px solid var(--color-accent-600);
}

@variant dark {
  button.active {
    color: var(--color-accent-400);
    background-color: color-mix(
      in srgb,
      var(--color-accent-700) 10%,
      transparent
    );
    box-shadow:
      inset 2px 2px 3px
        color-mix(in srgb, var(--color-accent-700) 70%, transparent),
      inset -2px -2px 3px
        color-mix(in srgb, var(--color-accent-700) 70%, transparent);

    outline: 1px solid var(--color-accent-400);
  }
}

button:active .label {
  transform: translateY(2px);
}
</style>
