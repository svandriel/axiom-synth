export function timeDisplay(seconds: number) {
  if (seconds < 0.1) {
    return `${(seconds * 1000).toFixed(2)} ms`;
  } else if (seconds < 1) {
    return `${Math.round(seconds * 1000)} ms`;
  }
  return `${seconds.toFixed(2)} s`;
}
