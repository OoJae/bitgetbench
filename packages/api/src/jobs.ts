// A single-concurrency in-memory job queue, backed by the jobs table for status/restart
// visibility. Remote-webhook backtests are slow (many sequential HTTP calls), so they run as
// jobs rather than blocking a request. Single concurrency keeps the SQLite writer uncontended
// and bounds total load. The route creates the job row, then enqueues the task here.

import { updateJob, type Db } from "@bitgetbench/db";

/** A task returns the run id it produced. */
type Task = () => Promise<string>;

export class JobQueue {
  private running = false;
  private readonly queue: Array<{ id: string; task: Task }> = [];

  constructor(private readonly db: Db) {}

  enqueue(id: string, task: Task): void {
    this.queue.push({ id, task });
    void this.drain();
  }

  get pending(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const next = this.queue.shift()!;
        // The whole body is guarded: a status-write failure (e.g. a transient DB error) must not
        // escape drain(), which is fire-and-forget, or it would crash the long-lived API process.
        try {
          updateJob(this.db, next.id, { status: "running", progress: 0 });
          const runId = await next.task();
          updateJob(this.db, next.id, { status: "done", progress: 1, runId });
        } catch (err) {
          try {
            updateJob(this.db, next.id, {
              status: "failed",
              error: (err as Error).message.slice(0, 500),
            });
          } catch {
            // Last resort: the job stays 'running' in the table but the process survives.
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
