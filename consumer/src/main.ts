import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { KafkaJobDeserializer } from './messaging/deserializer/kafka-job.deserializer';

async function bootstrap() {
  const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'broker1:9092').split(',');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers,
        retry: { retries: 15, initialRetryTime: 500, maxRetryTime: 15000 },
      },
      consumer: {
        groupId: 'redact-consumer-group',
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
        maxBytes: 5 * 1024 * 1024,
        maxBytesPerPartition: 5 * 1024 * 1024,
      },
      run: { partitionsConsumedConcurrently: 4 },
      deserializer: new KafkaJobDeserializer(),
      subscribe: { fromBeginning: false },
    },
  });
  app.enableShutdownHooks();
  await app.listen();
  console.log(`Consumer listening on: ${process.env.TOPIC_NEW_ORDERS ?? 'incoming-orders'}`);
}
bootstrap();
