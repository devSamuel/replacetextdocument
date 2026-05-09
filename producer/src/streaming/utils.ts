import * as fs from 'fs';
import { PassThrough } from 'stream';

export async function peekStream(
  stream: NodeJS.ReadableStream,
  bytes: number,
): Promise<{ peeked: Buffer; remaining: NodeJS.ReadableStream }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let collected = 0;

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      collected += chunk.length;
      if (collected >= bytes) {
        stream.removeListener('data', onData);
        stream.removeListener('error', reject);
        stream.removeListener('end', onEnd);
        stream.pause();
        const all = Buffer.concat(chunks);
        const peeked = all.slice(0, bytes);
        const rest = all.slice(bytes); // bytes after the peek window
        const pt = new PassThrough();
        if (rest.length > 0) pt.write(rest);
        stream.pipe(pt);
        stream.resume();
        resolve({ peeked, remaining: pt });
      }
    };

    const onEnd = () => {
      const all = Buffer.concat(chunks);
      const peeked = all.slice(0, bytes);
      const rest = all.slice(bytes);
      const pt = new PassThrough();
      if (rest.length > 0) pt.write(rest);
      pt.end();
      resolve({ peeked, remaining: pt });
    };

    stream.on('data', onData);
    stream.on('error', reject);
    stream.on('end', onEnd);
  });
}

export async function streamToFile(
  stream: NodeJS.ReadableStream,
  leading: Buffer,
  filePath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    ws.write(leading);
    stream.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
    stream.on('error', reject);
  });
}

export async function streamToBuffer(
  stream: NodeJS.ReadableStream,
  leading: Buffer,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [leading];
    let total = leading.length;
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
        reject(new Error(`File too large: exceeds ${maxBytes} byte limit`));
      } else {
        chunks.push(chunk);
      }
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export function parseKeywords(kwStr: string): string[] {
  const terms: string[] = [];
  const quotedPattern = /["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = quotedPattern.exec(kwStr)) !== null) {
    const phrase = m[1].trim();
    if (phrase) terms.push(phrase);
  }
  const remainder = kwStr.replace(/["'][^"']*["']/g, '');
  terms.push(...remainder.split(/[,\s]+/).filter(t => t.trim().length > 0));
  return [...new Set(terms)];
}

export function keywordStraddles(text: string, pos: number, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    for (let i = Math.max(0, pos - kw.length + 1); i < pos; i++) {
      if (lower.startsWith(kwLower, i) && i + kw.length > pos) return true;
    }
  }
  return false;
}

export function findSafeSplit(text: string, preferredPos: number, keywords: string[]): number {
  const maxKwLen = Math.max(...keywords.map(k => k.length), 1);
  const searchStart = Math.max(0, preferredPos - maxKwLen * 2);

  for (let pos = preferredPos; pos >= searchStart; pos--) {
    const c = text[pos];
    if (c !== ' ' && c !== '\n' && c !== '\t' && c !== '\r') continue;
    if (!keywordStraddles(text, pos, keywords)) return pos + 1;
  }

  return preferredPos;
}

export function splitTextSafe(text: string, chunkSize: number, keywords: string[]): string[] {
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    if (pos + chunkSize >= text.length) {
      chunks.push(text.slice(pos));
      break;
    }
    const splitAt = findSafeSplit(text, pos + chunkSize, keywords);
    chunks.push(text.slice(pos, splitAt));
    pos = splitAt;
  }
  return chunks;
}
