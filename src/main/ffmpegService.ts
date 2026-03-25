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
   */
  async readFileContent(filePath: string): Promise<Uint8Array> {
    try {
      const fileContent = await readFile(filePath)
      return new Uint8Array(fileContent)
    } catch (error) {
      console.error('读取文件内容失败:', error)
      throw new Error(`无法读取文件内容: ${error}`)
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
        .audioFormat(format)
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
   * 获取支持的音频格式
   */
  getSupportedFormats(): string[] {
    return ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'webm']
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