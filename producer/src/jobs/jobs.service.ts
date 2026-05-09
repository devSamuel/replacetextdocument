import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ExtractorRegistryService } from '../extractors/extractor-registry.service';
import { FormatDetectorService } from '../extractors/format-detector.service';
import { GeneratorRegistryService } from '../generators/generator-registry.service';
import { KafkaService } from '../kafka/kafka.service';
import { RedisService } from '../redis/redis.service';
import { TextChunker } from '../streaming/text-chunker';
import { peekStream, streamToFile, parseKeywords, splitTextSafe } from '../streaming/utils';

const TOPIC = process.env.TOPIC_NEW_ORDERS ?? 'incoming-orders';
const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB uncompressed per Kafka message

interface JobResult {
  type: string;
  redactedText?: string;
  originalText?: string;
  hasText?: boolean; // multi-chunk jobs: full text is in text:{jobId}, not inline
}

@Injectable()
export class JobsService {
  constructor(
    private readonly extractor: ExtractorRegistryService,
    private readonly detector: FormatDetectorService,
    private readonly generator: GeneratorRegistryService,
    private readonly kafka: KafkaService,
    private readonly redis: RedisService,
  ) {}

  async redactStream(stream: NodeJS.ReadableStream, keywords: string): Promise<{ jobId: string }> {
    const jobId = uuidv4();

    const { peeked, remaining } = await peekStream(stream, 8);
    let fmt = this.detector.detectFromBytes(peeked);

    if (fmt === 'text') {
      await this.redis.set(`format:${jobId}`, 'text', 'EX', 3600);
      await this.publishTextStream(jobId, remaining, peeked, keywords);
    } else {
      const tmpPath = path.join(os.tmpdir(), `redact-${jobId}`);
      try {
        await streamToFile(remaining, peeked, tmpPath);
        if (fmt === 'zip') {
          fmt = await this.detector.detectZipFormat(tmpPath);
        }
        await this.redis.set(`format:${jobId}`, fmt, 'EX', 3600);
        const text = await this.extractor.extractFromPath(fmt, tmpPath);
        if (!text.trim()) throw new BadRequestException('Document body is empty');
        await this.publishTextChunks(jobId, text, keywords);
      } catch (err: unknown) {
        if (err instanceof BadRequestException) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new BadRequestException('Failed to parse document: ' + msg);
      } finally {
        fs.unlink(tmpPath, () => {});
      }
    }

    return { jobId };
  }

  private async publishTextChunks(jobId: string, text: string, keywords: string): Promise<void> {
    const parsedKw = parseKeywords(keywords);
    const chunks = splitTextSafe(text, CHUNK_SIZE, parsedKw);
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      if (chunks.length === 1) {
        await this.kafka.publish(TOPIC, { type: 'redact', jobId, text: chunks[0], keywords }, jobId);
      } else {
        await this.kafka.publish(TOPIC, { type: 'redact-chunk', jobId, chunkIndex: i, text: chunks[i], keywords, isLast }, jobId);
      }
    }
  }

  private async publishTextStream(
    jobId: string,
    stream: NodeJS.ReadableStream,
    peeked: Buffer,
    keywords: string,
  ): Promise<void> {
    const parsedKw = parseKeywords(keywords);
    const chunker = new TextChunker(stream, peeked, CHUNK_SIZE, parsedKw);
    let isFirst = true;

    for await (const chunk of chunker) {
      if (isFirst && chunk.isLast) {
        await this.kafka.publish(TOPIC, { type: 'redact', jobId, text: chunk.text, keywords }, jobId);
      } else {
        await this.kafka.publish(TOPIC, { type: 'redact-chunk', jobId, chunkIndex: chunk.index, text: chunk.text, keywords, isLast: chunk.isLast }, jobId);
      }
      isFirst = false;
    }
  }

  async unredact(rawBuffer: Buffer | null, key: string, text: string): Promise<{ jobId: string }> {
    const jobId = uuidv4();
    if (rawBuffer) {
      const fmt = await this.detector.detect(rawBuffer);
      await this.redis.set(`format:${jobId}`, fmt, 'EX', 3600);
    }
    await this.kafka.publish(TOPIC, { type: 'unredact', jobId, text, key });
    return { jobId };
  }

  async getResult(jobId: string): Promise<object> {
    const raw = await this.redis.get(`result:${jobId}`);
    if (!raw) return { status: 'pending' };
    return JSON.parse(raw) as object;
  }

  async download(jobId: string, fmt: string): Promise<{ buf: Buffer; mime: string; ext: string; type: string }> {
    const raw = await this.redis.get(`result:${jobId}`);
    if (!raw) throw new NotFoundException('Job not found or still pending');

    const result = JSON.parse(raw) as JobResult;

    let resolvedFmt = fmt;
    if (resolvedFmt === 'original') {
      resolvedFmt = (await this.redis.get(`format:${jobId}`)) ?? 'text';
    }
    if (resolvedFmt === 'log' || resolvedFmt === 'txt') resolvedFmt = 'text';

    const gen = this.generator.get(resolvedFmt);
    if (!gen) throw new BadRequestException(`Unknown format: ${fmt}`);

    let content: string | undefined | null;
    if (result.type === 'redact') {
      content = result.redactedText ?? (result.hasText ? await this.redis.getText(jobId) : undefined);
    } else {
      content = result.originalText;
    }
    if (!content) throw new NotFoundException('No text content for this job');

    const buf = await gen.generate(content);
    return { buf, mime: gen.mime, ext: gen.ext, type: result.type };
  }
}
