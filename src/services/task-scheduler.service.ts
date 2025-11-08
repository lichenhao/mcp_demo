import { Injectable, Logger } from '@nestjs/common';
import { BatchJob, BatchRequestDto } from '../dto/batch-request.dto';
import { BatchTaskResult } from '../interfaces/batch-task-result';

@Injectable()
export class TaskSchedulerService {
  private readonly logger = new Logger(TaskSchedulerService.name);

  async runBatch<TPayload, TResult>(
    request: BatchRequestDto<TPayload>,
    worker: (job: BatchJob<TPayload>) => Promise<TResult>,
  ): Promise<BatchTaskResult<TResult>[]> {
    const jobs = request.jobs ?? [];
    if (!jobs.length) {
      return [];
    }

    const concurrency = Math.max(1, request.concurrency ?? Number(process.env.BATCH_CONCURRENCY ?? 2));
    this.logger.log(`Running batch with ${jobs.length} jobs @ concurrency ${concurrency}`);

    const results: BatchTaskResult<TResult>[] = new Array(jobs.length);
    let cursor = 0;

    const workerRunner = async () => {
      while (true) {
        const index = cursor++;
        if (index >= jobs.length) {
          break;
        }
        const job = jobs[index];
        const startedAt = new Date();
        try {
          const result = await worker(job);
          results[index] = {
            id: job.id,
            status: 'fulfilled',
            result,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
          };
        } catch (error) {
          results[index] = {
            id: job.id,
            status: 'rejected',
            error: (error as Error).message,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
          };
        }
      }
    };

    const runners = Array.from({ length: concurrency }, () => workerRunner());
    await Promise.all(runners);
    return results;
  }
}
