import { NestFactory } from '@nestjs/core';
import readline from 'readline';
import { AppModule } from './app.module';
import { BlogScraperService } from './services/blog-scraper.service';
import { VideoCacheService } from './services/video-cache.service';
import { BlogRequestDto } from './dto/blog-request.dto';
import { VideoRequestDto } from './dto/video-request.dto';
import { BatchRequestDto } from './dto/batch-request.dto';

type StdAction = 'blog' | 'video' | 'blogBatch' | 'videoBatch';

interface StdCommand {
  action: StdAction;
  payload: unknown;
}

async function bootstrapStdService() {
  const appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const blogService = appContext.get(BlogScraperService);
  const videoService = appContext.get(VideoCacheService);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  console.log(
    'STD mode ready. Example: {"action":"blog","payload":{"url":"https://example.com"}} or batch via action "blogBatch"/"videoBatch".',
  );

  const handleLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      const command = JSON.parse(trimmed) as StdCommand;
      let result: unknown;
      switch (command.action) {
        case 'blog':
          result = await blogService.captureBlogSnapshot(command.payload as BlogRequestDto);
          break;
        case 'video':
          result = await videoService.cacheVideo(command.payload as VideoRequestDto);
          break;
        case 'blogBatch':
          result = await blogService.captureBlogBatch(command.payload as BatchRequestDto<BlogRequestDto>);
          break;
        case 'videoBatch':
          result = await videoService.cacheVideoBatch(
            command.payload as BatchRequestDto<VideoRequestDto>,
          );
          break;
        default:
          throw new Error(`Unsupported action ${command.action}`);
      }

      console.log(JSON.stringify({ success: true, result }));
    } catch (error) {
      console.error(JSON.stringify({ success: false, error: (error as Error).message }));
    }
  };

  rl.on('line', (line) => {
    handleLine(line).catch((error) => {
      console.error(JSON.stringify({ success: false, error: error.message }));
    });
  });

  const shutdown = async () => {
    rl.close();
    await appContext.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrapStdService().catch((error) => {
  console.error('STD service failed to start', error);
  process.exit(1);
});
