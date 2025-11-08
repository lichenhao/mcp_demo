import { Injectable, Logger } from '@nestjs/common';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import YTDlpWrap from 'yt-dlp-wrap';
import { VideoRequestDto } from '../dto/video-request.dto';
import { VideoCacheResult } from '../interfaces/video-cache-result';
import { AppConfig } from '../config/app.config';
import { BatchRequestDto } from '../dto/batch-request.dto';
import { BatchTaskResult } from '../interfaces/batch-task-result';
import { TaskSchedulerService } from './task-scheduler.service';

const execFileAsync = promisify(execFile);
const MIN_YTDLP_VERSION = '2024.07.09';

@Injectable()
export class VideoCacheService {
  private readonly logger = new Logger(VideoCacheService.name);
  private embeddedYtDlp?: YTDlpWrap;
  private systemYtDlpChecked = false;
  private systemYtDlpUsable = false;

  constructor(private readonly scheduler: TaskSchedulerService) {}

  async cacheVideo(dto: VideoRequestDto): Promise<VideoCacheResult> {
    if (!dto.url) {
      throw new Error('Missing required field "url"');
    }

    const requestedDownloader = dto.downloader ?? process.env.VIDEO_DOWNLOADER ?? 'yt-dlp';
    const outputDir = AppConfig.videoCacheDir;
    await fs.mkdir(outputDir, { recursive: true });

    const beforeRun = new Set(await fs.readdir(outputDir));

    const outputTemplate = path.join(outputDir, dto.outputTemplate ?? '%(title)s.%(ext)s');
    const args = ['-o', outputTemplate];
    if (dto.format) {
      args.push('-f', dto.format);
    }
    args.push(dto.url);

    this.logger.log(`Caching video ${dto.url} via ${requestedDownloader}`);
    let stdout = '';
    let stderr = '';
    let resolvedDownloader = requestedDownloader;
    let usedEmbedded = false;

    if (requestedDownloader === 'yt-dlp') {
      const systemReady = await this.ensureSystemYtDlpReady(requestedDownloader);
      if (!systemReady) {
        const fallback = await this.runWithEmbeddedYtDlp(dto.url, {
          output: outputTemplate,
          format: dto.format,
        });
        stdout = fallback.stdout;
        stderr = fallback.stderr;
        resolvedDownloader = 'yt-dlp (embedded)';
        usedEmbedded = true;
      }
    }

    if (!usedEmbedded) {
      try {
        const result = await execFileAsync(requestedDownloader, args, { maxBuffer: 10 * 1024 * 1024 });
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (error) {
        const err = error as NodeJS.ErrnoException & { stderr?: string };
        const shouldFallback =
          requestedDownloader === 'yt-dlp' &&
          (err.code === 'ENOENT' || this.isUnsupportedPythonError(err.stderr ?? err.message));
        if (shouldFallback) {
          this.logger.warn(
            'System yt-dlp unavailable or incompatible, falling back to embedded binary (first run may download it)',
          );
          const fallbackResult = await this.runWithEmbeddedYtDlp(dto.url, {
            output: outputTemplate,
            format: dto.format,
          });
          stdout = fallbackResult.stdout;
          stderr = fallbackResult.stderr;
          resolvedDownloader = 'yt-dlp (embedded)';
        } else {
          stderr = err.message;
          this.logger.error(`Video caching failed: ${stderr}`);
          throw error;
        }
      }
    }

    const filesAfter = await fs.readdir(outputDir);
    const newFiles = filesAfter.filter((file) => !beforeRun.has(file));

    return {
      url: dto.url,
      downloader: resolvedDownloader,
      outputDir,
      files: newFiles,
      rawLog: `${stdout}\n${stderr}`.trim(),
    };
  }

  private async ensureSystemYtDlpReady(command: string): Promise<boolean> {
    if (command !== 'yt-dlp') {
      return true;
    }

    if (this.systemYtDlpChecked) {
      return this.systemYtDlpUsable;
    }

    this.systemYtDlpChecked = true;
    try {
      const { stdout } = await execFileAsync(command, ['--version'], { timeout: 5000 });
      const version = stdout.trim().split(/\s+/)[0];
      if (version && this.isYtDlpVersionSupported(version)) {
        this.systemYtDlpUsable = true;
      } else {
        this.logger.warn(
          `System yt-dlp version ${version || 'unknown'} is older than required ${MIN_YTDLP_VERSION}, will use embedded binary.`,
        );
        this.systemYtDlpUsable = false;
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stderr?: string };
      if (this.isUnsupportedPythonError(err.stderr ?? err.message)) {
        this.logger.warn('System yt-dlp uses unsupported Python runtime, switching to embedded binary.');
      } else if (err.code !== 'ENOENT') {
        this.logger.warn(`System yt-dlp validation failed: ${err.message}`);
      }
      this.systemYtDlpUsable = false;
    }

    return this.systemYtDlpUsable;
  }

  async cacheVideoBatch(
    request: BatchRequestDto<VideoRequestDto>,
  ): Promise<BatchTaskResult<VideoCacheResult>[]> {
    return this.scheduler.runBatch(request, (job) => this.cacheVideo(job.payload));
  }

  private async runWithEmbeddedYtDlp(
    url: string,
    options: { output: string; format?: string },
  ): Promise<{ stdout: string; stderr: string }> {
    const ytDlp = await this.ensureEmbeddedYtDlp();
    const args = ['-o', options.output];
    if (options.format) {
      args.push('-f', options.format);
    }
    args.push(url);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const emitter = ytDlp.exec(args) as unknown as NodeJS.EventEmitter;
      emitter
        .on('progress', (progress: { percent?: number }) => {
          if (progress?.percent) {
            this.logger.debug(`yt-dlp progress: ${progress.percent}%`);
          }
        })
        .on('stdout', (chunk: Buffer | string) => {
          stdout += chunk.toString();
        })
        .on('stderr', (chunk: Buffer | string) => {
          stderr += chunk.toString();
        })
        .on('error', (error) => reject(error))
        .on('close', () => resolve({ stdout, stderr }));
    });
  }

  private async ensureEmbeddedYtDlp(): Promise<YTDlpWrap> {
    if (this.embeddedYtDlp) {
      return this.embeddedYtDlp;
    }

    const binDir = path.resolve(process.cwd(), 'storage', 'bin');
    await fs.mkdir(binDir, { recursive: true });
    const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const binaryPath = path.join(binDir, binaryName);

    const exists = await this.pathExists(binaryPath);
    if (!exists) {
      this.logger.log('Downloading standalone yt-dlp binary from GitHub releases...');
      await YTDlpWrap.downloadFromGithub(binaryPath);
      await fs.chmod(binaryPath, 0o755).catch(() => undefined);
    }

    this.embeddedYtDlp = new YTDlpWrap(binaryPath);
    return this.embeddedYtDlp;
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  private isUnsupportedPythonError(message?: string): boolean {
    if (!message) {
      return false;
    }
    return /unsupported version of python/i.test(message);
  }

  private isYtDlpVersionSupported(version: string): boolean {
    return this.compareVersionStrings(version, MIN_YTDLP_VERSION) >= 0;
  }

  private compareVersionStrings(a: string, b: string): number {
    const parse = (value: string) =>
      value
        .replace(/[^0-9.]/g, '')
        .split('.')
        .map((chunk) => Number(chunk));
    const partsA = parse(a);
    const partsB = parse(b);
    const max = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < max; i += 1) {
      const segmentA = partsA[i] ?? 0;
      const segmentB = partsB[i] ?? 0;
      if (segmentA !== segmentB) {
        return segmentA > segmentB ? 1 : -1;
      }
    }
    return 0;
  }
}
