import { percentageDisplay } from './percentage-display';

/**
 * Formats a fraction (0-1) as a percentage (e.g. 0.035 -> 3.5%)
 */
export function fractionDisplay(value: number): string {
  return percentageDisplay(value * 100);
}
