import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompressionTypes, Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;
  private readonly logger = new Logger(KafkaService.name);
  private connected = false;

  constructor(private readonly config: ConfigService) {
    const kafka = new Kafka({
      clientId: 'producer-service',
      brokers: (this.config.get<string>('KAFKA_BOOTSTRAP_SERVERS') ?? 'broker1:9092').split(','),
      retry: { retries: 15, initialRetryTime: 500, maxRetryTime: 15000 },
    });
    this.producer = kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.connected = true;
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy(): Promise<void> {
    this.connected = false;
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publish(topic: string, message: object, key?: string): Promise<void> {
    await this.producer.send({
      topic,
      compression: CompressionTypes.GZIP,
      messages: [{ key: key ?? null, value: JSON.stringify(message) }],
    });
  }
}
