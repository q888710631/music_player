import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // 音频元数据提取
  getAudioMetadata: (data: { filename: string; data?: Uint8Array; filePath?: string }) =>
    ipcRenderer.invoke('get-audio-metadata', data),

  // 文件转换功能（可选）
  convertAudio: (data: { inputPath: string; outputPath: string; format: string }) =>
    ipcRenderer.invoke('convert-audio', data),

  // 选择文件夹并扫描音频文件
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // 选择单个或多个音频文件
  selectFiles: () => ipcRenderer.invoke('select-files'),

  // 读取文件内容
  readFileContent: (data: { filePath: string }) =>
    ipcRenderer.invoke('read-file-content', data),

  // 获取支持的音频格式
  getSupportedFormats: () => ipcRenderer.invoke('get-supported-formats'),

  // 在文件管理器中打开文件
  openInFileExplorer: (filePath: string) =>
    ipcRenderer.invoke('open-in-file-explorer', filePath),

  // 读取歌词文件
  readLyricsFile: (lrcFilePath: string) =>
    ipcRenderer.invoke('read-lyrics-file', lrcFilePath),

  // 从 FLAC 文件提取内嵌歌词
  readFlacLyrics: (audioFilePath: string) =>
    ipcRenderer.invoke('read-flac-lyrics', audioFilePath),

  // 通过 URL 获取页面内容
  fetchUrl: (url: string) => ipcRenderer.invoke('fetch-url', url),

  // 保存文件内容
  saveFile: (data: { filePath: string; content: string }) =>
    ipcRenderer.invoke('save-file', data)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
