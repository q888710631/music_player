/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  electron: {
    ipcRenderer: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
      send: (channel: string, ...args: any[]) => void
      on: (channel: string, listener: (...args: any[]) => void) => void
      off: (channel: string, listener: (...args: any[]) => void) => void
    }
  }
  api: {
    getAudioMetadata: (data: { filename: string; data?: Uint8Array; filePath?: string }) => Promise<any>
    convertAudio: (data: { inputPath: string; outputPath: string; format: string }) => Promise<string>
    selectFolder: () => Promise<Array<{ name: string; path: string; size: number }>>
    readFileContent: (data: { filePath: string }) => Promise<Uint8Array>
    getSupportedFormats: () => Promise<string[]>
    openInFileExplorer: (filePath: string) => Promise<void>
  }
}
