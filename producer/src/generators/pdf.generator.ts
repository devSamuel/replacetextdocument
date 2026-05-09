import { Injectable } from '@nestjs/common';
import { IGenerator } from '../common/interfaces/generator.interface';
import PDFDocument from 'pdfkit';

@Injectable()
export class PdfGenerator implements IGenerator {
  readonly mime = 'application/pdf';
  readonly ext = 'pdf';

  generate(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      for (const p of this.paras(text)) {
        doc.fontSize(11).text(p, { lineGap: 4 });
        doc.moveDown(0.5);
      }
      doc.end();
    });
  }

  private paras(text: string): string[] {
    return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  }
}
