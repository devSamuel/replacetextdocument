import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExtractorsModule } from './extractors/extractors.module';
import { GeneratorsModule } from './generators/generators.module';
import { KafkaModule } from './kafka/kafka.module';
import { RedisModule } from './redis/redis.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ExtractorsModule,
    GeneratorsModule,
    KafkaModule,
    RedisModule,
    JobsModule,
  ],
})
export class AppModule {}
