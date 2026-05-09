import { findSafeSplit } from './utils';

export interface TextChunk {
  text: string;
  index: number;
  isLast: boolean;
}

export class TextChunker implements AsyncIterable<TextChunk> {
  constructor(
    private readonly stream: NodeJS.ReadableStream,
    private readonly peeked: Buffer,
    private readonly chunkSize: number,
    private readonly keywords: string[],
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<TextChunk> {
    let buffer = this.peeked.toString('utf8');
    let index = 0;
    const maxKwLen = Math.max(...this.keywords.map(k => k.length), 1);

    // Keep one chunk buffered so we can set isLast correctly on the previous one
    let pending: TextChunk | null = null;

    for await (const raw of this.stream) {
      buffer += (raw as Buffer).toString('utf8');

      while (buffer.length >= this.chunkSize + maxKwLen) {
        const splitAt = findSafeSplit(buffer, this.chunkSize, this.keywords);
        const chunk: TextChunk = { text: buffer.slice(0, splitAt), index: index++, isLast: false };
        if (pending) yield pending;
        pending = chunk;
        buffer = buffer.slice(splitAt);
      }
    }

    // Flush remaining buffer
    if (buffer.length > 0) {
      if (pending) yield pending;
      yield { text: buffer, index: index++, isLast: true };
    } else if (pending) {
      pending.isLast = true;
      yield pending;
    } else {
      // Empty stream — emit a single empty chunk
      yield { text: '', index: 0, isLast: true };
    }
  }
}
