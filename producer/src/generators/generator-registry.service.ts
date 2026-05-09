import { Injectable } from '@nestjs/common';
import { IGenerator } from '../common/interfaces/generator.interface';
import { PdfGenerator } from './pdf.generator';
import { DocxGenerator } from './docx.generator';
import { OdtGenerator } from './odt.generator';
import { RtfGenerator } from './rtf.generator';
import { TextGenerator } from './text.generator';

@Injectable()
export class GeneratorRegistryService {
  private readonly registry: Map<string, IGenerator>;

  constructor(
    private readonly pdf: PdfGenerator,
    private readonly docx: DocxGenerator,
    private readonly odt: OdtGenerator,
    private readonly rtf: RtfGenerator,
    private readonly text: TextGenerator,
  ) {
    this.registry = new Map<string, IGenerator>([
      ['pdf', pdf],
      ['docx', docx],
      ['odt', odt],
      ['rtf', rtf],
      ['text', text],
    ]);
  }

  get(fmt: string): IGenerator | undefined {
    return this.registry.get(fmt);
  }
}
