
export interface FormattedPost {
  title: string;
  content: string[];
  hashtags: string[];
  languageName: string;
}

export enum AppState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  RESULT = 'RESULT'
}

export enum RenderStatus {
  WAITING = 'WAITING',
  RENDERING = 'RENDERING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface RenderedVideo {
  blob: Blob;
  mimeType: string;
}
