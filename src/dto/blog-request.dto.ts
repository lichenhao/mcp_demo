export interface BlogRequestDto {
  url: string;
  snapshotName?: string;
  waitForSelector?: string;
  viewport?: {
    width: number;
    height: number;
  };
}
