import { expect, it } from 'vitest';
import { Statistics } from './stats';

it('tracks render-time statistics without growing an array in the audio callback', () => {
  const stats = new Statistics();
  const originalPush = Array.prototype.push;
  let pushes = 0;
  Array.prototype.push = function (...items: unknown[]): number {
    pushes++;
    return originalPush.apply(this, items);
  };

  try {
    stats.addSample(1);
    stats.addSample(3);
  } finally {
    Array.prototype.push = originalPush;
  }

  expect(pushes).toBe(0);
  expect(stats.count).toBe(2);
  expect(stats.average).toBe(2);
  stats.clear();
  expect(stats.count).toBe(0);
  expect(stats.average).toBe(0);
});
