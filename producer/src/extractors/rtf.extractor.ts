import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { IExtractor } from '../common/interfaces/extractor.interface';

const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'fldinst']);

@Injectable()
export class RtfExtractor implements IExtractor {
  async extract(buf: Buffer): Promise<string> {
    return this.parseRtf(buf.toString('latin1'));
  }

  async extractFromPath(filePath: string): Promise<string> {
    const content = await fs.promises.readFile(filePath, 'latin1');
    return this.parseRtf(content);
  }

  private parseRtf(rtf: string): string {
    const out: string[] = [];
    let i = 0, depth = 0, skipDepth = 0;
    while (i < rtf.length) {
      const ch = rtf[i];
      if (ch === '{') { depth++; i++; continue; }
      if (ch === '}') {
        if (skipDepth && depth === skipDepth) skipDepth = 0;
        depth--; i++; continue;
      }
      if (ch === '\\') {
        i++;
        if ('\\{}'.includes(rtf[i])) { if (!skipDepth) out.push(rtf[i]); i++; continue; }
        if (rtf[i] === "'") {
          if (!skipDepth) out.push(Buffer.from(rtf.slice(i + 1, i + 3), 'hex').toString('latin1'));
          i += 3; continue;
        }
        if (rtf[i] === '\n' || rtf[i] === '\r') { i++; continue; }
        let word = '';
        while (i < rtf.length && /[a-z]/i.test(rtf[i])) word += rtf[i++];
        while (i < rtf.length && /[-\d]/.test(rtf[i])) i++;
        if (rtf[i] === ' ') i++;
        if (word === '*' || (!skipDepth && RTF_SKIP.has(word))) { skipDepth = depth; continue; }
        if (!skipDepth && (word === 'par' || word === 'page' || word === 'line')) out.push('\n');
        continue;
      }
      if (ch !== '\r' && ch !== '\n' && !skipDepth) out.push(ch);
      i++;
    }
    return out.join('').replace(/\n{3,}/g, '\n\n').trim();
  }
}
