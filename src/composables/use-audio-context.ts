import { onMounted, ref } from 'vue';
import { AudioEngine } from '../engine';

let audioEngine = new AudioEngine(new AudioContext());

export function useAudioEngine() {
  const audioEngineRef = ref<AudioEngine>(audioEngine);

  onMounted(() => {
    if (audioEngineRef.value.ctxt.state === 'closed') {
      console.log('AudioContext was closed, creating a new one.');
      audioEngineRef.value = new AudioEngine(new AudioContext());
    }
  });
  return audioEngineRef;
}
