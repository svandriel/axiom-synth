export const notes = [
  { n: 'C', k: 'z', semi: 0 },
  { n: 'C#', k: 's', semi: 1, black: true },
  { n: 'D', k: 'x', semi: 2 },
  { n: 'D#', k: 'd', semi: 3, black: true },
  { n: 'E', k: 'c', semi: 4 },
  { n: 'F', k: 'v', semi: 5 },
  { n: 'F#', k: 'g', semi: 6, black: true },
  { n: 'G', k: 'b', semi: 7 },
  { n: 'G#', k: 'h', semi: 8, black: true },
  { n: 'A', k: 'n', semi: 9 },
  { n: 'A#', k: 'j', semi: 10, black: true },
  { n: 'B', k: 'm', semi: 11 },
  { n: 'C', k: 'q', semi: 12 },
  { n: 'C#', k: '2', semi: 13, black: true },
  { n: 'D', k: 'w', semi: 14 },
  { n: 'D#', k: '3', semi: 15, black: true },
  { n: 'E', k: 'e', semi: 16 },
  { n: 'F', k: 'r', semi: 17 },
  { n: 'F#', k: '5', semi: 18, black: true },
  { n: 'G', k: 't', semi: 19 },
  { n: 'G#', k: '6', semi: 20, black: true },
  { n: 'A', k: 'y', semi: 21 },
  { n: 'A#', k: '7', semi: 22, black: true },
  { n: 'B', k: 'u', semi: 23 },
  { n: 'C', k: 'i', semi: 24 },
];
const keyMap = notes.reduce<Record<string, number>>((acc, n) => {
  acc[n.k] = n.semi;
  return acc;
}, {});

export function noteForKey(key: string): number | undefined {
  return keyMap[key];
}
