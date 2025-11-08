import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AnonymizeUAPlugin from 'puppeteer-extra-plugin-anonymize-ua';
import type { Browser, Page } from 'puppeteer';
import { AppConfig } from '../config/app.config';

puppeteer.use(StealthPlugin());
puppeteer.use(
  AnonymizeUAPlugin({
    stripHeadless: true,
    makeWindows: true,
  }),
);

@Injectable()
export class PuppeteerService implements OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerService.name);
  private browser?: Browser;

  private async launchBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const headlessEnv = process.env.PUPPETEER_HEADLESS?.toLowerCase();
    const headlessOption: boolean | 'shell' =
      headlessEnv === 'shell' ? 'shell' : headlessEnv === 'false' ? false : true;

    this.logger.log('Launching shared Puppeteer browser instance');
    this.browser = await puppeteer.launch({
      headless: headlessOption,
      executablePath: AppConfig.puppeteerExecutablePath,
      args: AppConfig.puppeteerArgs,
      defaultViewport: { width: 1280, height: 800 },
    });

    return this.browser;
  }

  async withPage<T>(handler: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.launchBrowser();
    const page = await browser.newPage();
    try {
      await page.setUserAgent(
        process.env.SCRAPER_USER_AGENT ??
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      );
      return await handler(page);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
      this.logger.log('Closed Puppeteer browser');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
