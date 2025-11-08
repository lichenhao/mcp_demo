import { Injectable, Logger } from '@nestjs/common';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { AppConfig } from '../config/app.config';
import { AnnotationDto, AnnotationRecord } from '../dto/annotation.dto';

@Injectable()
export class AnnotationService {
  private readonly logger = new Logger(AnnotationService.name);

  async list(fileName: string): Promise<AnnotationRecord[]> {
    const filePath = this.resolveAnnotationPath(fileName);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as AnnotationRecord[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async add(fileName: string, dto: AnnotationDto): Promise<AnnotationRecord[]> {
    const annotations = await this.list(fileName);
    const record: AnnotationRecord = {
      id: randomUUID(),
      quote: dto.quote,
      comment: dto.comment,
      contextBefore: dto.contextBefore,
      contextAfter: dto.contextAfter,
      style: dto.style,
      expertise: dto.expertise ?? [],
      createdAt: new Date().toISOString(),
    };
    annotations.push(record);
    await this.persist(fileName, annotations);
    this.logger.log(`Saved annotation for ${fileName}`);
    return annotations;
  }

  private async persist(fileName: string, annotations: AnnotationRecord[]): Promise<void> {
    const filePath = this.resolveAnnotationPath(fileName);
    await fs.mkdir(AppConfig.annotationDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(annotations, null, 2), 'utf-8');
  }

  private resolveAnnotationPath(fileName: string): string {
    return path.resolve(AppConfig.annotationDir, `${fileName}.annotations.json`);
  }
}
