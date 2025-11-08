import { Injectable, Logger } from '@nestjs/common';
import TurndownService from 'turndown';
import fs from 'fs/promises';
import path from 'path';
import { AppConfig } from '../config/app.config';
import { sanitizeFilename, formatDateLabel } from '../utils/file.util';

export interface SnapshotArtifactsOptions {
  title: string;
  preferredName?: string;
  snapshotDate?: Date;
}

export interface SnapshotArtifacts {
  baseName: string;
  markdownPath: string;
  assetsDir: string;
  snapshotDate: Date;
}

export interface LocalizeImagesOptions {
  baseUrl: string;
  assetDir: string;
  assetPathPrefix?: string;
  fetcher?: typeof fetch;
}

export interface LocalizeImagesResult {
  markdown: string;
  assets: string[];
}

@Injectable()
export class MarkdownService {
  private readonly logger = new Logger(MarkdownService.name);
  private readonly turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
  });

  toMarkdown(html: string): string {
    return this.turndown.turndown(html);
  }

  async prepareSnapshotArtifacts(options: SnapshotArtifactsOptions): Promise<SnapshotArtifacts> {
    const snapshotDate = options.snapshotDate ?? new Date();
    const targetDir = AppConfig.snapshotDir;
    await fs.mkdir(targetDir, { recursive: true });

    const safeTitle = sanitizeFilename(options.preferredName ?? options.title);
    const baseSeed = `${safeTitle || 'snapshot'}-${formatDateLabel(snapshotDate)}`;

    let attempt = 0;
    let baseName = baseSeed;
    let markdownPath = path.join(targetDir, `${baseName}.md`);

    while (await this.pathExists(markdownPath)) {
      attempt += 1;
      baseName = `${baseSeed}-${attempt}`;
      markdownPath = path.join(targetDir, `${baseName}.md`);
    }

    const assetsDir = path.join(targetDir, `${baseName}_assets`);
    await fs.mkdir(assetsDir, { recursive: true });

    return {
      baseName,
      markdownPath,
      assetsDir,
      snapshotDate,
    };
  }

  async localizeImages(markdown: string, options: LocalizeImagesOptions): Promise<LocalizeImagesResult> {
    const fetcher = options.fetcher ?? (globalThis.fetch as typeof fetch | undefined);
    if (!fetcher) {
      throw new Error('Global fetch API is unavailable; cannot cache images locally');
    }

    const normalizedEntries = this.extractImageEntries(markdown, options.baseUrl);
    if (!normalizedEntries.length) {
      return { markdown, assets: [] };
    }

    const assetPrefix =
      options.assetPathPrefix ?? `./${path.posix.join(path.basename(options.assetDir), '/')}`.replace(/\/+$/, '/');
    const assetsMap = new Map<string, { absolutePath: string; relativePath: string }>();
    const downloadedAssets: string[] = [];

    for (const entry of normalizedEntries) {
      if (!entry.normalizedUrl || assetsMap.has(entry.normalizedUrl)) {
        continue;
      }

      const fileName = this.buildAssetFilename(entry.normalizedUrl, assetsMap.size + 1);
      const absolutePath = path.join(options.assetDir, fileName);
      try {
        const response = await fetcher(entry.normalizedUrl);
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(absolutePath, buffer);
        const relativePath = `${assetPrefix}${fileName}`;
        assetsMap.set(entry.normalizedUrl, { absolutePath, relativePath });
        downloadedAssets.push(absolutePath);
      } catch (error) {
        this.logger.warn(`Failed to cache image ${entry.normalizedUrl}: ${(error as Error).message}`);
      }
    }

    let cursor = 0;
    let localized = '';
    for (const entry of normalizedEntries) {
      localized += markdown.slice(cursor, entry.start);

      if (entry.normalizedUrl && assetsMap.has(entry.normalizedUrl)) {
        const target = assetsMap.get(entry.normalizedUrl)!;
        localized += `![${entry.alt}](${target.relativePath})`;
      } else {
        localized += entry.rawText;
      }

      cursor = entry.end;
    }
    localized += markdown.slice(cursor);

    return { markdown: localized, assets: downloadedAssets };
  }

  async persistSnapshot(markdown: string, artifacts: SnapshotArtifacts): Promise<string> {
    await fs.writeFile(artifacts.markdownPath, markdown, 'utf-8');
    return artifacts.markdownPath;
  }

  private extractImageEntries(markdown: string, baseUrl: string) {
    const imageRegex = /!\[([^\]]*)]\(([^)]+)\)/g;
    const entries: {
      start: number;
      end: number;
      alt: string;
      url: string;
      normalizedUrl?: string;
      rawText: string;
    }[] = [];
    let match: RegExpExecArray | null;

    while ((match = imageRegex.exec(markdown)) !== null) {
      const rawUrl = match[2].trim();
      const cleanedUrl = rawUrl.replace(/\s+"[^"]*"$/, '');
      const normalizedUrl = this.normalizeImageUrl(cleanedUrl, baseUrl);
      entries.push({
        start: match.index,
        end: imageRegex.lastIndex,
        alt: match[1],
        url: cleanedUrl,
        normalizedUrl,
        rawText: match[0],
      });
    }

    return entries;
  }

  private normalizeImageUrl(src: string, baseUrl: string): string | undefined {
    if (!src || src.startsWith('data:')) {
      return undefined;
    }
    try {
      if (/^https?:/i.test(src)) {
        return src;
      }
      return new URL(src, baseUrl).toString();
    } catch {
      return undefined;
    }
  }

  private buildAssetFilename(imageUrl: string, index: number): string {
    try {
      const parsed = new URL(imageUrl);
      const { name, ext } = path.parse(parsed.pathname);
      const safeBase = sanitizeFilename(name || `image-${index}`);
      const safeExt = ext?.slice(0, 8) || '.img';
      return `${safeBase || 'image'}-${index}${safeExt}`;
    } catch {
      return `image-${index}.img`;
    }
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }
}
