export type WorkletMessage =
  | WorkletDestroyMessage
  | WorkletStartMessage
  | WorkletStopMessage
  | WorkletEndedMessage
  | ReportRenderTimeMessage;

export interface BaseWorkletMessage {
  type: string;
}

export interface WorkletDestroyMessage extends BaseWorkletMessage {
  type: 'DESTROY';
}

export interface WorkletStartMessage extends BaseWorkletMessage {
  type: 'START';
  when: number;
}

export interface WorkletStopMessage extends BaseWorkletMessage {
  type: 'STOP';
  when: number;
}

export interface WorkletEndedMessage extends BaseWorkletMessage {
  type: 'ENDED';
}

export interface ReportRenderTimeMessage extends BaseWorkletMessage {
  type: 'REPORT_RENDER_TIME';
  renderTimeMs: number;
}
