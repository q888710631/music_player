# MusicPlayer 打包构建指南

## 概述

MusicPlayer 是基于 Electron + Vue 3 + TypeScript 开发的音乐播放器，支持打包成 Windows 可执行文件（.exe）和安装包。

## 构建前准备

### 环境要求

- Node.js >= 16.0.0
- npm 或 yarn 包管理器
- Windows 开发环境（用于 Windows 打包）

### 依赖安装

```bash
# 安装依赖
npm install

# 或者使用 yarn
yarn install
```

## 构建脚本说明

### 开发环境

```bash
# 启动开发服务器
npm run dev

# 启动预览
npm run start
```

### 打包命令

```bash
# 基础构建（生成未打包的可执行文件）
npm run build:unpack

# Windows 打包（生成 .exe 安装包）
npm run build:win

# Windows x64 架构打包
npm run build:win-x64

# Windows ia32 架构打包
npm run build:win-ia32

# Windows 所有架构打包
npm run build:win-all

# 所有平台打包
npm run pack

# 发布版本打包（不发布到远程）
npm run dist
```

## 打包配置

### electron-builder.yml 配置

打包配置文件位于项目根目录的 `electron-builder.yml`，包含以下主要配置：

- **应用信息**: 应用名称、版本号、图标等
- **构建选项**: 文件过滤、资源打包等
- **Windows 配置**:
  - 支持 x64 和 ia32 架构
  - 自动创建桌面快捷方式
  - 支持选择安装目录
  - 音频文件关联（.mp3, .wav, .flac, .aac, .m4a, .ogg）
  - 开始菜单集成

### 安装包特性

1. **用户友好的安装界面**
   - 现代化的安装向导
   - 自定义欢迎和完成页面
   - 品牌化展示

2. **系统集成**
   - 桌面快捷方式
   - 开始菜单项（归类到音频视频类别）
   - 音频文件类型关联
   - 完整的卸载程序

3. **安装选项**
   - 可选择安装目录
   - 创建桌面快捷方式（可选）
   - 创建开始菜单快捷方式（可选）

## 构建输出

### 输出目录

构建完成后，安装包会输出到 `dist/` 目录：

```
dist/
├── MusicPlayer-1.0.0-setup-x64.exe  # Windows x64 安装包
├── MusicPlayer-1.0.0-setup-ia32.exe # Windows ia32 安装包
└── ...                            # 其他平台安装包
```

### 文件结构

安装包包含以下内容：

```
MusicPlayer/
├── MusicPlayer.exe              # 主程序
├── resources/                   # 资源文件
│   ├── icon.ico                 # 应用图标
│   └── ...                     # 其他资源
├── ffmpeg-static/               # FFmpeg 二进制文件
└── ...                         # 其他依赖
```

## 分发说明

### 安装包命名

- **格式**: `MusicPlayer-{version}-setup-{arch}.exe`
- **版本号**: 来自 package.json 中的 version 字段
- **架构**: x64 或 ia32

### 证书签名（可选）

对于生产环境，建议对安装包进行数字签名：

1. 获取代码签名证书
2. 配置 electron-builder.yml 中的签名相关设置
3. 重新构建安装包

### 自动更新（可选）

应用支持自动更新功能，需要配置更新服务器地址。

## 故障排除

### 常见问题

1. **构建失败**
   - 确保所有依赖已正确安装
   - 检查 Node.js 和 npm 版本兼容性
   - 清理 node_modules 并重新安装依赖

2. **图标不显示**
   - 确保 build/icon.ico 文件存在
   - 检查图标文件格式和大小

3. **文件关联不工作**
   - 以管理员权限运行安装程序
   - 检查是否正确注册了文件关联

4. **FFmpeg 相关错误**
   - 确保 ffmpeg-static 依赖正确安装
   - 检查 asarUnpack 配置是否正确

### 构建日志

构建过程中的详细日志可以帮助诊断问题。日志通常包含：

- 文件复制和打包过程
- 依赖项处理
- 签名和验证步骤

## 开发建议

### 测试构建

在发布前，建议在干净环境中测试安装包：

1. 在虚拟机中测试安装
2. 验证所有功能正常工作
3. 测试文件关联功能
4. 确认卸载程序正常工作

### 版本管理

- 使用语义化版本号
- 每次发布前更新版本号
- 保留历史版本的安装包用于回滚

---

**注意**: 构建过程可能需要较长时间，特别是首次构建时，请耐心等待。