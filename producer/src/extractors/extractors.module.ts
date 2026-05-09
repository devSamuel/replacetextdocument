import { Module } from '@nestjs/common';
import { FormatDetectorService } from './format-detector.service';
import { ExtractorRegistryService } from './extractor-registry.service';
import { PdfExtractor } from './pdf.extractor';
import { DocxExtractor } from './docx.extractor';
import { OdtExtractor } from './odt.extractor';
import { RtfExtractor } from './rtf.extractor';
import { TextExtractor } from './text.extractor';

@Module({
  providers: [
    FormatDetectorService,
    PdfExtractor,
    DocxExtractor,
    OdtExtractor,
    RtfExtractor,
    TextExtractor,
    ExtractorRegistryService,
  ],
  exports: [ExtractorRegistryService, FormatDetectorService],
})
export class ExtractorsModule {}
