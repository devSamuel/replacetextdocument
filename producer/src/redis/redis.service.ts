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

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, mode: 'EX', ttl: number): Promise<void> {
    await this.client.set(key, value, mode, ttl);
  }

  async getText(jobId: string): Promise<string | null> {
    return this.client.get(`text:${jobId}`);
  }
}
