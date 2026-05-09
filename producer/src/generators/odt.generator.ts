import { Injectable } from '@nestjs/common';
import { IGenerator } from '../common/interfaces/generator.interface';
import JSZip from 'jszip';

@Injectable()
export class OdtGenerator implements IGenerator {
  readonly mime = 'application/vnd.oasis.opendocument.text';
  readonly ext = 'odt';

  async generate(text: string): Promise<Buffer> {
    const tParas = this.paras(text).map(p => {
      const content = p.split('\n').map((l, i, arr) =>
        this.esc(l) + (i < arr.length - 1 ? '<text:line-break/>' : '')
      ).join('');
      return `<text:p>${content}</text:p>`;
    }).join('');

    const zip = new JSZip();
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
    zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>${tParas}</office:text></office:body></office:document-content>`);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  private paras(text: string): string[] {
    return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
