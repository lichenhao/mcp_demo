import { Injectable, Logger } from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { BlogRequestDto } from '../dto/blog-request.dto';
import { BatchRequestDto } from '../dto/batch-request.dto';
import { BlogSnapshotResult } from '../interfaces/blog-snapshot-result';
import { BatchTaskResult } from '../interfaces/batch-task-result';
import { PuppeteerService } from './puppeteer.service';
import { MarkdownService } from './markdown.service';
import { TaskSchedulerService } from './task-scheduler.service';

@Injectable()
export class BlogScraperService {
  private readonly logger = new Logger(BlogScraperService.name);

  constructor(
    private readonly puppeteer: PuppeteerService,
    private readonly markdown: MarkdownService,
    private readonly scheduler: TaskSchedulerService,
  ) {}

  async captureBlogSnapshot(dto: BlogRequestDto): Promise<BlogSnapshotResult> {
    if (!dto.url) {
      throw new Error('Missing required field "url"');
    }

    return this.puppeteer.withPage(async (page) => {
      if (dto.viewport) {
        await page.setViewport(dto.viewport);
      }

      this.logger.log(`Navigating to ${dto.url}`);
      await page.goto(dto.url, { waitUntil: 'networkidle2', timeout: 60_000 });

      if (dto.waitForSelector) {
        await page.waitForSelector(dto.waitForSelector, { timeout: 15_000 }).catch(() => {
          this.logger.warn(`Selector ${dto.waitForSelector} not found before timeout`);
        });
      }

      const rawTitle = (await page.title()) || dto.snapshotName || 'snapshot';
      const html = await page.content();
      const article = this.extractArticle(html, dto.url);
      const resolvedTitle = article?.title ?? rawTitle;
      const markdownSource = article?.content ?? html;
      const markdownBody = this.markdown.toMarkdown(markdownSource);
      const snapshotDate = new Date();
      const artifacts = await this.markdown.prepareSnapshotArtifacts({
        title: resolvedTitle,
        preferredName: dto.snapshotName,
        snapshotDate,
      });
      const localized = await this.markdown.localizeImages(markdownBody, {
        baseUrl: dto.url,
        assetDir: artifacts.assetsDir,
      });
      const refLine = `「Ref：[${dto.url}]」`;
      const headingLine = `# ${resolvedTitle}`;
      const markdown = `${refLine}\n\n${headingLine}\n\n${localized.markdown}`.trimEnd();
      const markdownPath = await this.markdown.persistSnapshot(markdown, artifacts);

      return {
        url: dto.url,
        title: resolvedTitle,
        capturedAt: snapshotDate.toISOString(),
        markdownPath,
        markdown,
        assetsDir: artifacts.assetsDir,
        assets: localized.assets,
        metadata: article
          ? {
              byline: article.byline,
              excerpt: article.excerpt,
              length: article.length,
            }
          : undefined,
      };
    });
  }

  async captureBlogBatch(
    request: BatchRequestDto<BlogRequestDto>,
  ): Promise<BatchTaskResult<BlogSnapshotResult>[]> {
    return this.scheduler.runBatch(request, (job) => this.captureBlogSnapshot(job.payload));
  }

  private extractArticle(html: string, url: string) {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      return reader.parse();
    } catch (error) {
      this.logger.warn(`Readability parsing failed for ${url}: ${(error as Error).message}`);
      return null;
    }
  }
}
