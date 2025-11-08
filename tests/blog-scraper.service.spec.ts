import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { BlogScraperService } from '../src/services/blog-scraper.service';
import { MarkdownService } from '../src/services/markdown.service';
import { TaskSchedulerService } from '../src/services/task-scheduler.service';
import { AppConfig } from '../src/config/app.config';
import { sanitizeFilename, formatDateLabel } from '../src/utils/file.util';

interface BlogFixture {
  url: string;
  title: string;
  image: string;
  html: string;
}

class StubPuppeteerService {
  constructor(private readonly fixtures: BlogFixture[]) {}

  async withPage<T>(handler: (page: any) => Promise<T>): Promise<T> {
    let currentFixture: BlogFixture | undefined;
    const page = {
      setViewport: jest.fn().mockResolvedValue(undefined),
      goto: jest.fn(async (url: string) => {
        currentFixture = this.fixtures.find((fixture) => fixture.url === url);
        if (!currentFixture) {
          throw new Error(`Missing fixture for ${url}`);
        }
      }),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      title: jest.fn(async () => currentFixture?.title ?? 'Fixture'),
      content: jest.fn(async () => currentFixture?.html ?? '<html></html>'),
      close: jest.fn().mockResolvedValue(undefined),
    };

    return handler(page as any);
  }
}

const buildFixtureHtml = (fixture: { url: string; title: string; image: string }) => `<!DOCTYPE html>
<html>
  <head>
    <title>${fixture.title}</title>
  </head>
  <body>
    <article>
      <header><h1>${fixture.title}</h1></header>
      <section>
        <p>Source: <a href="${fixture.url}">${fixture.url}</a></p>
        <p>「Ref」占位符</p>
        <img src="${fixture.image}" alt="${fixture.title} illustration" />
      </section>
    </article>
  </body>
</html>`;

const BLOG_FIXTURES: BlogFixture[] = [
  {
    url: 'https://zhuanlan.zhihu.com/p/645348187',
    title: '知乎 | 大模型时代的安全焦虑',
    image: 'https://pic1.zhimg.com/v2-4f9d7cc2bfbb_logo.png',
    html: '',
  },
  {
    url: 'https://zhuanlan.zhihu.com/p/1934722616544954132',
    title: '知乎 | 从 RAG 到 Agent 的工程化实践',
    image: 'https://static.zhimg.com/zhihu-logo.png',
    html: '',
  },
  {
    url: 'https://juejin.cn/post/7413317657938493459',
    title: '掘金 | 云原生可观测性最佳实践',
    image: 'https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/cdn-logo.png',
    html: '',
  },
  {
    url: 'https://xuqiwei1986.feishu.cn/wiki/K6mJw9P88iSFtAkIHOWcOL2tnlb',
    title: '飞书 | Wiki 中台协作范式',
    image: 'https://sf3-cdn-tos.toutiaostatic.com/obj/bytecom-cn/static/logo.png',
    html: '',
  },
  {
    url: 'https://www.bilibili.com/video/BV1iH1sB5EdY/?spm_id_from=333.1007.tianma.1-1-1.click',
    title: '哔哩哔哩 | BV1iH1sB5EdY',
    image: 'https://i0.hdslb.com/bfs/archive/test-cover.png',
    html: '',
  },
  {
    url: 'https://www.youtube.com/watch?v=PvtWg5D4D08',
    title: 'YouTube | KotlinConf 2024 Keynote',
    image: 'https://i.ytimg.com/vi/PvtWg5D4D08/hqdefault.jpg',
    html: '',
  },
].map((fixture) => ({ ...fixture, html: buildFixtureHtml(fixture) }));

const ORIGINAL_SNAPSHOT_DIR = AppConfig.snapshotDir;
const dateLabel = formatDateLabel(new Date('2024-03-12T10:20:30Z'));
const ORIGINAL_FETCH = global.fetch;

describe('BlogScraperService snapshot requirements', () => {
  let tmpDir: string;
  let service: BlogScraperService;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(async () => {
    jest.setSystemTime(new Date('2024-03-12T10:20:30Z'));
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-tests-'));
    (AppConfig as any).snapshotDir = tmpDir;
    const markdownService = new MarkdownService();
    const scheduler = new TaskSchedulerService();
    const puppeteer = new StubPuppeteerService(BLOG_FIXTURES);
    service = new BlogScraperService(puppeteer as any, markdownService, scheduler);

    fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from(String(input)),
      } as unknown as Response;
    }) as unknown as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  afterEach(async () => {
    global.fetch = ORIGINAL_FETCH;
    await fs.rm(tmpDir, { recursive: true, force: true });
    (AppConfig as any).snapshotDir = ORIGINAL_SNAPSHOT_DIR;
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('creates markdown snapshots for the provided documents with localized assets and Ref headers', async () => {
    const results: { fixture: BlogFixture; result: Awaited<ReturnType<BlogScraperService['captureBlogSnapshot']>> }[] = [];
    for (const fixture of BLOG_FIXTURES) {
      const result = await service.captureBlogSnapshot({ url: fixture.url });
      results.push({ fixture, result });
    }

    expect(fetchMock).toHaveBeenCalledTimes(BLOG_FIXTURES.length);

    for (const { fixture, result } of results) {
      expect(result.markdown.startsWith(`「Ref：[${fixture.url}]」`)).toBe(true);
      expect(result.markdown).toContain(`# ${result.title}`);
      expect(result.assetsDir).toBeTruthy();
      expect(await fs.stat(result.assetsDir!)).toBeTruthy();
      expect(result.assets?.length).toBeGreaterThanOrEqual(1);
      const normalizedMarkdown = result.markdown.replace(/\\_/g, '_');
      expect(normalizedMarkdown).toContain(`Source: [${fixture.url}](${fixture.url})`);
      expect(result.markdown).toContain('「Ref」占位符');

      const expectedBase = `${sanitizeFilename(result.title)}-${dateLabel}`;
      expect(path.basename(result.markdownPath)).toBe(`${expectedBase}.md`);
      expect(path.basename(result.assetsDir!)).toBe(`${expectedBase}_assets`);

      const renderedMarkdown = await fs.readFile(result.markdownPath, 'utf-8');
      expect(renderedMarkdown).toBe(result.markdown);
      expect(renderedMarkdown).toContain(`./${path.basename(result.assetsDir!)}/`);
      expect(renderedMarkdown).toContain(fixture.title);
    }
  });

  it('appends a numeric suffix when snapshot names collide on the same day', async () => {
    const target = BLOG_FIXTURES[0];
    const first = await service.captureBlogSnapshot({ url: target.url });
    const second = await service.captureBlogSnapshot({ url: target.url });

    expect(path.basename(first.markdownPath)).toBe(`${sanitizeFilename(first.title)}-${dateLabel}.md`);
    expect(path.basename(second.markdownPath)).toBe(`${sanitizeFilename(second.title)}-${dateLabel}-1.md`);
  });
});
