import { Injectable } from '@nestjs/common';
import { IExtractor } from '../common/interfaces/extractor.interface';
import mammoth from 'mammoth';

@Injectable()
export class DocxExtractor implements IExtractor {
  async extract(buf: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  async extractFromPath(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
}
