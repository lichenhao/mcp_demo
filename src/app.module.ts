import { Module } from '@nestjs/common';
import { ScrapeController } from './controllers/scrape.controller';
import { UiController } from './controllers/ui.controller';
import { PreviewController } from './controllers/preview.controller';
import { BlogScraperService } from './services/blog-scraper.service';
import { MarkdownService } from './services/markdown.service';
import { PuppeteerService } from './services/puppeteer.service';
import { VideoCacheService } from './services/video-cache.service';
import { TaskSchedulerService } from './services/task-scheduler.service';
import { MarkdownRendererService } from './services/markdown-renderer.service';
import { AnnotationService } from './services/annotation.service';

@Module({
  controllers: [ScrapeController, UiController, PreviewController],
  providers: [
    BlogScraperService,
    MarkdownService,
    PuppeteerService,
    VideoCacheService,
    TaskSchedulerService,
    MarkdownRendererService,
    AnnotationService,
  ],
})
export class AppModule {}
