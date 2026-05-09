import { Module } from '@nestjs/common';
import { GeneratorRegistryService } from './generator-registry.service';
import { PdfGenerator } from './pdf.generator';
import { DocxGenerator } from './docx.generator';
import { OdtGenerator } from './odt.generator';
import { RtfGenerator } from './rtf.generator';
import { TextGenerator } from './text.generator';

@Module({
  providers: [
    PdfGenerator,
    DocxGenerator,
    OdtGenerator,
    RtfGenerator,
    TextGenerator,
    GeneratorRegistryService,
  ],
  exports: [GeneratorRegistryService],
})
export class GeneratorsModule {}
