interface RybbitClient {
  identify: (userId: string, traits?: Record<string, string | number | boolean | null>) => void;
  setTraits?: (traits: Record<string, string | number | boolean | null>) => void;
  clearUserId?: () => void;
  getUserId?: () => string | null;
  event?: (name: string, properties?: Record<string, unknown>) => void;
  onReady?: (callback: (rybbit: RybbitClient) => void) => void;
}

declare global {
  interface Window {
    rybbit?: RybbitClient;
  }
}

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

