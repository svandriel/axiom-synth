export function semiDisplay(value: number): string {
  if (value > 0) {
    return `+${value}`;
  } else {
    return `${value}`;
  }
}
