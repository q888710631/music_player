<template>
  <el-dialog
    v-model="dialogVisible"
    width="450px"
    :modal="true"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    @close="handleClose"
    class="lyrics-dialog"
  >
    <template #header>
      <div class="lyrics-dialog-header">
        <span class="dialog-title">
          {{ previewLyric ? '歌词预览' : searchView ? '搜索歌词' : '歌词' }}
        </span>
        <span>
          <template v-if="previewLyric">
            <el-link @click.prevent="backToSearch">返回搜索</el-link>
            <el-divider direction="vertical" />
            <el-link type="primary" @click.prevent="confirmSaveLyric">确认保存</el-link>
          </template>
          <template v-else>
            <template v-if="!searchView && lyricsContent">
              <el-link @click.prevent="adjustAdd">推迟</el-link>&nbsp;
              <el-link @click.prevent="adjustSub">提前</el-link>&nbsp;
              <el-select v-model="adjustMs" style="width: 80px" size="small">
                <el-option label="0.5秒" value="500" />
                <el-option label="1秒" value="1000" /> </el-select
              >&nbsp;
            </template>
            <el-link @click.prevent="searchLrcShow" v-if="!searchView">查找歌词</el-link>
            <el-link @click.prevent="searchView = false" v-else>返回</el-link>
          </template>
        </span>
      </div>
    </template>

    <template v-if="searchView">
      <div class="search-view">
        <!-- 原始文件名显示 -->
        <div v-if="originalFileName" class="original-file-name">
          <el-icon><Document /></el-icon>
          <span class="file-label">当前文件：</span>
          <span class="file-name">{{ originalFileName }}</span>
        </div>

        <div class="search-container">
          <el-input
            v-model="searchTitle"
            placeholder="歌曲名称"
            clearable
            @keyup.enter="searchLrc"
            style="flex: 1"
          />
          <el-input
            v-model="searchArtist"
            placeholder="歌手名称"
            clearable
            @keyup.enter="searchLrc"
            style="flex: 1"
          />
          <el-button type="primary" @click="searchLrc" :loading="searchLoading">搜索</el-button>
        </div>

        <!-- 搜索结果列表 -->
        <div v-if="searchLoading" class="search-loading">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>正在搜索...</span>
        </div>

        <div v-else-if="searchError" class="search-error">
          <el-icon><WarningFilled /></el-icon>
          <span>{{ searchError }}</span>
        </div>

        <div v-else-if="searchResults.length > 0" class="search-results" ref="searchResultsEl">
          <div
            v-for="(item, index) in searchResults"
            :key="index"
            class="search-result-item"
            @click="selectLyric(item)"
          >
            <div class="result-info">
              <div class="result-title">{{ item.title }}</div>
              <div class="result-meta">
                <span class="result-artist">{{ item.artist || '未知歌手' }}</span>
                <span class="result-duration" v-if="item.duration">{{ formatDuration(item.duration) }}</span>
              </div>
            </div>
            <el-icon class="result-arrow"><ArrowRight /></el-icon>
          </div>
        </div>

        <div v-else-if="!searchLoading && !searchError" class="search-hint">
          <el-icon><Search /></el-icon>
          <span>输入歌曲名称和歌手搜索歌词（歌手可选）</span>
        </div>
      </div>
    </template>

    <!-- 歌词预览视图 -->
    <template v-else-if="previewLyric">
      <div class="lyrics-content">
        <div class="preview-notice">
          <el-icon><View /></el-icon>
          <span>预览模式 - 请确认歌词内容后点击"确认保存"</span>
        </div>
        <div class="lyrics-container" ref="lyricsContainer">
          <div v-for="(line, index) in parsedLyrics" :key="index" :class="['lyrics-line']">
            {{ line.text }}
          </div>
          <div v-if="parsedLyrics.length === 0" class="plain-text">
            {{ previewLyricContent }}
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在加载歌词...</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ error }}</span>
      </div>

      <div v-else-if="!lyricsContent" class="no-lyrics-container">
        <el-icon><DocumentRemove /></el-icon>
        <span>未找到歌词文件</span>
        <span class="hint">请确保歌词文件与音乐文件在同一目录下,且文件名相同(扩展名为 .lrc)</span>
      </div>

      <div v-else class="lyrics-content">
        <div class="lyrics-container" ref="lyricsContainer">
          <div
            v-for="(line, index) in parsedLyrics"
            :key="index"
            :class="['lyrics-line', { active: isLineActive(line.time) }]"
            :style="{ color: isLineActive(line.time) ? activeColor : '' }"
            @click="seekToLine(line.time)"
          >
            {{ line.text }}
          </div>
          <div v-if="parsedLyrics.length === 0" class="plain-text">
            {{ lyricsContent }}
          </div>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  Loading,
  WarningFilled,
  DocumentRemove,
  ArrowRight,
  Search,
  View,
  Document,
  Clock
} from '@element-plus/icons-vue'

interface LyricLine {
  time: number // 时间,单位:秒
  text: string // 歌词文本
}

interface Props {
  visible: boolean
  audioFilePath?: string
  currentTime?: number
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'seek', time: number): void
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  currentTime: 0
})

const emit = defineEmits<Emits>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const lyricsContent = ref<string>('')
const parsedLyrics = ref<LyricLine[]>([])
const loading = ref(false)
const error = ref('')
const lyricsContainer = ref<HTMLElement>()
const activeColor = ref('#409eff')

// 解析LRC歌词文件
const parseLrc = (lrc: string): LyricLine[] => {
  const lines = lrc.split('\n')
  const lyrics: LyricLine[] = []

  // LRC时间标签正则: [mm:ss.xx] 或 [mm:ss] 或 [m:ss.xx]
  const timeRegex = /\[(\d+):(\d+)(?:\.(\d+))?\]/g

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // 提取所有时间标签和文本
    const matches = [...trimmedLine.matchAll(timeRegex)]
    const text = trimmedLine.replace(timeRegex, '').trim()

    if (matches.length > 0 && text) {
      for (const match of matches) {
        const minutes = parseInt(match[1])
        const seconds = parseInt(match[2])
        const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0

        const time = minutes * 60 + seconds + milliseconds / 1000
        lyrics.push({ time, text })
      }
    } else if (text && !trimmedLine.startsWith('[')) {
      // 没有时间标签的文本行
      lyrics.push({ time: -1, text })
    }
  }

  // 按时间排序
  lyrics.sort((a, b) => a.time - b.time)

  return lyrics
}

// 获取歌词文件路径
const getLyricsFilePath = (audioPath: string): string => {
  // 将音频文件扩展名替换为 .lrc
  const lastDotIndex = audioPath.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return audioPath.substring(0, lastDotIndex) + '.lrc'
  }
  return audioPath + '.lrc'
}

// 加载歌词
const loadLyrics = async () => {
  if (!props.audioFilePath) {
    error.value = '缺少音频文件路径'
    return
  }

  loading.value = true
  error.value = ''
  lyricsContent.value = ''
  parsedLyrics.value = []

  try {
    let content: string | null = null

    // 优先尝试读取外部 .lrc 文件
    const lrcPath = getLyricsFilePath(props.audioFilePath)
    content = await window.api.readLyricsFile(lrcPath)
    if (content) {
      console.log('✅ 使用外部 .lrc 文件歌词')
    } else {
      // 回退到 FLAC 内嵌歌词
      const flacLyrics = await window.api.readFlacLyrics(props.audioFilePath)
      if (flacLyrics) {
        console.log('✅ 使用 FLAC 内嵌歌词')
        content = flacLyrics
      }
    }

    if (!content) {
      // 没有找到歌词
      lyricsContent.value = ''
      parsedLyrics.value = []
    } else {
      lyricsContent.value = content
      parsedLyrics.value = parseLrc(content)
    }
  } catch (err) {
    console.error('加载歌词失败:', err)
    error.value = '加载歌词失败: ' + (err as Error).message
  } finally {
    loading.value = false
  }
}

// 判断某行歌词是否应该高亮
const isLineActive = (lineTime: number): boolean => {
  if (lineTime < 0 || !props.currentTime) return false

  // 找到当前应该显示的歌词行
  const activeLineIndex = parsedLyrics.value.findIndex((line, index) => {
    const nextLine = parsedLyrics.value[index + 1]
    return props.currentTime >= line.time && (!nextLine || props.currentTime < nextLine.time)
  })

  if (activeLineIndex === -1) return false

  return lineTime === parsedLyrics.value[activeLineIndex].time
}

// 点击歌词行跳转
const seekToLine = (time: number) => {
  if (time >= 0) {
    emit('seek', time)
  }
}

// 滚动到当前歌词
const scrollToActiveLine = () => {
  if (!lyricsContainer.value) return

  const activeLine = lyricsContainer.value.querySelector('.lyrics-line.active')
  if (!activeLine) return

  const containerHeight = lyricsContainer.value.offsetHeight
  const lineTop = (activeLine as HTMLElement).offsetTop
  const lineHeight = (activeLine as HTMLElement).offsetHeight

  // 计算滚动位置,使当前歌词显示在容器中间
  const scrollTop = lineTop - containerHeight / 2 + lineHeight / 2

  lyricsContainer.value.scrollTo({
    top: scrollTop,
    behavior: 'smooth'
  })
}

// 监听对话框打开
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      loadLyrics()
    }
  }
)

// 监听音频文件路径变化
watch(
  () => props.audioFilePath,
  () => {
    if (props.visible) {
      loadLyrics()
    }
  }
)

// 监听播放时间变化,更新滚动
watch(
  () => props.currentTime,
  () => {
    if (props.visible && parsedLyrics.value.length > 0) {
      nextTick(() => {
        scrollToActiveLine()
      })
    }
  }
)

const handleClose = () => {
  // 重置搜索和预览状态
  searchView.value = false
  previewLyric.value = false
  searchTitle.value = ''
  searchArtist.value = ''
  searchResults.value = []
  searchError.value = ''
  previewLyricContent.value = ''
  currentLyricId.value = ''

  dialogVisible.value = false
}

/**
 * 调整歌词
 */
const adjustMs = ref<string>('500')
const adjustAdd = () => {
  if (!parsedLyrics.value || parsedLyrics.value.length === 0) {
    error.value = '没有可调整的歌词'
    return
  }

  const offset = parseInt(adjustMs.value) / 1000 // 转换为秒

  // 调整所有歌词行的时间
  parsedLyrics.value = parsedLyrics.value.map((line) => ({
    ...line,
    time: line.time >= 0 ? line.time + offset : line.time // 保留无时间标签的行(time: -1)
  }))

  // 重新生成 LRC 格式内容
  lyricsContent.value = generateLrcContent(parsedLyrics.value)

  // 自动保存到文件
  saveLyricsToFile(lyricsContent.value)

  console.log(`歌词已推迟 ${adjustMs.value} 毫秒`)
}

const adjustSub = () => {
  if (!parsedLyrics.value || parsedLyrics.value.length === 0) {
    error.value = '没有可调整的歌词'
    return
  }

  const offset = parseInt(adjustMs.value) / 1000 // 转换为秒

  // 调整所有歌词行的时间
  parsedLyrics.value = parsedLyrics.value.map((line) => ({
    ...line,
    time: line.time >= 0 ? Math.max(0, line.time - offset) : line.time // 确保时间不为负，保留无时间标签的行
  }))

  // 重新生成 LRC 格式内容
  lyricsContent.value = generateLrcContent(parsedLyrics.value)

  // 自动保存到文件
  saveLyricsToFile(lyricsContent.value)

  console.log(`歌词已提前 ${adjustMs.value} 毫秒`)
}

// 从解析后的歌词数组生成 LRC 格式内容
const generateLrcContent = (lyrics: LyricLine[]): string => {
  // 按时间排序
  const sortedLyrics = [...lyrics].sort((a, b) => a.time - b.time)

  const lines: string[] = []

  for (const lyric of sortedLyrics) {
    if (lyric.time >= 0) {
      // 带时间标签的歌词
      const minutes = Math.floor(lyric.time / 60)
      const seconds = lyric.time % 60
      const milliseconds = Math.floor((lyric.time % 1) * 100)

      const timeTag = `[${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds)).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}]`
      lines.push(`${timeTag}${lyric.text}`)
    } else {
      // 纯文本行（无时间标签）
      lines.push(lyric.text)
    }
  }

  return lines.join('\n')
}

const searchView = ref<boolean>(false)
const previewLyric = ref<boolean>(false) // 歌词预览视图
const searchTitle = ref<string>('') // 歌曲名
const searchArtist = ref<string>('') // 歌手名
const originalFileName = ref<string>('') // 原始文件名
const searchResults = ref<any[]>([])
const searchLoading = ref(false)
const searchError = ref('')
const previewLyricContent = ref<string>('') // 预览的歌词内容
const currentLyricId = ref<string>('') // 当前歌词的ID（用于标识）
const searchResultsEl = ref<HTMLElement>() // 搜索结果列表容器
const searchResultsScrollTop = ref(0) // 保存搜索结果滚动位置

// 从歌词内容解析歌曲时长（单位：秒）
// 格式：取最后一条歌词，按逗号分割，取第二部分，格式为 mm:ss:xxx（分钟:秒钟:毫秒）
const parseLyricDuration = (lrc: string): number => {
  if (!lrc) return 0

  // 按行分割
  const lines = lrc.trim().split('\n')
  if (lines.length === 0) return 0

  // 取最后一行
  const lastLine = lines[lines.length - 1].trim()
  if (!lastLine) return 0

  // 按逗号分割，取第二部分
  const parts = lastLine.split(',')
  if (parts.length < 2) return 0

  const timePart = parts[1].trim() // 例如：00:21:700

  // 匹配格式 mm:ss:xxx 或 m:ss:xxx
  const timeMatch = timePart.match(/(\d+):(\d+):(\d+)/)
  if (!timeMatch) {
    console.log('时间格式不匹配:', timePart)
    return 0
  }

  const minutes = parseInt(timeMatch[1])
  const seconds = parseInt(timeMatch[2])
  const milliseconds = parseInt(timeMatch[3].padEnd(3, '0'))

  const duration = minutes * 60 + seconds + milliseconds / 1000
  console.log('解析时长:', timePart, '->', duration, '秒')

  return duration
}

// 格式化时长显示
const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '--:--'

  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)

  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

// 将API返回的歌词格式转换为标准LRC格式
// API格式: [00:00:160,00:01:930]歌词内容
// LRC格式: [00:00.16]歌词内容
const convertToLrcFormat = (apiLrc: string): string => {
  if (!apiLrc) return ''

  const lines = apiLrc.trim().split('\n')
  const lrcLines: string[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // 匹配格式: [mm:ss:xxx,mm:ss:xxx] 或 [mm:ss:xxx]
    const match = trimmedLine.match(/^\[(\d+):(\d+):(\d+)(?:,(\d+):(\d+):(\d+))?\](.*)$/)

    if (match) {
      // 取第一个时间（开始时间）
      const minutes = match[1]
      const seconds = match[2]
      const milliseconds = match[3].padEnd(3, '0') // 确保是3位数

      // 转换为 [mm:ss.xx] 格式（毫秒只取前2位）
      const timeTag = `[${minutes}:${seconds}.${milliseconds.substring(0, 2)}]`
      const text = match[7] ? match[7].trim() : ''

      lrcLines.push(`${timeTag}${text}`)
    } else {
      // 如果无法解析，保留原行
      lrcLines.push(trimmedLine)
    }
  }

  return lrcLines.join('\n')
}

/**
 * 搜索歌词-show
 */
const searchLrcShow = () => {
  searchView.value = true
  // 如果有音频文件路径，提取文件名作为默认搜索词
  if (props.audioFilePath) {
    const fileName = props.audioFilePath.split(/[/\\]/).pop() || ''
    // 保存原始文件名（含扩展名）
    originalFileName.value = fileName

    // 去除扩展名
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')

    // 按照 "歌手 - 歌曲名" 格式分割，-左边是歌手，右边是歌曲名
    if (nameWithoutExt.includes(' - ')) {
      const parts = nameWithoutExt.split(' - ')
      if (parts.length >= 2) {
        // 左边是歌手，右边是歌曲名
        searchArtist.value = parts[0].trim()
        searchTitle.value = parts[1].trim()
      } else {
        searchTitle.value = nameWithoutExt.trim()
      }
    } else {
      searchTitle.value = nameWithoutExt.trim()
    }

    // 去除多余的 + 号和其他特殊符号
    searchTitle.value = searchTitle.value
      .replace(/\+/g, '') // 去掉 + 号
      .replace(/_/g, ' ') // 下划线替换为空格
      .replace(/\s+/g, ' ') // 多个空格合并为一个
      .trim()

    searchArtist.value = searchArtist.value
      .replace(/\+/g, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
}

const searchLrc = async () => {
  if (!searchTitle.value?.trim()) {
    searchError.value = '请输入歌曲名称'
    return
  }

  searchLoading.value = true
  searchError.value = ''
  searchResults.value = []

  try {
    // 构建API请求URL
    const params = new URLSearchParams({
      title: searchTitle.value.trim(),
      od: 'desc'
    })

    if (searchArtist.value?.trim()) {
      params.append('artist', searchArtist.value.trim())
    }

    const apiUrl = `https://tools.rangotec.com/api/anon/lrc?${params.toString()}`

    console.log('API 请求:', apiUrl)

    const res = await window.api.fetchUrl(apiUrl)

    console.log('API 响应:', res)

    // 检查响应数据
    let jsonData = res.data

    // 如果 res.data 是字符串，需要解析
    if (typeof res.data === 'string') {
      jsonData = JSON.parse(res.data)
    }

    console.log('解析后的数据:', jsonData)

    if (jsonData && jsonData.code === 200 && jsonData.data) {
      let results = jsonData.data
      console.log('搜索结果:', results)

      if (results.length === 0) {
        searchError.value = '未找到相关歌词'
      } else {
        // 计算每条歌词的时长
        results = results.map((item: any) => ({
          ...item,
          duration: parseLyricDuration(item.lrc)
        }))

        // 按时长降序排序（时长长的排在前面）
        results.sort((a: any, b: any) => b.duration - a.duration)

        // 去重：规范化 lrc 后相似度比较，容忍转录时的微小差异（多/少一两个字等）
        const normalizeLrc = (lrc: string): string => {
          return (lrc || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/^﻿/, '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== '')
            .join('\n')
            .trim()
        }

        // Levenshtein 距离（仅用于长度相近的字符串）
        const levenshteinDistance = (a: string, b: string): number => {
          const lenA = a.length
          const lenB = b.length
          // 用单行数组节省内存（取较短者作为列数）
          if (lenA < lenB) return levenshteinDistance(b, a)
          // 现在 lenA >= lenB
          let prev = new Array<number>(lenB + 1)
          let curr = new Array<number>(lenB + 1)
          for (let j = 0; j <= lenB; j++) prev[j] = j
          for (let i = 1; i <= lenA; i++) {
            curr[0] = i
            for (let j = 1; j <= lenB; j++) {
              const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
              curr[j] = Math.min(
                prev[j] + 1,       // 删除
                curr[j - 1] + 1,   // 插入
                prev[j - 1] + cost // 替换
              )
            }
            ;[prev, curr] = [curr, prev]
          }
          return prev[lenB]
        }

        // 相似度：1 - 编辑距离 / 较长字符串长度，范围 [0, 1]
        const similarity = (a: string, b: string): number => {
          if (!a || !b) return 0
          const maxLen = Math.max(a.length, b.length)
          if (maxLen === 0) return 1
          return 1 - levenshteinDistance(a, b) / maxLen
        }

        const SIMILARITY_THRESHOLD = 0.92 // 相似度 >= 92% 视为同一份歌词

        // 调试日志
        console.log('===== 去重前 ====')
        results.forEach((item: any, idx: number) => {
          const norm = normalizeLrc(item.lrc)
          let hash = 0
          for (let i = 0; i < norm.length; i++) {
            hash = ((hash << 5) - hash + norm.charCodeAt(i)) | 0
          }
          console.log(
            `[${idx}] id=${item.id} title="${item.title}" artist="${item.artist}" duration=${item.duration}s hash=${hash} len=${norm.length}`,
            `\n  lrc_preview: ${norm.substring(0, 80)}`
          )
        })

        const keptNorms: string[] = [] // 已保留歌词的规范化文本
        const beforeCount = results.length
        results = results.filter((item: any, idx: number) => {
          const key = normalizeLrc(item.lrc)
          if (!key) {
            console.log(`[${idx}] ❌ 去重移除: id=${item.id} (lrc 为空)`)
            return false
          }

          // 与已保留的每条歌词做相似度比较
          for (let k = 0; k < keptNorms.length; k++) {
            const sim = similarity(key, keptNorms[k])
            if (sim >= SIMILARITY_THRESHOLD) {
              console.log(
                `[${idx}] ❌ 去重移除: id=${item.id} title="${item.title}" artist="${item.artist}" duration=${item.duration}s`,
                `(相似度 ${(sim * 100).toFixed(1)}% 与已保留的第${k}条)`
              )
              return false
            }
          }

          keptNorms.push(key)
          console.log(`[${idx}] ✅ 保留: id=${item.id} title="${item.title}" artist="${item.artist}" duration=${item.duration}s`)
          return true
        })

        console.log(`===== 去重结果: ${beforeCount} → ${results.length}（移除 ${beforeCount - results.length} 条）=====`)
        searchResults.value = results
      }
    } else {
      searchError.value = jsonData?.msg || '搜索失败，请稍后重试'
      console.log('响应数据格式不正确:', res)
    }
  } catch (err) {
    console.error('搜索歌词失败:', err)
    searchError.value = '搜索失败: ' + (err as Error).message
  } finally {
    searchLoading.value = false
  }
}

const selectLyric = async (item: any) => {
  try {
    console.log('选择歌词项:', item)

    // API返回的数据已经包含歌词内容，直接使用
    if (item.lrc) {
      // 转换为标准LRC格式用于预览
      const lrcContent = convertToLrcFormat(item.lrc)

      // 保存预览内容，但不保存到文件
      previewLyricContent.value = lrcContent
      currentLyricId.value = item.id

      // 解析歌词用于预览显示
      parsedLyrics.value = parseLrc(lrcContent)

      // 保存搜索结果滚动位置
      if (searchResultsEl.value) {
        searchResultsScrollTop.value = searchResultsEl.value.scrollTop
      }

      // 切换到预览视图（保留搜索结果，不清空）
      previewLyric.value = true
      searchView.value = false
    } else {
      searchError.value = '无法获取歌词内容'
    }
  } catch (err) {
    console.error('获取歌词失败:', err)
    searchError.value = '获取歌词失败: ' + (err as Error).message
  }
}

const saveLyricsToFile = async (content: string) => {
  if (!props.audioFilePath) return

  try {
    const lrcPath = getLyricsFilePath(props.audioFilePath)
    await window.api.saveFile({ filePath: lrcPath, content })
    console.log('歌词已保存到:', lrcPath)
  } catch (err) {
    console.error('保存歌词失败:', err)
  }
}

// 确认保存歌词
const confirmSaveLyric = async () => {
  if (!previewLyricContent.value) return

  try {
    // 转换为标准LRC格式
    const lrcContent = convertToLrcFormat(previewLyricContent.value)

    await saveLyricsToFile(lrcContent)

    // 保存成功后，将预览内容设置为正式歌词内容
    lyricsContent.value = lrcContent

    // 关闭预览视图
    previewLyric.value = false

    // 清空预览内容
    previewLyricContent.value = ''
    currentLyricId.value = ''

    console.log('歌词保存成功')
  } catch (err) {
    console.error('保存歌词失败:', err)
    searchError.value = '保存歌词失败: ' + (err as Error).message
  }
}

// 返回搜索结果
const backToSearch = () => {
  previewLyric.value = false
  previewLyricContent.value = ''
  currentLyricId.value = ''
  searchView.value = true

  // 恢复搜索结果滚动位置
  nextTick(() => {
    if (searchResultsEl.value && searchResultsScrollTop.value > 0) {
      searchResultsEl.value.scrollTop = searchResultsScrollTop.value
    }
  })
}
</script>

<style scoped>
.lyrics-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.lyrics-dialog :deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
  padding: 20px;
}

.loading-container,
.error-container,
.no-lyrics-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #909399;
  gap: 12px;
  text-align: center;
}

.loading-container .el-icon,
.error-container .el-icon,
.no-lyrics-container .el-icon {
  font-size: 48px;
}

.hint {
  font-size: 12px;
  color: #c0c4cc;
  margin-top: 8px;
  max-width: 400px;
}

.error-container {
  color: #f56c6c;
}

.lyrics-content .lyrics-container {
  max-height: 50vh;
  overflow-y: auto;
  scroll-behavior: smooth;
  padding: 20px 0;
}

.lyrics-content .lyrics-container::-webkit-scrollbar {
  width: 6px;
}

.lyrics-content .lyrics-container::-webkit-scrollbar-track {
  background: #f5f7fa;
  border-radius: 3px;
}

.lyrics-content .lyrics-container::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 3px;
}

.lyrics-content .lyrics-container::-webkit-scrollbar-thumb:hover {
  background: #c0c4cc;
}

.lyrics-line {
  padding: 12px 16px;
  font-size: 15px;
  line-height: 1.8;
  color: #606266;
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 6px;
}

.lyrics-line:hover {
  background-color: #f5f7fa;
}

.lyrics-line.active {
  font-size: 18px;
  font-weight: 600;
  color: #409eff;
  background-color: #ecf5ff;
  transform: scale(1.02);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.plain-text {
  padding: 16px;
  font-size: 14px;
  line-height: 2;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 预览提示 */
.preview-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.preview-notice .el-icon {
  font-size: 18px;
}

/* 搜索视图样式 */
.search-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 原始文件名显示 */
.original-file-name {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
  border-radius: 8px;
  border-right: 4px solid #409eff;
  font-size: 14px;
}

.original-file-name .el-icon {
  font-size: 18px;
  color: #409eff;
}

.original-file-name .file-label {
  font-weight: 600;
  color: #606266;
}

.original-file-name .file-name {
  flex: 1;
  color: #303133;
  font-family: 'Consolas', 'Monaco', monospace;
  word-break: break-all;
}

.search-container {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-loading,
.search-error,
.search-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #909399;
  gap: 12px;
}

.search-error {
  color: #f56c6c;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background-color: #f5f7fa;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.search-result-item:hover {
  background-color: #ecf5ff;
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.result-title {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.result-artist {
  font-size: 13px;
  color: #909399;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.result-duration {
  font-size: 13px;
  color: #67c23a;
  font-weight: 600;
  flex-shrink: 0;
}

.result-arrow {
  font-size: 20px;
  color: #c0c4cc;
  transition: color 0.3s ease;
}

.search-result-item:hover .result-arrow {
  color: #409eff;
}
</style>
