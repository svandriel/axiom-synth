/**
 * A sink notified when audio activity begins, so a host (e.g. AudioEngine) can
 * wake gated DSP synchronously before the first render quantum of a new note.
 */
export interface ActivitySink {
  activate(): void;
}
