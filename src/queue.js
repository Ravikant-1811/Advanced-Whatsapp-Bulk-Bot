export class DispatchQueue {
  constructor({ worker, concurrency = 1, maxRetries = 3, baseRetryDelayMs = 3000 }) {
    this.worker = worker;
    this.concurrency = concurrency;
    this.maxRetries = maxRetries;
    this.baseRetryDelayMs = baseRetryDelayMs;
    this.running = 0;
    this.jobs = [];
    this.jobCounter = 0;
  }

  enqueue(payload) {
    const job = {
      id: `job_${++this.jobCounter}`,
      payload,
      attempts: 0,
      runAt: Date.now(),
      createdAt: new Date().toISOString(),
    };
    this.jobs.push(job);
    this._pump();
    return job.id;
  }

  stats() {
    return {
      running: this.running,
      queued: this.jobs.length,
    };
  }

  _nextJob() {
    const now = Date.now();
    const index = this.jobs.findIndex((j) => j.runAt <= now);
    if (index === -1) return null;
    return this.jobs.splice(index, 1)[0];
  }

  _pump() {
    while (this.running < this.concurrency) {
      const job = this._nextJob();
      if (!job) break;
      this._run(job);
    }
  }

  async _run(job) {
    this.running += 1;
    try {
      await this.worker(job.payload, job);
    } catch (error) {
      job.attempts += 1;
      if (job.attempts <= this.maxRetries) {
        const backoff = this.baseRetryDelayMs * 2 ** (job.attempts - 1);
        job.runAt = Date.now() + backoff;
        this.jobs.push(job);
      } else {
        // final drop; worker should already log the failure reason
      }
      if (error) {
        // intentionally ignored to keep queue worker alive
      }
    } finally {
      this.running -= 1;
      this._pump();
    }
  }
}
