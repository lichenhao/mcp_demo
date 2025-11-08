export interface BatchJob<T> {
  id?: string;
  payload: T;
}

export interface BatchRequestDto<T> {
  jobs: BatchJob<T>[];
  concurrency?: number;
}
