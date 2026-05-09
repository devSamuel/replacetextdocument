import { Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { RedactModule } from '../redact/redact.module';
import { RedisModule } from '../redis/redis.module';
import { DatabaseModule } from '../database/database.module';
import { ParserModule } from '../parser/parser.module';

@Module({
  imports: [RedactModule, RedisModule, DatabaseModule, ParserModule],
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
