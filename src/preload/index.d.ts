import { ElectronAPI } from '@electron-toolkit/preload'

export interface API {
  getAudioMetadata: (data: { filename: string; data?: Uint8Array; filePath?: string }) => Promise<any>
  convertAudio: (data: { inputPath: string; outputPath: string; format: string }) => Promise<string>
  selectFolder: () => Promise<Array<{ name: string; path: string; size: number }>>
  readFileContent: (data: { filePath: string }) => Promise<Uint8Array>
  getSupportedFormats: () => Promise<string[]>
  openInFileExplorer: (filePath: string) => Promise<void>
  readLyricsFile: (lrcFilePath: string) => Promise<string | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
