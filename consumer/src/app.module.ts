import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ParserModule } from './parser/parser.module';
import { RedactModule } from './redact/redact.module';
import { RedisModule } from './redis/redis.module';
import { DatabaseModule } from './database/database.module';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ParserModule,
    RedactModule,
    RedisModule,
    DatabaseModule,
    MessagingModule,
  ],
})
export class AppModule {}
