import axios, { type AxiosResponse } from 'axios';
import { isIP } from 'net';
import { extractImageUrls, getContentImageValidationError, isAllowedExternalImageUrl, isExternalImageUrl } from '@/lib/contentImages';
import { CONTENT_LIMITS } from '@/lib/securityLimits';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  const ipType = isIP(host);
  if (ipType === 4) {
    const [a, b] = host.split('.').map((part) => parseInt(part, 10));
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (ipType === 6) {
    if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  }
  return false;
}

export function assertSafeExternalFetchUrl(url: string): void {
  if (!isAllowedExternalImageUrl(url)) throw new Error('Invalid image URL');
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Invalid image URL');
  if (isPrivateOrLocalHost(parsed.hostname)) throw new Error('Image URL host is not allowed');
}

function assertSafeRedirect(options: { hostname?: string; href?: string }): void {
  const hostname = options.hostname ?? (options.href ? new URL(options.href).hostname : '');
  if (isPrivateOrLocalHost(hostname)) throw new Error('Image URL redirect is not allowed');
}

function maxBytesLabel(): string {
  return `${Math.round(CONTENT_LIMITS.contentMaxImageBytes / (1024 * 1024))} MB`;
}

function parseContentLength(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function measureStreamSize(response: AxiosResponse): Promise<number> {
  const stream = response.data;
  let received = 0;
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => {
      received += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      if (received > CONTENT_LIMITS.contentMaxImageBytes) {
        stream.destroy();
        reject(new Error('too large'));
      }
    });
    stream.on('error', reject);
    stream.on('end', () => resolve());
    stream.on('close', () => resolve());
  });
  return received;
}

export async function validateExternalImageSize(url: string): Promise<string | null> {
  try {
    assertSafeExternalFetchUrl(url);
    const head = await axios.head(url, {
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      validateStatus: (status) => status >= 200 && status < 400,
      beforeRedirect: assertSafeRedirect,
    });
    const declaredLength = parseContentLength(head.headers['content-length']);
    if (declaredLength != null) {
      if (declaredLength > CONTENT_LIMITS.contentMaxImageBytes) {
        return `External image must be at most ${maxBytesLabel()}`;
      }
      return null;
    }

    const get = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      responseType: 'stream',
      validateStatus: (status) => status >= 200 && status < 400,
      beforeRedirect: assertSafeRedirect,
    });
    const contentType = String(get.headers['content-type'] ?? '');
    if (contentType && !contentType.startsWith('image/')) {
      get.data.destroy();
      return 'External URL does not point to an image';
    }
    await measureStreamSize(get);
    return null;
  } catch {
    return `External image could not be verified (max ${maxBytesLabel()})`;
  }
}

export async function fetchExternalImageStream(url: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
  assertSafeExternalFetchUrl(url);
  const response = await axios.get(url, {
    timeout: FETCH_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
    responseType: 'stream',
    validateStatus: (status) => status >= 200 && status < 400,
    beforeRedirect: assertSafeRedirect,
  });
  const contentType = String(response.headers['content-type'] ?? '');
  if (contentType && !contentType.startsWith('image/')) {
    response.data.destroy();
    throw new Error('Not an image');
  }
  const declaredLength = parseContentLength(response.headers['content-length']);
  if (declaredLength != null && declaredLength > CONTENT_LIMITS.contentMaxImageBytes) {
    response.data.destroy();
    throw new Error('Image too large');
  }
  return { stream: response.data, contentType: contentType || 'application/octet-stream' };
}

export async function validateContentImagesAsync(content: string): Promise<string | null> {
  const syncError = getContentImageValidationError(content);
  if (syncError) return syncError;
  for (const url of extractImageUrls(content)) {
    if (!isExternalImageUrl(url)) continue;
    const sizeError = await validateExternalImageSize(url);
    if (sizeError) return sizeError;
  }
  return null;
}
