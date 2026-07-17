import TransportStream from 'winston-transport';

type LokiAccessTransportOptions = TransportStream.TransportStreamOptions & {
  host: string;
  labels?: Record<string, string>;
  flushIntervalMs?: number;
  maxBatchSize?: number;
};

type PendingLine = {tsNs: string; line: string; level: string};

/**
 * Batched Winston transport that pushes access logs to Loki's HTTP API.
 * Used so access logs stay out of Docker stdout while still reaching Grafana.
 */
export class LokiAccessTransport extends TransportStream {
  private readonly pushUrl: string;
  private readonly baseLabels: Record<string, string>;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private queue: PendingLine[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(opts: LokiAccessTransportOptions) {
    super(opts);
    this.pushUrl = `${opts.host.replace(/\/$/, '')}/loki/api/v1/push`;
    this.baseLabels = opts.labels || {};
    this.maxBatchSize = opts.maxBatchSize ?? 100;
    this.flushIntervalMs = opts.flushIntervalMs ?? 1000;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();
  }

  log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(() => this.emit('logged', info));

    if (info.type !== 'access') {
      callback();
      return;
    }

    const {level, message, timestamp, ...rest} = info;
    const payload: Record<string, unknown> = {
      level,
      message,
      timestamp,
      ...rest,
    };
    // Winston attaches Symbol keys; JSON.stringify already skips those.
    const line = JSON.stringify(payload);
    const ms = typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN;
    const epochMs = Number.isFinite(ms) ? ms : Date.now();
    this.queue.push({
      tsNs: `${BigInt(epochMs) * BigInt(1_000_000)}`,
      line,
      level: typeof level === 'string' ? level : 'info',
    });

    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
    }

    callback();
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.maxBatchSize);
    try {
      const byLevel = new Map<string, PendingLine[]>();
      for (const entry of batch) {
        const list = byLevel.get(entry.level) || [];
        list.push(entry);
        byLevel.set(entry.level, list);
      }

      const streams = [...byLevel.entries()].map(([level, entries]) => ({
        stream: {
          ...this.baseLabels,
          level,
          type: 'access',
        },
        values: entries.map((e) => [e.tsNs, e.line] as [string, string]),
      }));

      await fetch(this.pushUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({streams}),
      });
    } catch {
      // Drop on failure — access logs are best-effort; avoid console spam loops.
    } finally {
      this.flushing = false;
      if (this.queue.length >= this.maxBatchSize) {
        void this.flush();
      }
    }
  }
}
