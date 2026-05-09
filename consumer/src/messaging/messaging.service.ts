import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompressionTypes, Kafka, Producer } from 'kafkajs';
import { RedactService } from '../redact/redact.service';
import { ParserService } from '../parser/parser.service';
import { RedisService } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';

interface RedactJob {
  type: 'redact';
  jobId: string;
  text: string;
  keywords: string;
}

interface RedactChunkJob {
  type: 'redact-chunk';
  jobId: string;
  chunkIndex: number;
  text: string;
  keywords: string;
  isLast: boolean;
}

interface UnredactJob {
  type: 'unredact';
  jobId: string;
  text: string;
  key: string;
}

type KafkaJob = RedactJob | RedactChunkJob | UnredactJob;

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private producer!: Producer;
  private readonly logger = new Logger(MessagingService.name);
  private readonly outputTopic: string;

  constructor(
    private readonly config: ConfigService,
    private readonly redact: RedactService,
    private readonly parser: ParserService,
    private readonly redis: RedisService,
    private readonly db: DatabaseService,
  ) {
    this.outputTopic = config.get<string>('TOPIC_CONFIRMED_ORDERS') ?? 'confirmed-orders';
    const kafka = new Kafka({
      clientId: 'consumer-service-producer',
      brokers: (config.get<string>('KAFKA_BOOTSTRAP_SERVERS') ?? 'broker1:9092').split(','),
      retry: { retries: 15, initialRetryTime: 500, maxRetryTime: 15000 },
    });
    this.producer = kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.logger.log('Output Kafka producer connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
    this.logger.log('Output Kafka producer disconnected cleanly');
  }

  async process(job: KafkaJob): Promise<void> {
    try {
      if (job.type === 'redact') {
        const { redactedText, replacements } = this.redact.redact(job.text, job.keywords);
        const keywords = this.parser.parse(job.keywords);

        // Single pipeline round-trip: replaces two sequential Redis awaits
        await this.redis.storeJobData(job.jobId, replacements, {
          status: 'done',
          type: 'redact',
          key: job.jobId,
          redactedText,
        });

        // Postgres is audit-only; Redis holds the authoritative result.
        // Fire-and-forget so DB latency never delays the Kafka offset commit.
        setImmediate(() => {
          this.db.insertDocument({ jobId: job.jobId, type: 'redact', redactedText, keywords })
            .catch((err: unknown) =>
              this.logger.error(`DB insert failed job=${job.jobId}: ${err instanceof Error ? err.message : String(err)}`));
        });

      } else if (job.type === 'redact-chunk') {
        const { redactedText, replacements } = this.redact.redact(job.text, job.keywords);
        await this.redis.storeChunkResult(job.jobId, job.chunkIndex, redactedText, replacements);

        if (!job.isLast) return;

        const totalChunks = job.chunkIndex + 1;
        try {
          await this.redis.assembleChunks(job.jobId, totalChunks, {
            status: 'done',
            type: 'redact',
            key: job.jobId,
          });
        } catch (assembleErr: unknown) {
          // Chunk data is permanently lost (e.g. previous OOM crash deleted keys).
          // Store error result so client gets a response, then commit the offset.
          const msg = assembleErr instanceof Error ? assembleErr.message : String(assembleErr);
          this.logger.error(`Assembly failed for job ${job.jobId}: ${msg} — marking as error`);
          await this.redis.storeResult(job.jobId, { status: 'error', error: msg });
          return;
        }

        const keywords = this.parser.parse(job.keywords);
        setImmediate(() => {
          this.db.insertDocument({ jobId: job.jobId, type: 'redact', redactedText: '(chunked — see result)', keywords })
            .catch((err: unknown) =>
              this.logger.error(`DB insert failed job=${job.jobId}: ${err instanceof Error ? err.message : String(err)}`));
        });

      } else if (job.type === 'unredact') {
        const replacements = await this.redis.getReplacements(job.key);
        const originalText = this.redact.unredact(job.text, replacements);

        await this.redis.storeResult(job.jobId, { status: 'done', type: 'unredact', originalText });

        setImmediate(() => {
          this.db.insertDocument({ jobId: job.jobId, type: 'unredact', redactedText: job.text, keywords: [] })
            .catch((err: unknown) =>
              this.logger.error(`DB insert failed job=${job.jobId}: ${err instanceof Error ? err.message : String(err)}`));
        });

      } else {
        this.logger.warn(`Unknown job type: ${(job as { type: string }).type}`);
        return;
      }

      const notifyType = job.type === 'redact-chunk' ? 'redact' : job.type;
      await this.producer.send({
        topic: this.outputTopic,
        compression: CompressionTypes.GZIP,
        messages: [{ value: JSON.stringify({ type: notifyType, jobId: job.jobId, status: 'done' }) }],
      });

    } catch (err: unknown) {
      this.logger.error(`Error processing job ${job.jobId}: ${err instanceof Error ? err.message : String(err)}`);
      // Re-throw so NestJS Kafka transport does NOT commit the offset — message will be retried
      throw err;
    }
  }
}
