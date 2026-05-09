import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

const BODY_LIMIT = 50 * 1024 * 1024; // 50 MB — match nginx client_max_body_size

async function bootstrap() {
  const adapter = new FastifyAdapter({ logger: false, bodyLimit: BODY_LIMIT });

  // Pass octet-stream body as a raw readable stream — no buffering in the framework layer
  adapter.getInstance().addContentTypeParser(
    ['application/octet-stream'],
    { bodyLimit: BODY_LIMIT },
    (_req: unknown, payload: unknown, done: (err: null, body: unknown) => void) => done(null, payload),
  );

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`Producer listening on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
