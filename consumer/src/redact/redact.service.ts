import { Injectable } from '@nestjs/common';
import { ParserService } from '../parser/parser.service';

interface Match {
  start: number;
  end: number;
  matched: string;
}

@Injectable()
export class RedactService {
  constructor(private readonly parser: ParserService) {}

  redact(text: string, keywordsStr: string): { redactedText: string; replacements: string[] } {
    const keywords = this.parser.parse(keywordsStr);
    const allMatches: Match[] = [];

    for (const keyword of keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = keyword.includes(' ')
        ? new RegExp(escaped.replace(/ /g, '\\s+'), 'gi')  // match across newlines/page breaks
        : new RegExp(`\\b${escaped}\\b`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        allMatches.push({ start: m.index, end: m.index + m[0].length, matched: m[0] });
      }
    }

    allMatches.sort((a, b) => a.start - b.start);
    const filtered: Match[] = [];
    let lastEnd = -1;
    for (const m of allMatches) {
      if (m.start >= lastEnd) { filtered.push(m); lastEnd = m.end; }
    }

    let result = '', pos = 0;
    const replacements: string[] = [];
    for (const m of filtered) {
      result += text.slice(pos, m.start) + 'XXXX';
      replacements.push(m.matched);
      pos = m.end;
    }
    result += text.slice(pos);
    return { redactedText: result, replacements };
  }

  unredact(redactedText: string, replacements: string[]): string {
    let idx = 0;
    return redactedText.replace(/XXXX/g, () => {
      const word = replacements[idx++];
      return word !== undefined ? word : 'XXXX';
    });
  }
}
