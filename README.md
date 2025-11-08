# Social Snapshot Service

使用 NestJS + Puppeteer Extra 构建的抓取服务，集成 `@mozilla/readability` 主流媒体解析、`puppeteer-extra-plugin-stealth` 反爬插件以及子任务调度器，可将博客文章转换为 Markdown 快照并批量抓取，同时通过外部视频抓取工具（默认 `yt-dlp`）缓存主流视频平台内容。支持 HTTP 与 STDIO 双服务模式。

## 环境依赖

- Node.js >= 24.10（`package.json` 已声明 `engines`）
- pnpm >= 10.18（或使用 npm，但建议 pnpm）
- Python >= 3.10（仅在自带 `yt-dlp` 时需要，确保满足官方最低要求）
- Chromium/Chrome：用于 Puppeteer 渲染，可由 Puppeteer 自动下载，也可通过 `CHROMIUM_PATH` 指定现有浏览器
- `yt-dlp >= 2024.07.09`：用于视频缓存，建议通过包管理器安装（macOS `brew install yt-dlp`，Ubuntu `sudo apt install yt-dlp`）

首次启动前可执行：

```bash
yt-dlp --version      # 确认版本 >= 2024.07.09
which chromium || which google-chrome
```

服务会在系统缺少合规版本时自动下载备用 `yt-dlp` 二进制，但提前安装能显著加速首跑。

## 快速开始

```bash
npm install
npm run build
npm start            # 启动 HTTP 服务，默认端口 3000
npm run std          # 启动 STD 模式，读写 stdin/stdout
```

> **依赖**：需要可用的 Chromium（Puppeteer 会自动下载或通过 `CHROMIUM_PATH` 指定），以及一个可执行的视频抓取工具（默认 `yt-dlp`，需自行安装并放入 PATH）。

## 配置

通过环境变量自定义运行参数：

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `PORT` | `3000` | HTTP 服务端口 |
| `SNAPSHOT_DIR` | `./storage/snapshots` | Markdown 快照输出目录 |
| `VIDEO_CACHE_DIR` | `./storage/videos` | 视频缓存目录 |
| `SCRAPER_USER_AGENT` | Safari UA | 覆盖默认 UA，绕过部分反爬策略 |
| `CHROMIUM_PATH` | 自动分发 | 指定本地 Chromium 可执行文件 |
| `PUPPETEER_ARGS` | `--no-sandbox --disable-gpu` | 自定义 Puppeteer 启动参数 |
| `VIDEO_DOWNLOADER` | `yt-dlp` | 外部视频抓取工具命令 |
| `BATCH_CONCURRENCY` | `2` | 子任务调度默认并发度（可被请求单独覆盖） |

## HTTP API

- `GET /health`：健康检查。
- `POST /scrape/blog`
  ```json
  {
    "url": "https://social.example/post/123",
    "snapshotName": "optional-name",
    "waitForSelector": "article",
    "viewport": { "width": 1280, "height": 720 }
  }
  ```
  返回值包含 Markdown 内容与落盘文件路径。
- `POST /batch/blog`
  ```json
  {
    "concurrency": 3,
    "jobs": [
      { "id": "job-1", "payload": { "url": "https://social.example/post/1" } },
      { "id": "job-2", "payload": { "url": "https://social.example/post/2" } }
    ]
  }
  ```
  返回按 job 顺序排列的批量执行结果，包含成功/失败状态与时间戳。
- `POST /scrape/video`
  ```json
  {
    "url": "https://video.example/watch?v=abc",
    "format": "bestvideo+bestaudio/best",
    "downloader": "yt-dlp",
    "outputTemplate": "%(uploader)s/%(title)s.%(ext)s"
  }
  ```
  返回值包含缓存目录与新增文件列表。
- `POST /batch/video`：与 blog 批量接口一致，`payload` 换成视频参数。
- `GET /snapshots`：列出所有已抓取快照，快速进入预览/下载。
- `GET /snapshots/:file/preview`：在线预览指定 Markdown 快照，并提供多样批注样式（底色/直线/波浪下划线）、擅长标签及 Markdown 富文本评论（含快捷工具条 + 抽屉式编辑器）。
- `GET /snapshots/:file/annotations` & `POST /snapshots/:file/annotations`：获取或新增批注；服务会在 `storage/annotations` 下按快照文件名存储 JSON。
- `GET /snapshots/:file/raw`：下载原始 Markdown 文件。

## STD 模式

`npm run std` 后，通过标准输入传入 JSON 行：

```
{"action":"blog","payload":{"url":"https://example.com/post"}}
{"action":"video","payload":{"url":"https://youtu.be/dQw4w9WgXcQ"}}
{"action":"blogBatch","payload":{"jobs":[{"id":"1","payload":{"url":"https://a.com"}}]}}
```

每行执行一次任务，服务会将结果以 JSON 输出到标准输出（或输出错误信息）。

## 目录结构

```
src/
  controllers/        # HTTP 控制器
  services/           # Puppeteer、Markdown、视频缓存、子任务调度
  dto/                # 请求 DTO 定义（含批量任务）
  interfaces/         # 统一返回结构与批量结果
  config/             # 应用配置
src/std-runner.ts     # STD 模式入口
```

## 后续扩展建议

- 引入持久化任务队列（BullMQ/Redis）实现断点续跑与失败重试
- 针对不同社交媒体编写更细粒度的提取模板，补充标签/话题等结构化信息
- 接入对象存储或数据库，统一管理快照与视频元数据及检索能力
- 结合共享阅读场景，为批注提供协作同步与权限控制
