import { Server } from 'socket.io';

/**
 * Global Socket.IO instance manager
 * This allows other services to broadcast to connected clients
 */
let ioInstance: Server | null = null;

export function setIOInstance(io: Server) {
  ioInstance = io;
}

export function getIOInstance(): Server | null {
  return ioInstance;
}

export function isIOInitialized(): boolean {
  return ioInstance !== null;
}
