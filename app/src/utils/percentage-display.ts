/**
 * Formats a number as a percentage (e.g. 3.5 -> 3.5%)
 */
export function percentageDisplay(value: number): string {
  const absValue = Math.abs(value);
  if (absValue < 10) {
    return `${value.toFixed(2)}%`;
  } else if (absValue < 100) {
    return `${value.toFixed(1)}%`;
  } else {
    return `${value.toFixed(0)}%`;
  }
}
