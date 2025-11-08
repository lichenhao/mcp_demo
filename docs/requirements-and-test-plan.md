# Social Snapshot Service · Requirements & Test Plan

## 1. 汇总资料与项目目标

- **项目定位**：以 NestJS + Puppeteer Extra 为核心，抓取社交媒体博文生成 Markdown 快照，并通过外部视频下载器缓存视频内容。支持 HTTP 接口与 STD I/O 双模式。
- **关键依赖**：Chromium（可由 Puppeteer 自动下载或通过 `CHROMIUM_PATH` 指定）与可执行的视频下载工具（默认 `yt-dlp`）。
- **运行入口**：
  - HTTP 服务：`npm start`（`POST /scrape/*`、`POST /batch/*`、`GET /health`）
  - STD 模式：`npm run std`，逐行读取 JSON 命令。
- **主要服务能力**
  1. **Blog Snapshot**：访问给定 URL，等待可选选择器，使用 Readability 抽取正文并借助 Turndown 转 Markdown，落盘到 `SNAPSHOT_DIR`。
  2. **Video Cache**：调用外部下载器（默认 `yt-dlp`）将视频缓存到 `VIDEO_CACHE_DIR`，记录新增文件与日志。
  3. **Batch Scheduler**：统一的子任务调度器，按配置并发度或 `BATCH_CONCURRENCY` 环境变量执行批量作业，并输出带时间戳的结果。
  4. **STD Runner**：在 CLI 中通过 JSON 命令触发 blog/video 的单任务或批量任务。

## 2. 需求整理

| 分类 | 需求 |
| ---- | ---- |
| 输入校验 | Blog/Video 请求必须包含 `url`；视口、wait selector、格式等为可选。Batch 请求需要 `jobs` 数组，可带 `concurrency`。 |
| 抓取行为 | Puppeteer 需应用 stealth & UA 伪装插件、可依据 `viewport` 设置大小，并支持 `waitForSelector`。 |
| Markdown 处理 | 使用 Turndown 指定 heading/bullet 样式，文件名需经 `sanitizeFilename` 并附 `timestampSuffix`。 |
| 视频缓存 | 在执行前后比较 `VIDEO_CACHE_DIR`，返回新增文件列表与 `rawLog`。失败时输出错误信息。 |
| 批量调度 | 以固定并发执行 jobs，产出 `fulfilled`/`rejected` 状态、开始/结束时间。 |
| 配置 | 通过环境变量覆盖端口、目录、Chromium 路径、Puppeteer 启动参数、下载器、默认并发。 |
| 健康检查 | `GET /health` 返回 `{ status: 'ok', timestamp }`。 |
| STD 模式 | 行级 JSON 命令，输出 `{ success: boolean, result|error }`。支持 `SIGINT/SIGTERM` 优雅关闭。 |

## 3. 测试策略

- **范围**：HTTP 控制器、服务层逻辑、批量调度器、STD runner、配置与错误处理。
- **方法**：
  1. **集成测试**：使用 `supertest` 针对 HTTP 接口；通过 `ts-node` 或 `jest` + `TestingModule` 测试服务。
  2. **端到端验证**：在真实或 mock Chromium 环境下跑一次抓取 & 视频下载（需提供可访问的静态页面和小型媒体源）。
  3. **STD 模式测试**：通过 child_process 启动 `npm run std`，向 stdin 写入命令并断言 stdout。
- **依赖隔离**：可利用 `nock`/`http-server` 提供本地测试页面；视频下载可替换为 stub 命令（利用脚本模拟 `yt-dlp`）。

## 4. 测试用例（按项目目标）

| 用例编号 | 目标 | 场景 & 步骤 | 期望结果 |
| -------- | ---- | ----------- | -------- |
| TC-HTTP-001 | 健康检查 | 启动 HTTP 服务，`GET /health`. | HTTP 200，返回 `status: ok` 和 ISO 时间戳。 |
| TC-BLOG-001 | 博文抓取（基础） | `POST /scrape/blog`，提供可访问 HTML 页，包含 `<article>`。 | 响应包含 `title`、`markdown`、`markdownPath`，并在 `SNAPSHOT_DIR` 生成文件。 |
| TC-BLOG-002 | 自定义视口/等待 | 提交含 `viewport` 与 `waitForSelector` 的请求，目标页面延迟加载内容。 | 页面按新视口渲染，等待选择器成功后返回 Markdown。 |
| TC-BLOG-003 | 失败处理 | 提交缺少 `url` 或无法访问的地址。 | 返回 400/500（视全局过滤器而定），`captureBlogSnapshot` 抛错并被批处理记录为 `rejected`。 |
| TC-BLOG-004 | 批量抓取 | `POST /batch/blog`，含 3 个 job、并发 2。 | 返回数组长度与 jobs 相同，包含 `fulfilled/rejected`、时间戳顺序与 job 顺序匹配。 |
| TC-VID-001 | 视频缓存成功 | `POST /scrape/video`，指向可下载短媒体，提供 `outputTemplate`. | 调用指定下载器，返回 `files` 包含新增文件名且落盘到 `VIDEO_CACHE_DIR`。 |
| TC-VID-002 | 自定义下载器 | 将 `downloader` 指向伪造脚本（mock）。 | 服务使用提供命令，解析日志并返回。 |
| TC-VID-003 | 下载失败 | 传入无效 URL 或 mock 下载器返回非零。 | 接口返回错误并记录 logger，批量模式对应 job 标记 `rejected`，`error` 包含信息。 |
| TC-BATCH-001 | 并发控制 | 构造 5 个长耗时 job，设置 `concurrency: 1`. | 观察执行总时长≈单个任务×5，`startedAt` 顺序串行。 |
| TC-STD-001 | STD 单任务 | 启动 `npm run std`，写入 `{"action":"blog","payload":{"url": ...}}`. | 收到 `success: true` 的 JSON 行，包含与 HTTP 相同的结果。 |
| TC-STD-002 | STD 批量 | 写入 `{"action":"videoBatch","payload":{"jobs":[...]}}`. | 输出 `success: true`，结果数组含批量结构。 |
| TC-STD-003 | STD 错误 | 写入不支持的 action。 | 输出 `success: false`，`error` 为 `Unsupported action xxx`。 |
| TC-CONFIG-001 | 环境变量覆盖 | 设置 `SNAPSHOT_DIR=/tmp/custom`, `VIDEO_CACHE_DIR=/tmp/videos`. | Markdown/视频文件写入自定义目录，日志显示路径。 |
| TC-RES-001 | 资源回收 | 多次调用 Puppeteer，随后应用关闭。 | `PuppeteerService.close()` 关闭浏览器，进程干净退出。 |

> 小贴士：若计划使用 Jest，可为 Puppeteer/Child Process 创建轻量 mock，以避免真实网络依赖；真实 E2E 场景可另建 `tests/e2e/blog.e2e-spec.ts` 等文件。

## 5. 后续可跟进

1. 为上述用例添加 Jest/E2E 测试样例，并在 CI 中执行。
2. 引入可配置的 mock 下载器，方便无需外网时运行 TC-VID 系列。
3. 接入持久化队列与重试策略，以覆盖 README 中的扩展建议。
