export interface ExtensionMetadata {
  uuid: string;
  name: string;
  description: string;
  version: number;
  'shell-version': string[];
  url?: string;
  'settings-schema'?: string;
  'gettext-domain'?: string;
}

export interface RecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  recordingProcess: any | null;
  startTime?: number;
  duration?: number;
}

export interface ExtensionSettings {
  'recording-duration': number;
  'keyboard-shortcut': string[];
  'copy-to-clipboard': boolean;
  'skip-preview': boolean;
}

export interface ProcessResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export interface SetupStatus {
  isSetup: boolean;
  pythonPath?: string;
  venvPath?: string;
  error?: string;
}