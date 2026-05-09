import { Injectable } from '@nestjs/common';
import { IGenerator } from '../common/interfaces/generator.interface';
import JSZip from 'jszip';

@Injectable()
export class DocxGenerator implements IGenerator {
  readonly mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  readonly ext = 'docx';

  async generate(text: string): Promise<Buffer> {
    const wParas = this.paras(text).map(p => {
      const runs = p.split('\n').map((l, i, arr) =>
        `<w:r><w:t xml:space="preserve">${this.esc(l)}</w:t></w:r>${i < arr.length - 1 ? '<w:r><w:br/></w:r>' : ''}`
      ).join('');
      return `<w:p>${runs}</w:p>`;
    }).join('');

    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${wParas}</w:body></w:document>`);
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  private paras(text: string): string[] {
    return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
