import 'express';

// Augment Express's Request with the fields attached by our auth/tracking middleware.
// Declared in an ambient .d.ts so the global is always loaded up front (notably for
// ts-node dev mode, which compiles modules lazily as they are required).
declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: any;
    }
  }
}

export {};
