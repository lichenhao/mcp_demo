export interface BlogSnapshotResult {
  url: string;
  title: string;
  capturedAt: string;
  markdownPath: string;
  markdown: string;
  assetsDir?: string;
  assets?: string[];
  metadata?: {
    byline?: string | null;
    excerpt?: string | null;
    length?: number;
  };
}
