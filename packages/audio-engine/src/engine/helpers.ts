export function freqOf(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function resumeIfSuspended(ctxt: AudioContext) {
  if (ctxt.state === 'suspended') {
    ctxt.resume();
  }
}
