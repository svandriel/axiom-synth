export function hzDisplay(hz: number): string {
  if (hz < 10) {
    return hz.toFixed(2) + ' Hz';
  } else if (hz < 100) {
    return hz.toFixed(1) + ' Hz';
  } else if (hz < 1000) {
    return hz.toFixed() + ' Hz';
  } else {
    return (hz / 1000).toFixed(1) + ' kHz';
  }
}
