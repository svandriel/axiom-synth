import { expect, test } from '@playwright/test';

const ENDED_LOG = 'Moog oscillator worklet node ended';
const ONENDED_LOG = '[moog-oscillator] onended';
const CONTROL_HINT = 'Control with computer keys';
const NOTE_KEY = 'z';
const NOTE_PRESS_MS = 600;
const ENDED_TIMEOUT_MS = 15_000;

test('worklet oscillator reports ENDED after note release', async ({
  page,
}) => {
  const endedLogs: string[] = [];
  const onendedLogs: string[] = [];
  page.on('console', message => {
    const text = message.text();
    if (text.includes(ENDED_LOG)) {
      endedLogs.push(text);
    }
    if (text.includes(ONENDED_LOG)) {
      onendedLogs.push(text);
    }
  });

  await page.goto('/');
  await expect(page.getByText(CONTROL_HINT)).toBeVisible();

  await page.keyboard.down(NOTE_KEY);
  await page.waitForTimeout(NOTE_PRESS_MS);
  await page.keyboard.up(NOTE_KEY);

  await expect
    .poll(() => endedLogs.length, { timeout: ENDED_TIMEOUT_MS })
    .toBeGreaterThan(0);
  await expect
    .poll(() => onendedLogs.length, { timeout: ENDED_TIMEOUT_MS })
    .toBeGreaterThan(0);
});
