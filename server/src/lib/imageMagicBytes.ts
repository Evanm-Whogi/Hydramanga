import fs from 'fs-extra';

const SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

/** Reject buffers whose content does not match a known image signature. */
export function bufferMatchesAllowedImageSignature(header: Buffer): boolean {
  if (header.length < 3) return false;
  for (const { bytes } of SIGNATURES) {
    if (bytes.every((b, i) => header[i] === b)) {
      if (bytes[0] === 0x52) {
        return header.length >= 12 && header.toString('ascii', 8, 12) === 'WEBP';
      }
      return true;
    }
  }
  return false;
}

/** Reject uploads whose content does not match a known image signature. */
export async function fileMatchesAllowedImageSignature(filePath: string): Promise<boolean> {
  const header = Buffer.alloc(12);
  const fd = await fs.open(filePath, 'r');
  try {
    const { bytesRead } = await fs.read(fd, header, 0, 12, 0);
    return bufferMatchesAllowedImageSignature(header.subarray(0, bytesRead));
  } finally {
    await fs.close(fd);
  }
}
