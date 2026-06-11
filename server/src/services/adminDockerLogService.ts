import fs from 'fs';
import Docker from 'dockerode';
import logger from '@/services/loggerService';

export interface AdminDockerContainerRow {
  id: string;
  name: string;
  service: string;
  state: string;
  status: string;
  startedAt: string | null;
}

const DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const DEFAULT_TAIL = 500;
const MIN_TAIL = 50;
const MAX_TAIL = 2000;

export type AdminDockerLogTail = number | 'all';

function getComposeProjectName(): string {
  return (process.env.COMPOSE_PROJECT_NAME || 'mangascrolls').trim().toLowerCase();
}

function demuxDockerLogs(buffer: Buffer): string {
  if (buffer.length === 0) return '';

  // Non-multiplexed plain text (some engines / older setups)
  if (buffer[0] !== 0x01 && buffer[0] !== 0x02) {
    return buffer.toString('utf8');
  }

  const parts: string[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const payloadSize = buffer.readUInt32BE(offset + 4);
    offset += 8;
    if (payloadSize <= 0 || offset + payloadSize > buffer.length) break;
    parts.push(buffer.subarray(offset, offset + payloadSize).toString('utf8'));
    offset += payloadSize;
  }
  return parts.join('');
}

function mapContainerRow(info: Docker.ContainerInfo): AdminDockerContainerRow {
  const labels = info.Labels ?? {};
  const service = labels['com.docker.compose.service'] ?? info.Names[0]?.replace(/^\//, '') ?? info.Id.slice(0, 12);
  const name = info.Names[0]?.replace(/^\//, '') ?? info.Id.slice(0, 12);
  const startedAt = info.State === 'running' && info.Status.startsWith('Up ')
    ? info.Status.replace(/^Up /, '')
    : null;

  return {
    id: info.Id,
    name,
    service,
    state: info.State,
    status: info.Status,
    startedAt,
  };
}

class AdminDockerLogService {
  private docker: Docker | null = null;

  isAvailable(): boolean {
    if (process.env.DOCKER_LOGS_ENABLED === 'false') return false;
    try {
      return fs.existsSync(DOCKER_SOCKET_PATH);
    } catch {
      return false;
    }
  }

  private getDocker(): Docker {
    if (!this.isAvailable()) {
      throw new Error('Docker socket not accessible');
    }
    if (!this.docker) {
      this.docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });
    }
    return this.docker;
  }

  private getProjectFilter(): string {
    return `com.docker.compose.project=${getComposeProjectName()}`;
  }

  private async belongsToProject(containerId: string): Promise<boolean> {
    const docker = this.getDocker();
    const container = docker.getContainer(containerId);
    const inspect = await container.inspect();
    const project = (inspect.Config?.Labels?.['com.docker.compose.project'] ?? '').toLowerCase();
    return project === getComposeProjectName();
  }

  async listContainers(): Promise<{ available: boolean; containers: AdminDockerContainerRow[]; message?: string }> {
    if (!this.isAvailable()) {
      return {
        available: false,
        containers: [],
        message: 'Docker socket not accessible',
      };
    }

    try {
      const docker = this.getDocker();
      const rows = await docker.listContainers({
        all: true,
        filters: { label: [this.getProjectFilter()] },
      });

      const containers = rows
        .map(mapContainerRow)
        .sort((a, b) => a.service.localeCompare(b.service) || a.name.localeCompare(b.name));

      return { available: true, containers };
    } catch (error) {
      logger.error(`Failed to list Docker containers: ${error}`, { service: 'adminDockerLogService' });
      return {
        available: false,
        containers: [],
        message: 'Failed to connect to Docker',
      };
    }
  }

  async getLogs(containerId: string, options?: { tail?: AdminDockerLogTail; timestamps?: boolean }): Promise<{ lines: string; containerId: string; tail: AdminDockerLogTail } | { error: 'not_found' } | { error: 'unavailable'; message: string }> {
    if (!this.isAvailable()) {
      return { error: 'unavailable', message: 'Docker socket not accessible' };
    }

    const requestedTail = options?.tail ?? DEFAULT_TAIL;
    const tailAll = requestedTail === 'all';
    const tail = tailAll
      ? 'all'
      : Number.isFinite(requestedTail)
        ? Math.min(Math.max(Math.floor(requestedTail as number), MIN_TAIL), MAX_TAIL)
        : DEFAULT_TAIL;
    const timestamps = options?.timestamps ?? true;

    try {
      const allowed = await this.belongsToProject(containerId);
      if (!allowed) return { error: 'not_found' };

      const docker = this.getDocker();
      const container = docker.getContainer(containerId);
      const logBuffer = await container.logs({
        stdout: true,
        stderr: true,
        ...(tailAll ? {} : { tail: tail as number }),
        timestamps,
        follow: false,
      });

      const buffer = Buffer.isBuffer(logBuffer) ? logBuffer : Buffer.from(logBuffer);
      const lines = demuxDockerLogs(buffer);

      return { lines, containerId, tail };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('no such container') || message.includes('404')) {
        return { error: 'not_found' };
      }
      logger.error(`Failed to fetch Docker logs for ${containerId}: ${error}`, { service: 'adminDockerLogService' });
      throw error;
    }
  }
}

export const adminDockerLogService = new AdminDockerLogService();
