import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { FormatDetectorService } from './format-detector.service';
import { PdfExtractor } from './pdf.extractor';
import { DocxExtractor } from './docx.extractor';
import { OdtExtractor } from './odt.extractor';
import { RtfExtractor } from './rtf.extractor';
import { TextExtractor } from './text.extractor';
import { IExtractor } from '../common/interfaces/extractor.interface';

@Injectable()
export class ExtractorRegistryService {
  private readonly registry: Map<string, IExtractor>;

  constructor(
    private readonly detector: FormatDetectorService,
    private readonly pdf: PdfExtractor,
    private readonly docx: DocxExtractor,
    private readonly odt: OdtExtractor,
    private readonly rtf: RtfExtractor,
    private readonly text: TextExtractor,
  ) {
    this.registry = new Map<string, IExtractor>([
      ['pdf', pdf],
      ['docx', docx],
      ['odt', odt],
      ['rtf', rtf],
      ['text', text],
    ]);
  }

  async extractText(buf: Buffer): Promise<string> {
    const fmt = await this.detector.detect(buf);
    return (this.registry.get(fmt) ?? this.text).extract(buf);
  }

  async extractFromPath(fmt: string, filePath: string): Promise<string> {
    switch (fmt) {
      case 'pdf':  return this.pdf.extractFromPath(filePath);
      case 'docx': return this.docx.extractFromPath(filePath);
      case 'odt':  return this.odt.extractFromPath(filePath);
      case 'rtf':  return this.rtf.extractFromPath(filePath);
      default:     return fs.promises.readFile(filePath, 'utf8');
    }
  }
}
