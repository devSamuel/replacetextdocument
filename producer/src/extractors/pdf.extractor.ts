import { Injectable } from '@nestjs/common';
import { IExtractor } from '../common/interfaces/extractor.interface';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require('pdfjs-dist/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = false;

@Injectable()
export class PdfExtractor implements IExtractor {
  async extract(buf: Buffer): Promise<string> {
    const data = new Uint8Array(buf);
    const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
    return this.readPages(doc);
  }

  async extractFromPath(filePath: string): Promise<string> {
    const doc = await pdfjsLib.getDocument({ url: `file://${filePath}`, useSystemFonts: true }).promise;
    return this.readPages(doc);
  }

  private async readPages(doc: { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str: string; hasEOL: boolean }> }> }> }): Promise<string> {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '', lines: string[] = [];
      for (const item of content.items as Array<{ str: string; hasEOL: boolean }>) {
        line += item.str;
        if (item.hasEOL) { lines.push(line); line = ''; }
      }
      if (line.trim()) lines.push(line);
      pages.push(lines.join('\n'));
    }
    return pages.join('\n\n');
  }
}
