import { Injectable } from '@nestjs/common';
import { IExtractor } from '../common/interfaces/extractor.interface';
import JSZip from 'jszip';
import unzipper from 'unzipper';

@Injectable()
export class OdtExtractor implements IExtractor {
  async extract(buf: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('content.xml')!.async('string');
    return this.parseXml(xml);
  }

  async extractFromPath(filePath: string): Promise<string> {
    const directory = await unzipper.Open.file(filePath);
    const entry = directory.files.find((f: { path: string }) => f.path === 'content.xml');
    if (!entry) throw new Error('content.xml not found in ODT');
    const xmlBuf = await entry.buffer();
    return this.parseXml(xmlBuf.toString('utf8'));
  }

  private parseXml(xml: string): string {
    return xml
      .replace(/<text:line-break[^>]*\/?>/g, '\n')
      .replace(/<\/text:p>/g, '\n')
      .replace(/<\/text:h>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
