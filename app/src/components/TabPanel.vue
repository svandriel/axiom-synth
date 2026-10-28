<template>
  <div class="grid gap-2 panel" :class="'grid-cols-' + items.length">
    <TabItem
      v-for="item in items"
      :key="item.id"
      :label="item.label"
      :active="item.id === activeTab"
      @click="activeTab = item.id"
    />
  </div>
</template>

<script setup lang="ts">
import TabItem from './TabItem.vue';

const activeTab = defineModel<string>({
  required: true,
});

defineProps<{
  items: { id: string; label: string }[];
}>();
</script>
