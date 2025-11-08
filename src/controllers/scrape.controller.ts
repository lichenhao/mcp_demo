import { Body, Controller, Get, Post } from '@nestjs/common';
import { BlogScraperService } from '../services/blog-scraper.service';
import { VideoCacheService } from '../services/video-cache.service';
import { BlogRequestDto } from '../dto/blog-request.dto';
import { VideoRequestDto } from '../dto/video-request.dto';
import { BatchRequestDto } from '../dto/batch-request.dto';

@Controller()
export class ScrapeController {
  constructor(
    private readonly blogScraper: BlogScraperService,
    private readonly videoCache: VideoCacheService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Post('scrape/blog')
  async scrapeBlog(@Body() dto: BlogRequestDto) {
    return this.blogScraper.captureBlogSnapshot(dto);
  }

  @Post('batch/blog')
  async scrapeBlogBatch(@Body() dto: BatchRequestDto<BlogRequestDto>) {
    return this.blogScraper.captureBlogBatch(dto);
  }

  @Post('scrape/video')
  async cacheVideo(@Body() dto: VideoRequestDto) {
    return this.videoCache.cacheVideo(dto);
  }

  @Post('batch/video')
  async cacheVideoBatch(@Body() dto: BatchRequestDto<VideoRequestDto>) {
    return this.videoCache.cacheVideoBatch(dto);
  }
}
