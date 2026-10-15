import type { Observable } from '@axiom/audio-engine';
import { onUnmounted, ref, type Ref } from 'vue';

export function useObservable<T>(source: Observable<T>): Ref<T> {
  const value = ref(source.value) as Ref<T>;
  const subscription = source.subscribe(newValue => {
    value.value = newValue;
  });
  onUnmounted(() => subscription.unsubscribe());
  return value;
}
