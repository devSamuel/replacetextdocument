import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST') ?? 'redis',
      port: parseInt(this.config.get<string>('REDIS_PORT') ?? '6379'),
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    this.client.on('error', (err: Error) => this.logger.error('Redis error: ' + err.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Pipeline RPUSH+EXPIRE+SET in one TCP round-trip instead of two sequential awaits.
   * Pipeline semantics: all commands sent together; each result checked for errors.
   */
  async storeJobData(
    jobId: string,
    replacements: string[],
    result: object,
    replacementsTtl = 86400,
    resultTtl = 3600,
  ): Promise<void> {
    const pipeline = this.client.pipeline();
    if (replacements.length > 0) {
      // Chunk to avoid spreading a huge array as function arguments (call stack limit)
      const CHUNK = 500;
      for (let i = 0; i < replacements.length; i += CHUNK) {
        pipeline.rpush(`replacements:${jobId}`, ...replacements.slice(i, i + CHUNK));
      }
      pipeline.expire(`replacements:${jobId}`, replacementsTtl);
    }
    pipeline.set(`result:${jobId}`, JSON.stringify(result), 'EX', resultTtl);
    const results = await pipeline.exec();
    if (results) {
      for (const [err] of results) {
        if (err) this.logger.error(`Redis pipeline error for job ${jobId}: ${err.message}`);
      }
    }
  }

  async storeResult(jobId: string, result: object, ttl = 3600): Promise<void> {
    await this.client.set(`result:${jobId}`, JSON.stringify(result), 'EX', ttl);
  }

  async getReplacements(key: string): Promise<string[]> {
    return this.client.lrange(`replacements:${key}`, 0, -1);
  }

  async storeChunkResult(
    jobId: string,
    chunkIndex: number,
    redactedText: string,
    replacements: string[],
    replacementsTtl = 86400,
    textTtl = 3600,
  ): Promise<void> {
    // APPEND redacted text directly — no per-chunk storage key.
    // Redis accumulates the full text server-side; JS heap only holds this 2 MB chunk.
    // Set TTL only on first chunk (chunkIndex 0) to avoid redundant EXPIRE calls.
    const RPUSH_CHUNK = 500;
    const pl = this.client.pipeline();
    pl.append(`text:${jobId}`, redactedText);
    if (chunkIndex === 0) {
      pl.expire(`text:${jobId}`, textTtl);
    }
    if (replacements.length > 0) {
      for (let j = 0; j < replacements.length; j += RPUSH_CHUNK) {
        pl.rpush(`replacements:${jobId}`, ...replacements.slice(j, j + RPUSH_CHUNK));
      }
      if (chunkIndex === 0) {
        pl.expire(`replacements:${jobId}`, replacementsTtl);
      }
    }
    const results = await pl.exec();
    if (results) {
      for (const [err] of results) {
        if (err) this.logger.error(`Redis pipeline error storeChunkResult job=${jobId}: ${err.message}`);
      }
    }
  }

  async assembleChunks(
    jobId: string,
    _totalChunks: number,
    finalResult: { status: string; type: string; key: string },
    replacementsTtl = 86400,
    resultTtl = 3600,
  ): Promise<void> {
    // Reset TTLs on text and replacements so they expire at the same time as result.
    // storeChunkResult set text:{jobId} TTL on chunk 0; reset it here so both clocks
    // start at assembly time, not chunk-0 processing time.
    const pl = this.client.pipeline();
    pl.expire(`text:${jobId}`, resultTtl);
    pl.expire(`replacements:${jobId}`, replacementsTtl);
    pl.set(
      `result:${jobId}`,
      JSON.stringify({ ...finalResult, hasText: true }),
      'EX',
      resultTtl,
    );
    await pl.exec();
  }
}
