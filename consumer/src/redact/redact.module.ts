import { Module } from '@nestjs/common';
import { RedactService } from './redact.service';
import { ParserModule } from '../parser/parser.module';

@Module({
  imports: [ParserModule],
  providers: [RedactService],
  exports: [RedactService],
})
export class RedactModule {}
