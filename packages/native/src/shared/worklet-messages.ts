export type WorkletMessage = WorkletDestroyMessage | ReportRenderTimeMessage;

export interface BaseWorkletMessage {
  type: string;
}

export interface WorkletDestroyMessage extends BaseWorkletMessage {
  type: 'DESTROY';
}

export interface ReportRenderTimeMessage extends BaseWorkletMessage {
  type: 'REPORT_RENDER_TIME';
  renderTimeMs: number;
}
