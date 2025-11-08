import { Injectable } from '@nestjs/common';
import { marked } from 'marked';

@Injectable()
export class MarkdownRendererService {
  async toHtml(markdown: string): Promise<string> {
    const result = marked.parse(markdown);
    return typeof result === 'string' ? result : await result;
  }
}
