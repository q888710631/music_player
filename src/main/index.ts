import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readdir, stat } from 'fs/promises'
import { extname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import FFmpegService from './ffmpegService'
import axios from 'axios'

// 初始化 FFmpeg 服务
const ffmpegService = new FFmpegService()

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 500,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.musicplayer.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 音频元数据提取处理
  ipcMain.handle('get-audio-metadata', async (_, { filename, data, filePath }) => {
    try {
      const metadata = await ffmpegService.getAudioMetadata(filename, data, filePath)
      return metadata
    } catch (error) {
      console.error('获取音频元数据失败:', error)
      throw error
    }
  })

  // 音频转换处理
  ipcMain.handle('convert-audio', async (_, { inputPath, outputPath, format }) => {
    try {
      const result = await ffmpegService.convertAudio(inputPath, outputPath, format)
      return result
    } catch (error) {
      console.error('音频转换失败:', error)
      throw error
    }
  })

  // 获取支持的音频格式
  ipcMain.handle('get-supported-formats', async () => {
    return ffmpegService.getSupportedFormats()
  })

  // 选择文件夹并扫描音频文件
  ipcMain.handle('select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择包含音乐文件的文件夹'
      })

      if (result.canceled || !result.filePaths.length) {
        return []
      }

      const folderPath = result.filePaths[0]
      const audioFiles = await scanFolderForAudioFiles(folderPath)

      return audioFiles
    } catch (error) {
      console.error('选择文件夹失败:', error)
      throw new Error(`选择文件夹失败: ${error}`)
    }
  })

  // 选择单个或多个音频文件
  ipcMain.handle('select-files', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: '选择音频文件',
        filters: [
          {
            name: '音频文件',
            extensions: ['mp3', 'wav', 'flac', 'ape', 'aac', 'm4a', 'ogg', 'webm']
          },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePaths.length) {
        return []
      }

      // 获取文件的详细信息
      const { stat } = await import('fs/promises')
      const { basename } = await import('path')

      const audioFiles = []

      for (const filePath of result.filePaths) {
        try {
          const fileStat = await stat(filePath)
          audioFiles.push({
            name: basename(filePath),
            path: filePath,
            size: fileStat.size
          })
        } catch (err) {
          console.warn(`无法访问文件 ${filePath}:`, err)
        }
      }

      return audioFiles
    } catch (error) {
      console.error('选择文件失败:', error)
      throw new Error(`选择文件失败: ${error}`)
    }
  })

  // 读取文件内容
  ipcMain.handle('read-file-content', async (_, { filePath }) => {
    try {
      const fileContent = await ffmpegService.readFileContent(filePath)
      return fileContent
    } catch (error) {
      console.error('读取文件内容失败:', error)
      throw new Error(`读取文件内容失败: ${error}`)
    }
  })

  // 在文件管理器中打开文件
  ipcMain.handle('open-in-file-explorer', async (_, filePath: string) => {
    try {
      // 使用 Electron 的 shell.showItemInFolder() 方法
      // 这个方法会打开文件所在目录并选中文件
      // 跨平台支持：Windows、macOS、Linux
      shell.showItemInFolder(filePath)
    } catch (error) {
      console.error('打开文件管理器失败:', error)
      throw new Error(`打开文件管理器失败: ${error}`)
    }
  })

  // 读取歌词文件 (.lrc)
  ipcMain.handle('read-lyrics-file', async (_, lrcFilePath: string) => {
    try {
      const { readFile } = await import('fs/promises')
      const { existsSync } = await import('fs')
      const chardet = (await import('chardet')).default
      const iconv = (await import('iconv-lite')).default

      // 检查歌词文件是否存在
      if (!existsSync(lrcFilePath)) {
        return null
      }

      // 读取原始 Buffer（不要指定编码）
      const buffer = await readFile(lrcFilePath)

      // 自动检测编码
      let encoding = chardet.detect(buffer)

      // 统一格式
      if (encoding) {
        encoding = encoding.toLowerCase()
      }

      // 兜底策略
      if (!encoding || encoding === 'ascii') {
        encoding = 'utf-8'
      }

      // 解码
      let lyricsContent = iconv.decode(buffer, encoding)

      // 去除 BOM
      lyricsContent = lyricsContent.replace(/^\uFEFF/, '')

      return lyricsContent

    } catch (error: any) {
      console.error('读取歌词文件失败:', error)
      throw new Error(`读取歌词文件失败: ${error?.message}`)
    }
  })

  // 从 FLAC 文件提取内嵌歌词
  ipcMain.handle('read-flac-lyrics', async (_, audioFilePath: string) => {
    try {
      const { extname } = await import('path')
      const ext = extname(audioFilePath).toLowerCase()

      // 只处理 FLAC 文件
      if (ext !== '.flac') {
        return null
      }

      const lyrics = await ffmpegService.getFlacLyrics(audioFilePath)
      return lyrics

    } catch (error: any) {
      console.error('读取 FLAC 歌词失败:', error)
      // 不抛出错误，返回 null 让调用者回退到 .lrc 文件
      return null
    }
  })

  // 通过 URL 获取页面内容
  ipcMain.handle('fetch-url', async (_, url: string) => {
    return await fetchUrl(url);
  })

  // 保存文件内容
  ipcMain.handle('save-file', async (_, { filePath, content }) => {
    try {
      const { writeFile } = await import('fs/promises')
      await writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error: any) {
      console.error('保存文件失败:', error)
      throw new Error(`保存文件失败: ${error?.message}`)
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前清理
app.on('before-quit', async () => {
  try {
    await ffmpegService.cleanup()
  } catch (error) {
    console.error('清理 FFmpeg 服务失败:', error)
  }
})

// 扫描文件夹查找音频文件
async function scanFolderForAudioFiles(folderPath: string): Promise<
  Array<{
    name: string
    path: string
    size: number
  }>
> {
  const supportedExtensions = ['.mp3', '.wav', '.flac', '.ape', '.aac', '.m4a', '.ogg', '.webm']
  const audioFiles: Array<{ name: string; path: string; size: number }> = []

  try {
    const files = await readdir(folderPath)

    for (const file of files) {
      const filePath = join(folderPath, file)

      try {
        const fileStat = await stat(filePath)

        if (fileStat.isFile()) {
          const ext = extname(file).toLowerCase()
          if (supportedExtensions.includes(ext)) {
            audioFiles.push({
              name: file,
              path: filePath,
              size: fileStat.size
            })
          }
        } else if (fileStat.isDirectory()) {
          // 递归扫描子文件夹（可选）
          const subFolderFiles = await scanFolderForAudioFiles(filePath)
          audioFiles.push(...subFolderFiles)
        }
      } catch (fileError) {
        // 忽略无法访问的文件
        console.warn(`无法访问文件 ${filePath}:`, fileError)
      }
    }

    return audioFiles
  } catch (error) {
    console.error('扫描文件夹失败:', error)
    throw new Error(`扫描文件夹失败: ${error}`)
  }
}


async function fetchUrl(url: string): Promise<any> {
  try {
    const response = await axios.get(url, {
      timeout: 10000, // 10秒超时
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data // 返回页面 body 内容
    }
  } catch (error: any) {
    console.error('获取 URL 内容失败:', error)
    throw new Error(`获取 URL 内容失败: ${error?.message}`)
  }
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
