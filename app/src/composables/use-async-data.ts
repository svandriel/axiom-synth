import { ref } from 'vue';

export type AsyncDataStatus = 'idle' | 'pending' | 'success' | 'error';

export function useAsyncData<T, ErrorT = unknown>(fn: () => Promise<T>) {
  const data = ref<T>();
  const error = ref<ErrorT>();
  const status = ref<AsyncDataStatus>('idle');
  const pending = ref(false);

  function execute() {
    status.value = 'pending';
    pending.value = true;
    fn()
      .then(result => {
        data.value = result;
        error.value = undefined;
        status.value = 'success';
      })
      .catch(err => {
        data.value = undefined;
        error.value = err;
        status.value = 'error';
      })
      .finally(() => {
        pending.value = false;
      });
  }

  execute();

  return { data, error, status, pending };
}
