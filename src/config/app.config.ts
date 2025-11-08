import path from 'path';

export const AppConfig = {
  snapshotDir: process.env.SNAPSHOT_DIR ?? path.resolve(process.cwd(), 'storage', 'snapshots'),
  videoCacheDir: process.env.VIDEO_CACHE_DIR ?? path.resolve(process.cwd(), 'storage', 'videos'),
  annotationDir: process.env.ANNOTATION_DIR ?? path.resolve(process.cwd(), 'storage', 'annotations'),
  puppeteerExecutablePath: process.env.CHROMIUM_PATH,
  puppeteerArgs: (process.env.PUPPETEER_ARGS ?? '--no-sandbox --disable-gpu')
    .split(/\s+/)
    .filter((arg) => !!arg),
};
