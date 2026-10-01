export const notes = [
  { n: 'C', label: 'Z', k: 'KeyZ', semi: 0 },
  { n: 'C#', label: 'S', k: 'KeyS', semi: 1, black: true },
  { n: 'D', label: 'X', k: 'KeyX', semi: 2 },
  { n: 'D#', label: 'D', k: 'KeyD', semi: 3, black: true },
  { n: 'E', label: 'C', k: 'KeyC', semi: 4 },
  { n: 'F', label: 'V', k: 'KeyV', semi: 5 },
  { n: 'F#', label: 'G', k: 'KeyG', semi: 6, black: true },
  { n: 'G', label: 'B', k: 'KeyB', semi: 7 },
  { n: 'G#', label: 'H', k: 'KeyH', semi: 8, black: true },
  { n: 'A', label: 'N', k: 'KeyN', semi: 9 },
  { n: 'A#', label: 'J', k: 'KeyJ', semi: 10, black: true },
  { n: 'B', label: 'M', k: 'KeyM', semi: 11 },
  { n: 'C', label: 'Q', k: 'KeyQ', semi: 12 },
  { n: 'C#', label: '2', k: 'Digit2', semi: 13, black: true },
  { n: 'D', label: 'W', k: 'KeyW', semi: 14 },
  { n: 'D#', label: '3', k: 'Digit3', semi: 15, black: true },
  { n: 'E', label: 'E', k: 'KeyE', semi: 16 },
  { n: 'F', label: 'R', k: 'KeyR', semi: 17 },
  { n: 'F#', label: '5', k: 'Digit5', semi: 18, black: true },
  { n: 'G', label: 'T', k: 'KeyT', semi: 19 },
  { n: 'G#', label: '6', k: 'Digit6', semi: 20, black: true },
  { n: 'A', label: 'Y', k: 'KeyY', semi: 21 },
  { n: 'A#', label: '7', k: 'Digit7', semi: 22, black: true },
  { n: 'B', label: 'U', k: 'KeyU', semi: 23 },
  { n: 'C', label: 'I', k: 'KeyI', semi: 24 },
];
const keyMap = notes.reduce<Record<string, number>>((acc, n) => {
  acc[n.k] = n.semi;
  return acc;
}, {});

export function noteForKey(key: string): number | undefined {
  return keyMap[key];
}
