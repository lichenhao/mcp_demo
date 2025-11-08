export interface BatchTaskResult<T> {
  id?: string;
  status: 'fulfilled' | 'rejected';
  result?: T;
  error?: string;
  startedAt: string;
  finishedAt: string;
}
