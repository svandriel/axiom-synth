export type WorkletMessage = WorkletDestroyMessage;

export interface BaseWorkletMessage {
  type: string;
}

export interface WorkletDestroyMessage extends BaseWorkletMessage {
  type: 'DESTROY';
}

export interface ReportRenderTimeMessage extends BaseWorkletMessage {
  type: 'REPORT_RENDER_TIME';
  renderTime: number;
}
