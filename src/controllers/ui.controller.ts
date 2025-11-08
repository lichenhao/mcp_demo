import { Controller, Get, Render } from '@nestjs/common';

@Controller('ui')
export class UiController {
  private readonly modeOptions = [
    { label: '自动识别', value: 'auto', selected: true },
    { label: '文章', value: 'blog' },
    { label: '视频', value: 'video' },
  ];

  private readonly waitForSelectorOptions = [
    { label: '自动（article/section）', value: '', selected: true },
    { label: 'article', value: 'article' },
    { label: 'main', value: 'main' },
    { label: 'section', value: 'section' },
    { label: '.RichContent', value: '.RichContent' },
    { label: '.post-content', value: '.post-content' },
    { label: '#content', value: '#content' },
    { label: '自定义...', value: '__custom__' },
  ];

  private readonly viewportPresets = [
    { id: 'desktop', label: '桌面 · 1280×800', width: 1280, height: 800, default: true },
    { id: 'laptop', label: '笔记本 · 1440×900', width: 1440, height: 900 },
    { id: 'tablet', label: '平板 · 1024×1366', width: 1024, height: 1366 },
    { id: 'mobile', label: '移动 · 390×844', width: 390, height: 844 },
    { id: 'custom', label: '自定义', width: '', height: '' },
  ];

  private readonly videoDownloaders = [
    { label: '默认（yt-dlp）', value: 'yt-dlp', default: true },
    { label: 'you-get', value: 'you-get' },
    { label: 'annie', value: 'annie' },
  ];

  private readonly videoFormats = [
    { label: 'bestvideo+bestaudio/best', value: 'bestvideo+bestaudio/best', default: true },
    { label: 'best[height<=720]', value: 'best[height<=720]' },
    { label: 'worst', value: 'worst' },
  ];

  private readonly videoOutputTemplates = [
    { label: '%(title)s.%(ext)s', value: '%(title)s.%(ext)s', default: true },
    {
      label: '%(uploader)s/%(upload_date)s-%(title)s.%(ext)s',
      value: '%(uploader)s/%(upload_date)s-%(title)s.%(ext)s',
    },
  ];

  @Get()
  @Render('ui')
  render() {
    return {
      modeOptions: this.modeOptions,
      waitForSelectorOptions: this.waitForSelectorOptions,
      viewportPresets: this.viewportPresets,
      videoDownloaders: this.videoDownloaders,
      videoFormats: this.videoFormats,
      videoOutputTemplates: this.videoOutputTemplates,
      uiConfigJson: JSON.stringify({
        videoHostPattern: '(youtube\\.com|youtu\\.be|bilibili\\.com|youku\\.com|iqiyi\\.com|vimeo\\.com)',
      }),
    };
  }
}
