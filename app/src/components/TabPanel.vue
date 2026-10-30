<template>
  <div class="grid gap-2 panel" :class="'grid-cols-' + items.length">
    <TabItem
      v-for="item in items"
      :key="item.id"
      :label="item.label"
      :icon="item.icon"
      :active="item.id === activeTab"
      @click="activeTab = item.id"
    />
  </div>
</template>

<script setup lang="ts">
import type { IconName } from './Icon.vue';
import TabItem from './TabItem.vue';

const activeTab = defineModel<string>({
  required: true,
});

export type TabItem = {
  id: string;
  label: string;
  icon?: IconName;
};

defineProps<{ items: TabItem[] }>();
</script>
