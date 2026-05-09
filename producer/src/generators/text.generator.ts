import { Injectable } from '@nestjs/common';
import { IGenerator } from '../common/interfaces/generator.interface';

@Injectable()
export class TextGenerator implements IGenerator {
  readonly mime = 'text/plain; charset=utf-8';
  readonly ext = 'txt';

  async generate(text: string): Promise<Buffer> {
    return Buffer.from(text, 'utf8');
  }
}
