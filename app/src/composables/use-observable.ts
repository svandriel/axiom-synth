import type { Observable } from '@axiom/audio-engine';
import { onUnmounted, shallowRef, type Ref } from 'vue';

export function useObservable<T>(source: Observable<T>): Ref<T> {
  const value = shallowRef(source.value);
  const subscription = source.subscribe(newValue => {
    value.value = newValue;
  });
  onUnmounted(() => subscription.unsubscribe());
  return value;
}
