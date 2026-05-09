import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { MessagingService } from './messaging.service';

@Controller()
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @EventPattern('incoming-orders')
  async handleJob(@Payload() job: unknown): Promise<void> {
    await this.messaging.process(job as Parameters<MessagingService['process']>[0]);
  }
}
