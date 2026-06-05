import { Request, Response, NextFunction } from 'express';
import { Transform, type Readable } from 'stream';
import { CONTENT_LIMITS } from '@/lib/securityLimits';
import { isAllowedExternalImageUrl } from '@/lib/contentImages';
import { fetchExternalImageStream } from '@/lib/externalImageValidation';

function destroyStream(stream: NodeJS.ReadableStream): void {
  (stream as Readable).destroy();
}

export async function proxyContentImage(req: Request, res: Response, next: NextFunction) {
  try {
    const rawUrl = req.query.url;
    if (typeof rawUrl !== 'string' || !isAllowedExternalImageUrl(rawUrl)) {
      return res.status(400).json({ message: 'Invalid image URL' });
    }
    const { stream, contentType } = await fetchExternalImageStream(rawUrl);
    let sent = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sent += chunk.length;
        if (sent > CONTENT_LIMITS.contentMaxImageBytes) {
          callback(new Error('Image too large'));
          return;
        }
        callback(null, chunk);
      },
    });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    limiter.on('error', () => {
      destroyStream(stream);
      if (!res.headersSent) res.status(413).json({ message: `Image exceeds ${Math.round(CONTENT_LIMITS.contentMaxImageBytes / (1024 * 1024))} MB limit` });
      else res.destroy();
    });
    stream.on('error', () => {
      if (!res.headersSent) res.status(502).json({ message: 'Failed to fetch image' });
      else res.destroy();
    });
    stream.pipe(limiter).pipe(res);
    return undefined;
  } catch (error: any) {
    if (error.message === 'Image too large' || error.message === 'Not an image' || error.message === 'Invalid image URL') {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}
