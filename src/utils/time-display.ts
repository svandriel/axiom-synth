export function timeDisplay(seconds: number) {
  if (seconds < 0.1) {
    return `${(seconds * 1000).toFixed(2)} ms`;
  } else if (seconds < 1) {
    return `${Math.round(seconds * 1000)} ms`;
  } else {
    return `${seconds.toFixed(1)} s`;
  }
}
export function timeDisplayMs(millis: number) {
  return timeDisplay(0.001 * millis);
}
