export function fractionDisplay(precision: number): (value: number) => string {
  return (value: number) => {
    const display = value.toFixed(precision);
    return value < 0 ? `${display}%` : `+${display}%`;
  };
}
