import { Injectable } from '@nestjs/common';
import { IExtractor } from '../common/interfaces/extractor.interface';

@Injectable()
export class TextExtractor implements IExtractor {
  async extract(buf: Buffer): Promise<string> {
    return buf.toString('utf8');
  }
}
