import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import unzipper from 'unzipper';

@Injectable()
export class FormatDetectorService {
  async detect(buf: Buffer): Promise<string> {
    if (buf.length < 4) return 'text';
    if (buf.slice(0, 4).toString('ascii') === '%PDF') return 'pdf';
    if (buf.slice(0, 4).toString('hex') === '504b0304') {
      try {
        const zip = await JSZip.loadAsync(buf);
        if (zip.file('word/document.xml')) return 'docx';
        if (zip.file('content.xml')) return 'odt';
      } catch { /* fall through */ }
      return 'text';
    }
    if (buf.slice(0, 5).toString('ascii') === '{\\rtf') return 'rtf';
    return 'text';
  }

  detectFromBytes(first8: Buffer): string {
    if (first8.length >= 4 && first8.slice(0, 4).toString('ascii') === '%PDF') return 'pdf';
    if (first8.length >= 4 && first8.slice(0, 4).toString('hex') === '504b0304') return 'zip';
    if (first8.length >= 5 && first8.slice(0, 5).toString('ascii') === '{\\rtf') return 'rtf';
    return 'text';
  }

  async detectZipFormat(filePath: string): Promise<string> {
    try {
      const directory = await unzipper.Open.file(filePath);
      for (const f of directory.files) {
        if (f.path === 'word/document.xml') return 'docx';
        if (f.path === 'content.xml') return 'odt';
      }
    } catch { /* fall through */ }
    return 'text';
  }
}
