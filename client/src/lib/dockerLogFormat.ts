export type DockerLogLevel = 'error' | 'warn' | 'success' | 'debug' | 'trace' | 'info' | 'progress';

export interface FormattedDockerLogLine {
  text: string;
  level: DockerLogLevel;
}

const ANSI_ESCAPE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const DOCKER_TIMESTAMP_PREFIX = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z\s+/;
const WINSTON_PREFIX = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})\s+(\w+):\s*([\s\S]*)$/;

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '');
}

function formatTime12h(hour24: number, minute: number): string {
  const period = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')}${period}`;
}

function normalizeLevel(raw: string): DockerLogLevel {
  const level = raw.toLowerCase();
  if (['fatal', 'critical', 'crit', 'alert', 'emerg', 'emergency', 'error', 'err'].includes(level)) return 'error';
  if (['warn', 'warning'].includes(level)) return 'warn';
  if (['success'].includes(level)) return 'success';
  if (['debug'].includes(level)) return 'debug';
  if (['trace', 'verbose', 'silly'].includes(level)) return 'trace';
  return 'info';
}

function detectMessageLevel(content: string): DockerLogLevel | null {
  const lower = content.toLowerCase();
  if (lower.includes('progress updated')) return 'progress';
  return null;
}

function detectLogLevelFromContent(line: string): DockerLogLevel {
  const messageLevel = detectMessageLevel(line);
  if (messageLevel) return messageLevel;

  const head = line.slice(0, 120).toLowerCase();
  if (/\[(fatal|critical|crit|alert|emerg|emergency|error|err)\]/i.test(head)) return 'error';
  if (/\b(fatal|critical|crit|alert|emerg|emergency)\b:/.test(head)) return 'error';
  if (/\[(warn|warning)\]/i.test(head)) return 'warn';
  if (/\b(warn|warning)\b:/.test(head)) return 'warn';
  if (/\b(error|err)\b:/.test(head)) return 'error';
  if (/\b(success)\b:/.test(head)) return 'success';
  if (/\b(debug)\b:/.test(head)) return 'debug';
  if (/\b(trace|verbose)\b:/.test(head)) return 'trace';
  if (/\b(notice|info|log)\b:/.test(head)) return 'info';
  if (/^\s*error:/i.test(line)) return 'error';
  if (/^\s*warning:/i.test(line)) return 'warn';
  if (/^\s*notice:/i.test(line)) return 'info';
  if (/^\s*debug:/i.test(line)) return 'debug';
  return 'info';
}

export function formatDockerLogLine(raw: string): FormattedDockerLogLine {
  let line = stripAnsi(raw).replace(/\r$/, '');
  if (!line.trim()) return { text: '', level: 'info' };

  line = line.replace(DOCKER_TIMESTAMP_PREFIX, '');

  const winstonMatch = line.match(WINSTON_PREFIX);
  if (winstonMatch) {
    const date = winstonMatch[1];
    const hourStr = winstonMatch[2];
    const minuteStr = winstonMatch[3];
    const secondStr = winstonMatch[4];
    const levelRaw = winstonMatch[5];
    const message = winstonMatch[6] ?? '';
    if (!date || !hourStr || !minuteStr || !secondStr || !levelRaw) {
      const cleaned = line.trimEnd();
      return { text: cleaned, level: detectLogLevelFromContent(cleaned) };
    }
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    const level = detectMessageLevel(message) ?? normalizeLevel(levelRaw);
    const timeLabel = formatTime12h(hour, minute);
    const text = `${date} ${hourStr}:${minuteStr}:${secondStr} (${timeLabel}) ${levelRaw.toLowerCase()}: ${message}`;
    return { text, level };
  }

  const cleaned = line.trimEnd();
  return { text: cleaned, level: detectLogLevelFromContent(cleaned) };
}

export function formatDockerLogLines(raw: string): FormattedDockerLogLine[] {
  if (!raw) return [];
  return raw.split('\n').map(formatDockerLogLine).filter((line) => line.text.length > 0);
}

export function getDockerLogLineClass(level: DockerLogLevel): string {
  switch (level) {
    case 'error':
      return 'text-red-400';
    case 'warn':
      return 'text-amber-400';
    case 'success':
      return 'text-green-400';
    case 'debug':
      return 'text-sky-400/80';
    case 'trace':
      return 'text-muted/60';
    case 'progress':
      return 'text-teal-400';
    default:
      return 'text-muted';
  }
}

export function filterFormattedLogLines(lines: FormattedDockerLogLine[], query: string): FormattedDockerLogLine[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return lines;
  return lines.filter((line) => line.text.toLowerCase().includes(trimmed));
}
