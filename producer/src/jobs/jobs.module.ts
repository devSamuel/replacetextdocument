import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ExtractorsModule } from '../extractors/extractors.module';
import { GeneratorsModule } from '../generators/generators.module';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [ExtractorsModule, GeneratorsModule, KafkaModule, RedisModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
