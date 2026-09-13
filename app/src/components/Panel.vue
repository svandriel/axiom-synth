<template>
  <div class="panel">
    <div class="flex flex-row items-center justify-between">
      <div class="text-sm tracking-wide uppercase">
        {{ label }}
      </div>
      <slot name="top-right" />
    </div>
    <slot />
  </div>
</template>
<script setup lang="ts">
defineProps<{
  label: string;
}>();
</script>
