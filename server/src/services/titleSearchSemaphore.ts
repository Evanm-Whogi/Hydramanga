/**
 * Title Search Semaphore
 * Limits concurrent title searches across all manga to avoid rate limiting.
 * Allows up to MAX_CONCURRENT searches at a time (counting semaphore).
 */

const MAX_CONCURRENT = 3;

class TitleSearchSemaphore {
    private activeCount = 0;
    private waitQueue: Array<() => void> = [];

    private async acquire(): Promise<void> {
        if (this.activeCount < MAX_CONCURRENT) {
            this.activeCount++;
            return;
        }
        await new Promise<void>(resolve => {
            this.waitQueue.push(resolve);
        });
        this.activeCount++;
    }

    private release(): void {
        this.activeCount--;
        const next = this.waitQueue.shift();
        if (next) next();
    }

    async lock<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

export const titleSearchSemaphore = new TitleSearchSemaphore();
