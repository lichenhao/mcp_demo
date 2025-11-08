import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Render,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { AppConfig } from '../config/app.config';
import { MarkdownRendererService } from '../services/markdown-renderer.service';
import { AnnotationService } from '../services/annotation.service';
import { AnnotationDto, AnnotationRecord } from '../dto/annotation.dto';

@Controller('snapshots')
export class PreviewController {
  private readonly expertiseOptions = [
    '技术实现',
    '内容润色',
    '排版优化',
    '数据核验',
    '产品体验',
  ];

  constructor(
    private readonly renderer: MarkdownRendererService,
    private readonly annotations: AnnotationService,
  ) {}

  @Get()
  @Render('snapshots/index')
  async index() {
    const snapshots = await this.readSnapshotList();
    const items = snapshots.map((snapshot) => ({
      fileName: snapshot.fileName,
      encodedName: encodeURIComponent(snapshot.fileName),
      updatedAtDisplay: this.formatDate(snapshot.updatedAt),
      sizeDisplay: this.formatSize(snapshot.size),
    }));

    return {
      title: '文章快照',
      total: items.length,
      hasSnapshots: items.length > 0,
      snapshots: items,
    };
  }

  @Get(':fileName/preview')
  @Render('snapshots/preview')
  async preview(@Param('fileName') fileName: string) {
    const safeName = this.ensureSafeFileName(fileName);
    const snapshotPath = await this.ensureSnapshotExists(safeName);
    const markdown = await fs.readFile(snapshotPath, 'utf-8');
    const html = await this.renderer.toHtml(markdown);
    const initialAnnotations = await this.annotations.list(safeName);
    const encodedName = encodeURIComponent(safeName);
    const annotationsUrl = `/snapshots/${encodedName}/annotations`;
    const downloadUrl = `/snapshots/${encodedName}/raw`;
    const enrichedAnnotations = await this.enrichAnnotations(initialAnnotations);
    const state = this.serializeState({
      fileName: safeName,
      annotationsUrl,
      downloadUrl,
      expertiseOptions: this.expertiseOptions,
      initialAnnotations: enrichedAnnotations,
    });

    return {
      fileName: safeName,
      html,
      downloadUrl,
      annotations: enrichedAnnotations,
      hasAnnotations: enrichedAnnotations.length > 0,
       expertiseOptions: this.expertiseOptions,
      stateJson: state,
    };
  }

  @Get(':fileName/raw')
  async download(@Param('fileName') fileName: string, @Res() res: Response) {
    const safeName = this.ensureSafeFileName(fileName);
    const snapshotPath = await this.ensureSnapshotExists(safeName);
    return res.download(snapshotPath, safeName);
  }

  @Get(':fileName/annotations')
  async list(@Param('fileName') fileName: string) {
    const safeName = this.ensureSafeFileName(fileName);
    await this.ensureSnapshotExists(safeName);
    return this.annotations.list(safeName);
  }

  @Post(':fileName/annotations')
  async add(@Param('fileName') fileName: string, @Body() dto: AnnotationDto) {
    const safeName = this.ensureSafeFileName(fileName);
    await this.ensureSnapshotExists(safeName);
    if (!dto?.quote?.trim() || !dto?.comment?.trim()) {
      throw new BadRequestException('quote and comment are required');
    }
    const payload: AnnotationDto = {
      quote: dto.quote.trim(),
      comment: dto.comment.trim(),
      contextBefore: dto.contextBefore?.slice(-80),
      contextAfter: dto.contextAfter?.slice(0, 80),
    };
    return this.annotations.add(safeName, payload);
  }

  private ensureSafeFileName(fileName: string): string {
    if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new BadRequestException('Invalid file name');
    }
    return fileName;
  }

  private async ensureSnapshotExists(fileName: string): Promise<string> {
    const targetPath = path.resolve(AppConfig.snapshotDir, fileName);
    const snapshotsRoot = path.resolve(AppConfig.snapshotDir);
    if (!targetPath.startsWith(snapshotsRoot)) {
      throw new BadRequestException('Invalid snapshot path');
    }
    try {
      await fs.access(targetPath);
    } catch {
      throw new NotFoundException('Snapshot not found');
    }
    return targetPath;
  }

  private async readSnapshotList(): Promise<
    { fileName: string; size: number; updatedAt: string }[]
  > {
    try {
      const files = await fs.readdir(AppConfig.snapshotDir);
      const items = await Promise.all(
        files.map(async (file) => {
          if (!file.endsWith('.md')) {
            return null;
          }
          const filePath = path.resolve(AppConfig.snapshotDir, file);
          const stats = await fs.stat(filePath);
          return {
            fileName: file,
            size: stats.size,
            updatedAt: stats.mtime.toISOString(),
          };
        }),
      );
      return items
        .filter((item): item is { fileName: string; size: number; updatedAt: string } => !!item)
        .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async enrichAnnotations(annotations: AnnotationRecord[]) {
    return Promise.all(
      annotations.map(async (annotation) => ({
        ...annotation,
        createdAtDisplay: this.formatDate(annotation.createdAt),
        commentHtml: await this.renderer.toHtml(annotation.comment),
        expertise: annotation.expertise ?? [],
      })),
    );
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  private formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  private serializeState(state: Record<string, unknown>): string {
    return JSON.stringify(state).replace(/</g, '\\u003c');
  }
}
