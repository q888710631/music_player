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
        <span class="dialog-title">歌词</span>
      </div>
    </template>
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
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Loading, WarningFilled, DocumentRemove } from '@element-plus/icons-vue'

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

  // LRC时间标签正则: [mm:ss.xx] 或 [mm:ss]
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g

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
    const lrcPath = getLyricsFilePath(props.audioFilePath)
    const content = await window.api.readLyricsFile(lrcPath)

    if (!content) {
      // 歌词文件不存在
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
  dialogVisible.value = false
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
</style>
