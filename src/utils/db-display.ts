export function dbDisplay(value: number) {
  const db = fractionsToDecibels(value);
  if (db === Number.NEGATIVE_INFINITY) {
    return `-inf dB`;
  }
  const displayDb = db.toFixed(1);
  if (displayDb === '0.0') {
    return '0.0 dB';
  } else if (db > 0) {
    return `+${db.toFixed(1)} dB`;
  } else {
    return `${db.toFixed(1)} dB`;
  }
}

export function fractionsToDecibels(fraction: number) {
  return Math.log10(fraction) * 20;
}
