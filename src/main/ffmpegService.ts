import { app } from 'electron'
import { join } from 'path'
import { writeFile, unlink, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'

// 设置 ffmpeg 路径
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

interface AudioMetadata {
  title?: string
  artist?: string
  album?: string
  duration?: number
  bitrate?: number
  sampleRate?: number
  channels?: number
  format?: string
}

class FFmpegService {
  private tempDir: string

  constructor() {
    // 创建临时目录
    this.tempDir = join(app.getPath('temp'), 'music-player')
    this.ensureTempDir()
  }

  private async ensureTempDir(): Promise<void> {
    try {
      if (!existsSync(this.tempDir)) {
        await mkdir(this.tempDir, { recursive: true })
      }
    } catch (error) {
      console.error('创建临时目录失败:', error)
    }
  }

  /**
   * 读取文件内容
   * APE 格式浏览器不支持，自动转换为 WAV
   */
  async readFileContent(filePath: string): Promise<Uint8Array> {
    try {
      const ext = filePath.toLowerCase().split('.').pop()
      if (ext === 'ape') {
        return await this.convertApeToWav(filePath)
      }
      const fileContent = await readFile(filePath)
      return new Uint8Array(fileContent)
    } catch (error) {
      console.error('读取文件内容失败:', error)
      throw new Error(`无法读取文件内容: ${error}`)
    }
  }

  /**
   * 将 APE 文件转换为 WAV（浏览器 Audio 元素不支持 APE 解码）
   */
  private async convertApeToWav(apeFilePath: string): Promise<Uint8Array> {
    const outputPath = join(this.tempDir, `ape-${Date.now()}.wav`)

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(apeFilePath)
          .output(outputPath)
          .format('wav')
          .on('end', () => resolve())
          .on('error', (err) => reject(new Error(`APE转WAV失败: ${err.message}`)))
          .run()
      })

      const wavData = await readFile(outputPath)
      return new Uint8Array(wavData)
    } finally {
      // 清理临时 WAV 文件
      await unlink(outputPath).catch(() => {})
    }
  }

  /**
   * 获取音频元数据
   */
  async getAudioMetadata(filename: string, data?: Uint8Array, filePath?: string): Promise<AudioMetadata> {
    try {
      let tempFilePath: string
      const needsCleanup = !filePath // 只有当我们创建临时文件时才需要清理

      if (filePath) {
        // 直接使用文件路径
        tempFilePath = filePath
      } else if (data) {
        // 从内存数据创建临时文件
        tempFilePath = join(this.tempDir, `temp_${Date.now()}_${filename}`)
        const buffer = Buffer.from(data)
        await writeFile(tempFilePath, buffer)
      } else {
        throw new Error('需要提供数据或文件路径')
      }

      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(tempFilePath, (err, metadata) => {
          // 只有当我们创建临时文件时才清理
          if (needsCleanup) {
            unlink(tempFilePath).catch(() => {})
          }

          if (err) {
            console.error('FFprobe 错误:', err)
            reject(new Error(`无法分析音频文件: ${err.message}`))
            return
          }

          try {
            const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio')
            const format = metadata.format

            const result: AudioMetadata = {
              title: format.tags?.title,
              artist: format.tags?.artist,
              album: format.tags?.album,
              duration: format.duration,
              bitrate: format.bit_rate ? parseInt(format.bit_rate) : undefined,
              sampleRate: audioStream?.sample_rate,
              channels: audioStream?.channels,
              format: format.format_name
            }

            resolve(result)
          } catch (parseError) {
            reject(new Error(`解析元数据失败: ${parseError}`))
          }
        })
      })
    } catch (error) {
      console.error('获取音频元数据失败:', error)
      throw new Error(`处理音频文件时出错: ${error}`)
    }
  }

  /**
   * 转换音频格式
   */
  async convertAudio(inputPath: string, outputPath: string, format: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .output(outputPath)
        .format(format)
        .on('end', () => {
          resolve(outputPath)
        })
        .on('error', (err) => {
          console.error('转换音频失败:', err)
          reject(new Error(`音频转换失败: ${err.message}`))
        })
        .on('progress', (progress) => {
          // 可以在这里发送进度更新到渲染进程
          console.log('转换进度:', Math.round(progress.percent) + '%')
        })

      command.run()
    })
  }

  /**
   * 从 FLAC 文件提取内嵌歌词
   */
  async getFlacLyrics(filePath: string): Promise<string | null> {
    try {
      console.log('提取 FLAC 歌词，文件路径:', filePath)

      // 不使用 shell 模式，直接传递参数数组，避免路径被 shell 错误解析
      const { spawn } = await import('child_process')

      return new Promise((resolve) => {
        const ffprobe = spawn('ffprobe', [
          '-hide_banner',
          '-show_format',
          '-print_format',
          'json',
          filePath  // 直接传递，spawn 会正确处理
        ], {
          windowsHide: true,
          shell: false  // 关闭 shell 模式，避免路径被错误解析
        })

        let stdout = ''
        let stderr = ''

        ffprobe.stdout.on('data', (data) => {
          stdout += data.toString('utf8')
        })

        ffprobe.stderr.on('data', (data) => {
          stderr += data.toString('utf8')
        })

        ffprobe.on('close', (code) => {
          if (code !== 0) {
            console.error('FFprobe 执行失败，退出码:', code)
            if (stderr) {
              console.error('错误信息:', stderr)
            }
            resolve(null)
            return
          }

          if (!stdout || stdout.trim() === '') {
            console.log('FFprobe 返回空输出')
            resolve(null)
            return
          }

          try {
            const metadata = JSON.parse(stdout)
            const tags = metadata.format?.tags || {}

            console.log('找到的标签:', Object.keys(tags))

            // 尝试读取常见的歌词标签
            const lyrics = tags.LYRICS ||
                           tags.lyrics ||
                           tags.Lyrics ||
                           tags['LYRICSTEXT'] ||
                           tags.lyricstext ||
                           tags.UNSYNCEDLYRICS ||
                           tags.unsyncedlyrics ||
                           tags['unsynced lyrics'] ||
                           null

            if (lyrics && lyrics.length > 10) {
              console.log('✅ 成功提取 FLAC 歌词，长度:', lyrics.length)
              console.log('📝 歌词预览（前200字符）:', lyrics.substring(0, 200))
              resolve(lyrics)
            } else if (lyrics) {
              console.log('⚠️ 歌词内容过短（长度:', lyrics.length, '），使用外部 .lrc 文件')
              resolve(null)
            } else {
              console.log('❌ 未找到 FLAC 内嵌歌词')
              resolve(null)
            }
          } catch (parseError) {
            console.error('解析 FFprobe JSON 输出失败:', parseError)
            console.error('原始输出:', stdout.substring(0, 500))
            resolve(null)
          }
        })

        ffprobe.on('error', (err) => {
          console.error('启动 FFprobe 失败:', err.message)
          console.error('错误代码:', (err as any).code)
          resolve(null)
        })
      })
    } catch (error) {
      console.error('提取 FLAC 歌词失败:', error)
      return null
    }
  }

  /**
   * 获取支持的音频格式
   */
  getSupportedFormats(): string[] {
    return ['mp3', 'wav', 'flac', 'ape', 'aac', 'm4a', 'ogg', 'webm']
  }

  /**
   * 清理临时文件
   */
  async cleanup(): Promise<void> {
    try {
      // 这里可以实现临时文件的清理逻辑
      console.log('清理临时文件')
    } catch (error) {
      console.error('清理临时文件失败:', error)
    }
  }
}

export default FFmpegService