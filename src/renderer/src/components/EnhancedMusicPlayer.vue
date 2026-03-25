<template>
  <div class="common-layout">
    <el-container style="height: 100vh">
      <!-- 顶部播放器 Header -->
      <el-header height="290px" style="padding-top: 16px">
        <!-- 当前播放信息 -->
        <div class="now-playing">
          <h2 class="track-title" v-if="currentTrack" @click="openFromPlaylist(currentIndex)">
            {{ currentTrack.filename || '未知标题' }}
          </h2>
          <h2 class="track-title" v-else>请选择音乐文件开始播放</h2>
        </div>

        <!-- 进度条 -->
        <div class="progress-section">
          <div class="time-display current-time">{{ formatDuration(currentTime) }}</div>
          <div
            class="progress-bar-container"
            @click="seekToPosition"
            @mousedown="startDragging"
            @mousemove="updateDragging"
            @mouseup="stopDragging"
            @mouseleave="stopDragging"
          >
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
              <div
                class="progress-handle"
                :style="{ left: progressPercentage + '%' }"
                v-show="currentTrack"
              ></div>
            </div>
          </div>
          <div class="time-display total-time">
            {{ formatDuration(currentTrack?.duration || 0) }}
          </div>
          <div class="float-right">
            <el-slider v-model="volume" vertical height="30px" />
          </div>
        </div>

        <!-- 播放控制 -->
        <div class="controls">
          <el-button
            @click="previousTrack"
            :disabled="!hasPrevious"
            icon="ArrowLeft"
            style="font-size: 25px"
          />
          <el-button
            @click="togglePlay"
            :disabled="!currentTrack"
            :icon="isPlaying ? 'VideoPause' : 'VideoPlay'"
            style="font-size: 25px"
          />
          <el-button
            @click="nextTrack"
            :disabled="!hasNext"
            icon="ArrowRight"
            style="font-size: 25px"
          />
          <el-button @click="toggleShuffle" :class="{ active: isShuffle }">
            <template v-if="isShuffle">随机</template>
            <template v-else>顺序</template>
          </el-button>
          <el-button @click="toggleRepeat" :class="{ active: repeatMode !== 'none' }">
            <template v-if="repeatMode === 'none'">单次播放</template>
            <template v-if="repeatMode === 'all'">全部循环</template>
            <template v-if="repeatMode === 'one'">单曲循环</template>
          </el-button>
          <el-button @click="toggleMute">
            <template v-if="isMuted || volume === 0">静音</template>
            <template v-else>放声</template>
          </el-button>
        </div>

        <!-- 工具栏 -->
        <div class="toolbar">
          <el-button @click="selectFiles" icon="Plus">添加文件</el-button>
          <el-button @click="selectFolder" icon="Folder">扫描文件夹</el-button>
          <el-button
            @click="clearPlaylist"
            :disabled="playlist.length === 0"
            type="danger"
            icon="Delete"
            >清空</el-button
          >
          <el-button
            @click="showLyricsDialog"
            :disabled="!currentTrack"
            type="primary"
            icon="Document"
            >歌词</el-button
          >

          <input
            type="file"
            ref="fileInput"
            @change="handleFileSelect"
            accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg"
            multiple
            style="display: none"
          />
        </div>

        <el-slider
          v-model="playbackRate"
          :step="0.1"
          :marks="marks"
          :min="0.6"
          :max="2"
          @change="changePlaybackRate(playbackRate)"
          style="padding: 10px 10px 40px 10px"
        />
        <div class="playlist-controls">
          <el-input
            v-model="searchTerm"
            placeholder="搜索歌曲、艺术家、专辑"
            style="flex: 1"
            clearable
          ></el-input>

          <el-tooltip content="点击定位到当前播放歌曲" placement="top">
            <div class="track-counter" @click="scrollToCurrentTrack">
              <span class="current-index">{{ currentIndex >= 0 ? currentIndex + 1 : 0 }}</span>
              <span class="separator">/</span>
              <span class="total-count">{{ playlist.length }}</span>
            </div>

          </el-tooltip>

          <!--          <div style="margin-left: 8px; display: flex; gap: 4px">-->
          <!--            <el-button @click="togglePlaybackRate">倍速{{ playbackRate }}x</el-button>-->
          <!--          </div>-->
        </div>

      </el-header>

      <!-- 下方播放列表 Main -->
      <el-main style="padding: 10px; height: calc(100vh - 300px); overflow: hidden">
        <!-- 虚拟表格播放列表 -->
        <div v-if="playlist.length > 0" style="height: 100%; width: 100%; overflow: hidden">
          <ElAutoResizer>
            <template #default="{ height, width }">
              <TableV2
                ref="tableRef"
                :columns="tableColumns"
                :data="tableData"
                :width="width"
                :height="height"
                :row-height="70"
                :estimated-row-height="70"
                :header-height="50"
                fixed
                :on-row-contextmenu="handleRowContextMenu"
              />
            </template>
          </ElAutoResizer>
        </div>

        <div v-else class="empty-playlist">
          <p style="font-size: 16px; font-weight: 500">📵 暂无音乐文件</p>
          <p style="font-size: 14px">点击上方"添加文件"或"扫描文件夹"按钮添加音乐</p>
        </div>
      </el-main>
    </el-container>

    <!-- 歌词弹窗 -->
    <LyricsDialog
      v-model:visible="lyricsDialogVisible"
      :audio-file-path="currentTrack?.path"
      :current-time="currentTime"
      @seek="handleLyricSeek"
    />
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  h,
  nextTick,
  reactive,
  toRaw,
  CSSProperties
} from 'vue'
import { ElMessage } from 'element-plus'
import { TableV2, ElAutoResizer } from 'element-plus'
import LyricsDialog from './LyricsDialog.vue'

interface Track {
  id: string
  filename: string
  title?: string
  artist?: string
  album?: string
  duration?: number
  size: number
  data?: Uint8Array
  cover?: string
  path?: string
}

interface Mark {
  style: CSSProperties
  label: string
}
type Marks = Record<number, Mark | string>

const marks = reactive<Marks>({
  0.7: '0.7',
  0.8: '0.8',
  0.9: '0.9',
  1.0: '⭐',
  1.1: '1.1',
  1.2: '1.2',
  1.5: '1.5',
  2: '2.0'
})

type RepeatMode = 'none' | 'one' | 'all'
type SortOrder = 'default' | 'addedAt'

const playlist = ref<Track[]>([])
const currentIndex = ref(-1)
const isPlaying = ref(false)
const volume = ref(100)
const currentTime = ref(0)
const progressPercentage = ref(0)
const isShuffle = ref(false)
const repeatMode = ref<RepeatMode>('all')
const sortOrder = ref<SortOrder>('addedAt')
const isDragging = ref(false)
const isMuted = ref(false)
const previousVolume = ref(70)

// 搜索和变速播放状态
const searchTerm = ref('')
const playbackRate = ref(1.0)
const isLoading = ref(false)
const loadingMessage = ref('')

// 歌词弹窗状态
const lyricsDialogVisible = ref(false)

const fileInput = ref<HTMLInputElement>()
const audioElement = ref<HTMLAudioElement | null>(null)
const tableRef = ref<any>(null)
let progressInterval: NodeJS.Timeout | null = null
let saveStateTimer: NodeJS.Timeout | null = null

/******************** localStorage 持久化 ********************/
const STORAGE_KEY = 'simple_music_player_state'

interface PersistedTrack {
  id: string
  filename: string
  title?: string
  artist?: string
  album?: string
  duration?: number
  size: number
  path?: string
}

interface PersistState {
  playlist: PersistedTrack[]
  currentIndex: number
  volume: number
  isMuted: boolean
  playbackRate: number
  repeatMode: RepeatMode
  isShuffle: boolean
  sortOrder: SortOrder
}

const saveState = () => {
  // 防抖：清除之前的定时器
  if (saveStateTimer) {
    clearTimeout(saveStateTimer)
  }

  // 设置新的定时器，延迟 500ms 保存
  saveStateTimer = setTimeout(() => {
    const state: PersistState = {
      playlist: playlist.value.map(({ data, ...rest }) => rest),
      currentIndex: currentIndex.value,
      volume: volume.value,
      isMuted: isMuted.value,
      playbackRate: playbackRate.value,
      repeatMode: repeatMode.value,
      isShuffle: isShuffle.value,
      sortOrder: sortOrder.value
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      console.error('保存状态失败:', error)
    }
  }, 500)
}

const restoreState = () => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return

  try {
    const state = JSON.parse(raw) as PersistState
    playlist.value = state.playlist ?? []
    currentIndex.value = state.currentIndex ?? -1
    volume.value = state.volume ?? 100
    isMuted.value = state.isMuted ?? false
    playbackRate.value = state.playbackRate ?? 1
    repeatMode.value = state.repeatMode ?? 'all'
    isShuffle.value = state.isShuffle ?? false
    sortOrder.value = state.sortOrder ?? 'addedAt'
  } catch (e) {
    console.error('restore state failed', e)
  }
}
/******************** 自动保存监听 ********************/
// 优化：精确监听，避免深度遍历大数组导致的性能问题
// 只监听数组引用变化和长度变化，不监听内部属性
watch(() => playlist.value.length, saveState)
watch(() => currentIndex.value, saveState)
watch([() => volume.value, () => isMuted.value], saveState)
watch(() => playbackRate.value, saveState)
watch([() => repeatMode.value, () => isShuffle.value, () => sortOrder.value], saveState)

// 在添加/删除歌曲时手动触发保存
const manualSaveState = () => {
  saveState()
}

// 越界兜底
watch(() => playlist.value.length, (length) => {
  if (length === 0) {
    currentIndex.value = -1
  } else if (currentIndex.value >= length) {
    currentIndex.value = length - 1
  }
})

// 判断是否是当前播放的歌曲
const isCurrentPlaying = (rowData: any): boolean => {
  if (currentIndex.value < 0) return false
  // 使用 toRaw 避免响应式访问，保持性能
  const rawPlaylist = toRaw(playlist.value)
  const currentTrack = rawPlaylist[currentIndex.value]
  return currentTrack && rowData.id === currentTrack.id
}

// 获取行样式（空对象，不添加背景和边框）
const getRowStyle = (rowData: any) => {
  return {}
}

// 获取序号单元格样式
const getIndexCellStyle = (rowData: any) => {
  return {
    textAlign: 'center',
    color: '#999',
    fontSize: '12px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    height: '70px'
  }
}

// 虚拟表格列定义
const tableColumns = computed(() => {
  // 计算动态宽度
  const indexWidth = 60
  const actionWidth = 80

  return [
    {
      title: '#',
      key: 'index',
      dataKey: 'index',
      width: indexWidth,
      cellRenderer: ({ rowData, rowIndex }: { rowData: any; rowIndex: number }) => {
        return h(
          'div',
          {
            style: {
              ...getRowStyle(rowData),
              ...getIndexCellStyle(rowData)
            },
            onClick: (e: Event) => {
              e.stopPropagation()
              const originalIndex = getOriginalIndex(rowIndex)
              playTrack(originalIndex)
            }
          },
          rowIndex + 1
        )
      }
    },
    {
      title: '歌曲名称',
      key: 'filename',
      dataKey: 'filename',
      width: 320, // 固定宽度，后续会用 flexGrow
      cellRenderer: ({ rowData, rowIndex }: { rowData: any; rowIndex: number }) => {
        return h(
          'div',
          {
            style: {
              ...getRowStyle(rowData),
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              overflow: 'hidden',
              paddingRight: '8px',
              cursor: 'pointer'
            },
            onClick: (e: Event) => {
              e.stopPropagation()
              const originalIndex = getOriginalIndex(rowIndex)
              playTrack(originalIndex)
            }
          },
          [
            h(
              'div',
              {
                style: {
                  fontSize: '14px',
                  fontWeight: isCurrentPlaying(rowData) ? '600' : '500',
                  color: isCurrentPlaying(rowData) ? '#409eff' : '#333',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginBottom: '3px'
                }
              },
              rowData.filename
            ),
            h(
              'div',
              {
                style: {
                  fontSize: '12px',
                  color: '#666'
                }
              },
              formatFileSize(rowData.size)
            )
          ]
        )
      }
    },
    {
      title: '',
      key: 'actions',
      dataKey: 'actions',
      width: actionWidth,
      cellRenderer: ({ rowData, rowIndex }: { rowData: any; rowIndex: number }) => {
        return h(
          'div',
          {
            style: {
              ...getRowStyle(rowData),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%'
            }
          },
          [
            h(
              'button',
              {
                onClick: (e: Event) => {
                  e.stopPropagation()
                  const originalIndex = getOriginalIndex(rowIndex)
                  removeFromPlaylist(originalIndex)
                },
                style: {
                  background: 'none',
                  border: 'none',
                  color: '#f56565',
                  cursor: 'pointer',
                  padding: '4px 4px',
                  borderRadius: '4px',
                  fontSize: '12px'
                },
                onMouseenter: (e: any) => {
                  e.target.style.backgroundColor = '#fee'
                },
                onMouseleave: (e: any) => {
                  e.target.style.backgroundColor = 'transparent'
                }
              },
              '删除'
            ),
            h(
              'button',
              {
                onClick: (e: Event) => {
                  e.stopPropagation()
                  const originalIndex = getOriginalIndex(rowIndex)
                  openFromPlaylist(originalIndex)
                },
                style: {
                  background: 'none',
                  border: 'none',
                  color: '#065fbe',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  fontSize: '12px'
                },
                onMouseenter: (e: any) => {
                  e.target.style.backgroundColor = '#efefef'
                },
                onMouseleave: (e: any) => {
                  e.target.style.backgroundColor = 'transparent'
                }
              },
              '位置'
            )
          ]
        )
      }
    }
  ]
})

// 表格数据
const tableData = computed(() => {
  // 使用 toRaw 优化性能，删除时会自动触发重新计算
  const rawSortedPlaylist = toRaw(sortedPlaylist.value)
  return rawSortedPlaylist.map((track, index) => ({
    ...track,
    index: index,
    originalIndex: getOriginalIndex(index)
  }))
})

// 计算属性
const currentTrack = computed(() => {
  if (currentIndex.value < 0) return null
  // 使用 toRaw 避免响应式访问，保持性能
  const rawPlaylist = toRaw(playlist.value)
  return rawPlaylist[currentIndex.value] || null
})

const hasPrevious = computed(() => {
  return playlist.value.length > 0 && (isShuffle.value || currentIndex.value > 0)
})

const hasNext = computed(() => {
  return (
    playlist.value.length > 0 && (isShuffle.value || currentIndex.value < playlist.value.length - 1)
  )
})

const sortedPlaylist = computed(() => {
  // 使用 toRaw 优化性能，删除时会自动触发重新计算
  const rawPlaylist = toRaw(playlist.value)
  let filtered = [...rawPlaylist]

  // 应用搜索过滤
  if (searchTerm.value.trim()) {
    const term = searchTerm.value.toLowerCase()
    filtered = filtered.filter((track) => {
      const title = (track.title || track.filename).toLowerCase()
      const artist = (track.artist || '').toLowerCase()
      const album = (track.album || '').toLowerCase()
      return title.includes(term) || artist.includes(term) || album.includes(term)
    })
  }

  // 应用排序
  if (sortOrder.value === 'addedAt') {
    return filtered
  } else {
    return filtered.sort((a, b) => {
      const titleA = (a.title || a.filename).toLowerCase()
      const titleB = (b.title || b.filename).toLowerCase()
      return titleA.localeCompare(titleB)
    })
  }
})

// 获取原始播放列表中的索引
const getOriginalIndex = (sortedIndex: number): number => {
  const sortedTrack = sortedPlaylist.value[sortedIndex]
  // 使用 toRaw 避免响应式访问，保持性能
  const rawPlaylist = toRaw(playlist.value)
  const originalIndex = rawPlaylist.findIndex((track) => track.id === sortedTrack.id)

  return originalIndex
}

// 方法
const generateId = () => Math.random().toString(36).substr(2, 9)

// 检查文件是否已存在于播放列表中
const isFileDuplicate = (filename: string): boolean => {
  return playlist.value.some((track) => track.filename === filename)
}

const showToast = (
  message: string,
  type: 'success' | 'error' | 'info' | 'warning' = 'info',
  duration: number = 3000
) => {
  ElMessage({
    message,
    type,
    duration, // 默认 3000 ms
    showClose: true
  })
}

// 变速播放控制
const changePlaybackRate = (rate: number) => {
  playbackRate.value = rate
  if (audioElement.value) {
    audioElement.value.playbackRate = rate
  }
}

const togglePlaybackRate = () => {
  const rates = [0.75, 1.0, 1.25, 1.5, 2.0]
  const currentIndex = rates.indexOf(playbackRate.value)
  const nextIndex = (currentIndex + 1) % rates.length
  changePlaybackRate(rates[nextIndex])
}

const selectFiles = () => {
  fileInput.value?.click()
}

const selectFolder = async () => {
  try {
    isLoading.value = true
    loadingMessage.value = '正在扫描文件夹...'

    const result = await window.api.selectFolder()
    if (result && result.length > 0) {
      const newTracks: Track[] = []
      let skippedCount = 0

      for (const file of result) {
        // 检查文件是否已存在
        if (isFileDuplicate(file.name)) {
          skippedCount++
          continue
        }

        // const metadata = await window.api.getAudioMetadata({
        //   filename: file.name,
        //   filePath: file.path
        // })
        const track: Track = {
          id: generateId(),
          filename: file.name,
          path: file.path,
          title: file.name,
          duration: 0,
          size: file.size
        }
        newTracks.push(track)
      }

      playlist.value.push(...newTracks)

      // 手动触发保存
      manualSaveState()

      // 显示重复文件提示
      if (skippedCount > 0) {
        showToast(
          `扫描完成！发现 ${newTracks.length} 个新文件，跳过了 ${skippedCount} 个重复文件`,
          'info',
          4000
        )
      } else {
        showToast(`扫描完成！发现 ${newTracks.length} 个文件`, 'success')
      }

      if (currentIndex.value === -1 && newTracks.length > 0) {
        currentIndex.value = 0
      }
    }
  } catch (error) {
    console.error('扫描文件夹失败:', error)
    alert('扫描文件夹失败: ' + (error as Error).message)
  } finally {
    isLoading.value = false
  }
}

const handleFileSelect = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files
  if (!files) return

  try {
    isLoading.value = true
    loadingMessage.value = '正在加载音频文件...'

    const newTracks: Track[] = []
    let skippedCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // 检查文件是否已存在
      if (isFileDuplicate(file.name)) {
        skippedCount++
        continue
      }

      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const metadata = await window.api.getAudioMetadata({
        filename: file.name,
        data: uint8Array
      })

      const track: Track = {
        id: generateId(),
        filename: file.name,
        title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
        artist: metadata.artist,
        album: metadata.album,
        duration: metadata.duration,
        size: file.size,
        data: uint8Array
      }
      newTracks.push(track)
    }

    playlist.value.push(...newTracks)

    // 手动触发保存
    manualSaveState()

    // 显示重复文件提示
    if (skippedCount > 0) {
      showToast(`跳过了 ${skippedCount} 个重复文件`, 'info')
    } else if (newTracks.length > 0) {
      showToast(`成功添加 ${newTracks.length} 个文件`, 'success')
    }

    if (currentIndex.value === -1 && newTracks.length > 0) {
      currentIndex.value = playlist.value.length - newTracks.length
      // 自动播放第一个添加的文件
      setTimeout(() => {
        playTrack(currentIndex.value).catch((error) => {
          console.error('自动播放失败:', error)
        })
      }, 500)
    }

    // 清空文件输入
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  } catch (error) {
    console.error('加载文件失败:', error)
    alert('加载文件失败: ' + (error as Error).message)
  } finally {
    isLoading.value = false
  }
}

let trackData: Uint8Array

const playTrack = async (index: number) => {
  const totalStart = performance.now()
  if (index < 0 || index >= playlist.value.length) {
    console.error('索引超出范围')
    return
  }

  const oldIndex = currentIndex.value

  // 使用 toRaw 绕过 Vue 响应式代理，直接访问原始数据
  // 这在大数组时可以显著提升性能
  const rawPlaylist = toRaw(playlist.value)
  const track = rawPlaylist[index]
  const trackPath = track.path
  const trackFilename = track.filename

  // 立即更新索引，确保 UI 同步
  currentIndex.value = index

  try {
    if (audioElement.value) {
      audioElement.value.pause()
      if (audioElement.value.src) {
        URL.revokeObjectURL(audioElement.value.src)
      }
    }

    let audioData: Uint8Array

    // 判断是否可以使用缓存的数据
    // 只有当: 1) 有缓存数据 2) 播放同一首音乐
    const canUseCache = trackData && oldIndex === index

    if (canUseCache) {
      // 使用内存中的数据
      audioData = trackData
    } else if (trackPath) {
      // 读取文件内容
      const readStart = performance.now()

      // 使用 nextTick 让 Vue 先完成响应式更新，避免阻塞
      await nextTick()

      audioData = await window.api.readFileContent({ filePath: trackPath })

      // 缓存当前音乐的数据,避免重复读取
      trackData = audioData
    } else {
      throw new Error('没有可用的音频数据')
    }

    // 根据文件扩展名确定 MIME 类型（使用缓存的数据，避免重复访问响应式对象）
    let mimeType = 'audio/mpeg' // 默认
    if (trackPath || trackFilename) {
      const filename = trackPath || trackFilename
      const ext = filename.toLowerCase().split('.').pop()
      switch (ext) {
        case 'mp3':
          mimeType = 'audio/mpeg'
          break
        case 'wav':
          mimeType = 'audio/wav'
          break
        case 'flac':
          mimeType = 'audio/flac'
          break
        case 'aac':
          mimeType = 'audio/aac'
          break
        case 'm4a':
          mimeType = 'audio/mp4'
          break
        case 'ogg':
          mimeType = 'audio/ogg'
          break
        case 'webm':
          mimeType = 'audio/webm'
          break
        default:
          mimeType = 'audio/mpeg'
      }
    }

    // 直接使用 Uint8Array 创建 Blob，避免不必要的 ArrayBuffer 复制
    const blob = new Blob([audioData], { type: mimeType })
    audioElement.value = new Audio(URL.createObjectURL(blob))

    audioElement.value.volume = isMuted.value ? 0 : volume.value / 100
    audioElement.value.playbackRate = playbackRate.value

    currentTime.value = 0
    progressPercentage.value = 0

    // 等待音频加载完成再播放
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('音频加载超时(10s)'))
      }, 10000)

      const loadStartTime = performance.now()

      // 监听加载完成事件（只触发一次）
      audioElement.value!.addEventListener(
        'loadeddata',
        async () => {
          clearTimeout(timeoutId)

          // 设置其他事件监听器（每个只监听一次）
          audioElement.value!.addEventListener(
            'loadedmetadata',
            () => {
              if (!track.duration && audioElement.value?.duration) {
                track.duration = audioElement.value.duration
              }
            },
            { once: true }
          )

          audioElement.value!.addEventListener(
            'ended',
            () => {
              if (repeatMode.value === 'one') {
                audioElement.value?.play()
              } else {
                nextTrack()
              }
            },
            { once: true }
          )

          try {
            await audioElement.value!.play()

            isPlaying.value = true
            startProgressTracking()
            resolve()
          } catch (playError) {
            clearTimeout(timeoutId)
            console.error('❌ 播放失败:', playError)
            isPlaying.value = false
            reject(new Error('播放失败: ' + (playError as Error).message))
          }
        },
        { once: true }
      )

      // 监听加载错误（只监听一次）
      audioElement.value!.addEventListener(
        'error',
        (e) => {
          clearTimeout(timeoutId)
          console.error('❌ 音频加载错误:', e)
          isPlaying.value = false
          const errorMessage = e instanceof Error ? e.message : '音频加载失败'
          reject(new Error('音频文件加载失败: ' + errorMessage))
        },
        { once: true }
      )
    })
  } catch (error) {
    console.error('❌ 播放失败:', error)
    alert('播放失败: ' + (error as Error).message)
    isPlaying.value = false
  }
}

const togglePlay = () => {
  if (!currentTrack.value) return

  // 如果没有音频元素，先加载音轨
  if (!audioElement.value) {
    playTrack(currentIndex.value)
    return
  }

  if (isPlaying.value) {
    audioElement.value.pause()
    if (progressInterval) {
      clearInterval(progressInterval)
    }
  } else {
    audioElement.value.play()
    startProgressTracking()
  }

  isPlaying.value = !isPlaying.value
}

const stopPlayback = () => {
  if (audioElement.value) {
    audioElement.value.pause()
    audioElement.value.currentTime = 0
  }

  if (progressInterval) {
    clearInterval(progressInterval)
  }

  isPlaying.value = false
  currentTime.value = 0
  progressPercentage.value = 0
}

const previousTrack = () => {
  if (playlist.value.length === 0) return

  let newIndex: number

  if (isShuffle.value) {
    do {
      newIndex = Math.floor(Math.random() * playlist.value.length)
    } while (newIndex === currentIndex.value && playlist.value.length > 1)
  } else {
    newIndex = currentIndex.value > 0 ? currentIndex.value - 1 : playlist.value.length - 1
  }

  playTrack(newIndex)
}

const nextTrack = () => {
  if (playlist.value.length === 0) return

  if (repeatMode.value === 'all' && currentIndex.value === playlist.value.length - 1) {
    playTrack(0)
    return
  }

  let newIndex: number

  if (isShuffle.value) {
    do {
      newIndex = Math.floor(Math.random() * playlist.value.length)
    } while (newIndex === currentIndex.value && playlist.value.length > 1)
  } else {
    newIndex = currentIndex.value < playlist.value.length - 1 ? currentIndex.value + 1 : 0
  }

  playTrack(newIndex)
}

const toggleShuffle = () => {
  isShuffle.value = !isShuffle.value
}

const toggleRepeat = () => {
  const modes: RepeatMode[] = ['none', 'all', 'one']
  const currentIndex = modes.indexOf(repeatMode.value)
  repeatMode.value = modes[(currentIndex + 1) % modes.length]
}

const toggleMute = () => {
  if (isMuted.value) {
    volume.value = previousVolume.value
    isMuted.value = false
  } else {
    previousVolume.value = volume.value
    volume.value = 0
    isMuted.value = true
  }
  updateVolume()
}

const updateVolume = () => {
  if (audioElement.value) {
    audioElement.value.volume = (isMuted.value ? 0 : volume.value) / 100
    audioElement.value.playbackRate = playbackRate.value
  }
}

const seekToPosition = (event: MouseEvent) => {
  if (!currentTrack.value || !currentTrack.value.duration || !audioElement.value) return

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  const targetTime = percent * currentTrack.value.duration

  audioElement.value.currentTime = targetTime
  currentTime.value = targetTime
  progressPercentage.value = percent
}

const startDragging = () => {
  if (currentTrack.value) {
    isDragging.value = true
  }
}

const updateDragging = (event: MouseEvent) => {
  if (!isDragging.value || !currentTrack.value) return

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  progressPercentage.value = percent * 100
}

const stopDragging = (event?: MouseEvent) => {
  if (
    !isDragging.value ||
    !currentTrack.value ||
    !currentTrack.value.duration ||
    !audioElement.value
  ) {
    isDragging.value = false
    return
  }

  if (event) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const targetTime = percent * currentTrack.value.duration
    audioElement.value.currentTime = targetTime
    currentTime.value = targetTime
    progressPercentage.value = percent * 100
  }

  isDragging.value = false
}

const startProgressTracking = async () => {
  if (progressInterval) {
    clearInterval(progressInterval)
  }

  if (currentTrack.value) {
    if (currentTrack.value.duration === 0) {
      const metadata = await window.api.getAudioMetadata({
        filename: currentTrack.value?.filename,
        filePath: currentTrack.value?.path
      })
      currentTrack.value.duration = metadata?.duration
    }
  }
  progressInterval = setInterval(() => {
    if (
      audioElement.value &&
      currentTrack.value &&
      currentTrack.value.duration &&
      !isDragging.value
    ) {
      currentTime.value = audioElement.value.currentTime
      progressPercentage.value = (currentTime.value / currentTrack.value.duration) * 100
    }
  }, 100)
}

const removeFromPlaylist = (index: number) => {
  // 如果删除的是正在播放的音乐,需要清理缓存并停止播放
  if (index === currentIndex.value) {
    stopPlayback()
    trackData = null as any // 清理缓存数据

    if (playlist.value.length === 1) {
      currentIndex.value = -1
    } else if (index === playlist.value.length - 1) {
      // 删除最后一首,索引减1
      currentIndex.value--
    }
    // 如果删除的不是最后一首,currentIndex保持不变,指向下一首
  } else if (index < currentIndex.value) {
    // 删除的是前面的音乐,当前索引需要减1
    currentIndex.value--
  }

  // 使用 filter 创建新数组，触发响应式更新
  const filtered = playlist.value.filter((_, i) => i !== index)

  // 将新数组的元素转换为原始对象，避免后续响应式开销
  playlist.value = filtered.map(item => toRaw(item))

  // 手动触发保存
  manualSaveState()
}

// 打开文件所在位置
const openFromPlaylist = async (index: number) => {
  if (index < 0 || index >= playlist.value.length) {
    showToast('无效的文件索引', 'error')
    return
  }

  const track = playlist.value[index]
  if (!track.path) {
    showToast('该文件没有路径信息', 'warning')
    return
  }

  try {
    await window.api.openInFileExplorer(track.path)
    showToast('已在文件管理器中打开', 'success')
  } catch (error) {
    console.error('打开文件位置失败:', error)
    showToast('打开失败: ' + (error as Error).message, 'error')
  }
}

const clearPlaylist = () => {
  if (confirm('确定要清空播放列表吗？')) {
    stopPlayback()
    playlist.value = []
    currentIndex.value = -1
    trackData = null as any

    // 手动触发保存
    manualSaveState()
  }
}

const showContextMenu = (_: MouseEvent, index: number) => {
  // 这里可以实现右键菜单功能
}

// 行右键事件处理
const handleRowContextMenu = ({
  row,
  rowIndex,
  event
}: {
  row: any
  rowIndex: number
  event: MouseEvent
}) => {
  event.preventDefault()
  const originalIndex = getOriginalIndex(rowIndex)
  showContextMenu(event, originalIndex)
}

// 滚动到当前播放歌曲
const scrollToCurrentTrack = () => {
  if (currentIndex.value < 0 || currentIndex.value >= playlist.value.length) {
    showToast('没有正在播放的歌曲', 'warning')
    return
  }

  // 找到当前歌曲在排序后的播放列表中的位置
  const currentTrack = playlist.value[currentIndex.value]
  const sortedIndex = sortedPlaylist.value.findIndex(
    (track) => track.id === currentTrack.id
  )

  if (sortedIndex === -1) {
    showToast('未找到当前歌曲', 'error')
    return
  }

  // 使用 nextTick 等待 DOM 更新，然后滚动
  nextTick(() => {
    if (tableRef.value?.scrollToRow) {
      try {
        // 计算需要定位的次数：每n首增加1次，避免虚拟列表未加载完成导致定位不准确
        const numInterval = 500
        const totalTracks = playlist.value.length
        const scrollTimes = Math.ceil(totalTracks / numInterval)

        // 执行多次定位
        let count = 0
        const executeScroll = () => {
          tableRef.value?.scrollToRow(sortedIndex, 'center', true)
          count++

          // 如果还有剩余次数，继续执行
          if (count < scrollTimes) {
            setTimeout(executeScroll, 1)
          } else {
            // 全部完成，显示提示
            showToast(`已定位到第 ${sortedIndex + 1} 首`, 'success', 1500)
          }
        }

        // 开始执行
        executeScroll()
      } catch (error) {
        console.error('滚动失败:', error)
        showToast('定位失败，请重试', 'error')
      }
    } else {
      console.error('表格 ref 或 scrollToRow 方法不可用')
      showToast('表格组件未就绪', 'error')
    }
  })
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDuration = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 显示歌词弹窗
const showLyricsDialog = () => {
  if (!currentTrack.value) {
    showToast('请先选择要播放的音乐', 'warning')
    return
  }
  lyricsDialogVisible.value = true
}

// 处理歌词点击跳转
const handleLyricSeek = (time: number) => {
  if (!audioElement.value || !currentTrack.value) return

  audioElement.value.currentTime = time
  currentTime.value = time
  progressPercentage.value = (time / currentTrack.value.duration) * 100
}

// 监听音量变化
watch(volume, (newVolume) => {
  if (newVolume > 0 && isMuted.value) {
    isMuted.value = false
  }
  updateVolume()
})

// 监听窗口大小变化
onMounted(() => {
  restoreState()
  nextTick(() => {
    if (audioElement.value) {
      audioElement.value.volume = (isMuted.value ? 0 : volume.value) / 100
      audioElement.value.playbackRate = playbackRate.value
    }
  })
})

onUnmounted(() => {
  if (progressInterval) {
    clearInterval(progressInterval)
  }
  if (saveStateTimer) {
    clearTimeout(saveStateTimer)
  }
  if (audioElement.value?.src) {
    URL.revokeObjectURL(audioElement.value.src)
  }
})
</script>

<style scoped>
.enhanced-music-player {
  padding: 0;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  overflow: hidden;
}

.player-container {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  height: 100vh;
  display: flex;
  gap: 10px;
  overflow: hidden;
}

/* 左侧播放器部分 */
.player-section {
  flex: 0 0 180px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  padding: 15px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
}

/* 右侧播放列表部分 */
.playlist-section {
  flex: 1;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* 工具栏 */
.toolbar {
  height: 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.now-playing {
  margin-bottom: 25px;
  flex: 0 0 auto;
  max-width: 100%;
}

.now-playing.empty {
  text-align: center;
  color: #999;
  padding: 20px 0;
}

.track-details {
  max-width: 100%;
  overflow: hidden;
}

.track-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  word-break: break-all;
}

.track-artist {
  font-size: 16px;
  color: #666;
  margin: 0 0 4px 0;
}

.track-album {
  font-size: 14px;
  color: #999;
  margin: 0;
}

/* 进度条 */
.progress-section {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 10px;
}

.time-display {
  font-size: 12px;
  color: #666;
  font-family: monospace;
  min-width: 40px;
}

.progress-bar-container {
  flex: 1;
  height: 8px;
  background: #e9ecef;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  transition: height 0.2s;
}

.progress-bar-container:hover {
  height: 12px;
}

.progress-bar {
  width: 100%;
  height: 100%;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #007bff, #0056b3);
  border-radius: 4px;
  position: relative;
}

.progress-handle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  background: white;
  border: 3px solid #007bff;
  border-radius: 50%;
  cursor: grab;
  box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
}

.progress-handle:active {
  cursor: grabbing;
}

/* 播放控制 */
.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.playlist-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.track-counter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-family: 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
  font-weight: 500;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  border-radius: 4px;
}

.track-counter:hover {
  background-color: #f0f7ff;
  transform: scale(1.05);
}

.track-counter:active {
  transform: scale(0.98);
}

.track-counter .current-index {
  font-size: 16px;
  font-weight: 600;
  color: #409eff;
  min-width: 24px;
  text-align: center;
}

.track-counter .separator {
  font-size: 14px;
  color: #909399;
  margin: 0 2px;
}

.track-counter .total-count {
  font-size: 14px;
  color: #606266;
  min-width: 20px;
  text-align: center;
}

/* 空播放列表样式 */
.empty-playlist {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  text-align: center;
  padding: 40px;
}

.empty-playlist p {
  margin: 8px 0;
}

/* 虚拟表格容器样式 */
.el-auto-resizer {
  width: 100% !important;
  height: 100% !important;
}

/* 虚拟表格样式 */
:deep(.el-table-v2) {
  --el-table-border-color: #e9ecef;
  --el-table-header-bg-color: #f8f9fa;
  width: 100% !important;
  height: 100% !important;
}

/* 确保表格主体区域正确显示 */
:deep(.el-table-v2__body-wrapper) {
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

/* 禁用整个表格的水平滚动 */
:deep(.el-table-v2) {
  overflow-x: hidden !important;
}

:deep(.el-table-v2__root) {
  overflow-x: hidden !important;
}

/* 确保表格行不超出容器宽度 */
:deep(.el-table-v2__row) {
  width: 100% !important;
}

:deep(.el-table-v2__cell) {
  overflow: hidden !important;
}

/* 表格行样式 */
:deep(.el-table-v2__row) {
  cursor: pointer;
  transition: background-color 0.2s;
}

:deep(.el-table-v2__row:hover) {
  background-color: #f5f5f5 !important;
}

/* 表格单元格样式 */
:deep(.el-table-v2__cell) {
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
}

/* 表格头部样式 */
:deep(.el-table-v2__header) {
  background-color: #fafafa;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e9ecef;
}

/* 滚动条样式 */
:deep(.el-table-v2__body-wrapper)::-webkit-scrollbar {
  width: 8px;
}

:deep(.el-table-v2__body-wrapper)::-webkit-scrollbar-track {
  background: #f1f3f5;
  border-radius: 4px;
}

:deep(.el-table-v2__body-wrapper)::-webkit-scrollbar-thumb {
  background: #dee2e6;
  border-radius: 4px;
}

:deep(.el-table-v2__body-wrapper)::-webkit-scrollbar-thumb:hover {
  background: #adb5bd;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f3f5;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #dee2e6;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #adb5bd;
}

/* Toast 通知 */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 20px;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  font-size: 14px;
  z-index: 10000;
  animation: slideIn 0.3s ease-out;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 350px;
}

.toast.success {
  background: rgba(76, 175, 80, 0.9);
  border-left: 4px solid #4caf50;
}

.toast.error {
  background: rgba(244, 67, 54, 0.9);
  border-left: 4px solid #f44336;
}

.toast.info {
  background: rgba(33, 150, 243, 0.9);
  border-left: 4px solid #2196f3;
}

.toast-message {
  display: block;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
</style>
