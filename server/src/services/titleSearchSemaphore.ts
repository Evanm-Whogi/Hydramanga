/**
 * Title Search Semaphore
 * Prevents concurrent title searches across all manga to avoid rate limiting
 * Ensures only one title is being searched for at a time globally
 */

class TitleSearchSemaphore {
    private searchInProgress = false;
    private waitQueue: Array<() => void> = [];

    async lock<T>(fn: () => Promise<T>): Promise<T> {
        // Wait until semaphore is free
        while (this.searchInProgress) {
            await new Promise(resolve => {
                this.waitQueue.push(resolve as any);
            });
        }

        this.searchInProgress = true;
        try {
            return await fn();
        } finally {
            this.searchInProgress = false;
            // Wake up next waiter
            const next = this.waitQueue.shift();
            if (next) next();
        }
    }
}

export const titleSearchSemaphore = new TitleSearchSemaphore();
