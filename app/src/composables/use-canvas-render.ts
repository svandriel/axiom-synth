import { onMounted, onUnmounted, watch, type Ref } from 'vue';

/** Target frames per second for canvas render loops. */
export const RENDER_FPS_CAP = 30;
/** Upper bound on device-pixel-ratio used when sizing canvases. */
export const RENDER_DPR_CAP = 1.5;

const MILLISECONDS_PER_SECOND = 1000;
const TIMING_LOG_INTERVAL_MS = 1000;

export interface RenderSize {
  width: number;
  height: number;
  dpr: number;
}

export interface CanvasRenderOptions {
  label: string;
  paused: Ref<boolean>;
  prepare?: (context: CanvasRenderingContext2D, size: RenderSize) => void;
  render: (context: CanvasRenderingContext2D, size: RenderSize) => void;
}

export function useCanvasRender(
  canvas: Ref<HTMLCanvasElement | null>,
  options: CanvasRenderOptions,
): void {
  const frameIntervalMs = MILLISECONDS_PER_SECOND / RENDER_FPS_CAP;
  let context: CanvasRenderingContext2D | null = null;
  let frameRequestId: number | undefined = undefined;
  let lastFrameTimestamp = 0;
  let lastTimingLog = 0;
  let accumulatedRenderMs = 0;
  let renderedFrames = 0;
  let mounted = false;
  let size: RenderSize = { width: 0, height: 0, dpr: 1 };

  function fit(): void {
    const element = canvas.value;
    const parent = element?.parentElement;
    if (!element || !parent) {
      size = { width: 0, height: 0, dpr: 1 };
      return;
    }
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(RENDER_DPR_CAP, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
    }
    size = { width, height, dpr };
    context = element.getContext('2d');
    if (context) {
      options.prepare?.(context, size);
    }
  }

  function logTiming(elapsedMs: number): void {
    const now = performance.now();
    if (now - lastTimingLog < TIMING_LOG_INTERVAL_MS) {
      return;
    }
    if (import.meta.env.DEV) {
      const average = accumulatedRenderMs / renderedFrames;
      console.log(
        `[render] ${options.label} last=${elapsedMs.toFixed(2)}ms avg=${average.toFixed(2)}ms frames=${renderedFrames}`,
      );
    }
    lastTimingLog = now;
    accumulatedRenderMs = 0;
    renderedFrames = 0;
  }

  function draw(): void {
    if (!context) {
      return;
    }
    const startedAt = performance.now();
    options.render(context, size);
    const elapsedMs = performance.now() - startedAt;
    accumulatedRenderMs += elapsedMs;
    renderedFrames += 1;
    logTiming(elapsedMs);
  }

  function loop(timestamp: number): void {
    frameRequestId = requestAnimationFrame(loop);
    if (timestamp - lastFrameTimestamp < frameIntervalMs) {
      return;
    }
    lastFrameTimestamp = timestamp;
    draw();
  }

  function start(): void {
    if (frameRequestId !== undefined) {
      return;
    }
    lastFrameTimestamp = 0;
    frameRequestId = requestAnimationFrame(loop);
  }

  function stop(): void {
    if (frameRequestId === undefined) {
      return;
    }
    cancelAnimationFrame(frameRequestId);
    frameRequestId = undefined;
  }

  function onResize(): void {
    fit();
  }

  onMounted(() => {
    mounted = true;
    fit();
    window.addEventListener('resize', onResize);
    if (!options.paused.value) {
      start();
    }
  });

  onUnmounted(() => {
    mounted = false;
    window.removeEventListener('resize', onResize);
    stop();
  });

  watch(options.paused, isPaused => {
    if (!mounted) {
      return;
    }
    if (isPaused) {
      stop();
    } else {
      start();
    }
  });
}
