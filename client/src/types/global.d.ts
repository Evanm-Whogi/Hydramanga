
export interface ImportStatus {
    status: string;
    progress: number;
    id: string;
    timestamp: string;
}

export interface Heartbeat {
    status: number;
    message: string;
}

