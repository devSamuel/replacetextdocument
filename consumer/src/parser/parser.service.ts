import { Injectable } from '@nestjs/common';

@Injectable()
export class ParserService {
  parse(keywordsStr: string): string[] {
    if (!keywordsStr) return [];
    const terms: string[] = [];
    const quotedPattern = /["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = quotedPattern.exec(keywordsStr)) !== null) {
      const phrase = match[1].trim();
      if (phrase) terms.push(phrase);
    }
    const remainder = keywordsStr.replace(/["'][^"']*["']/g, '');
    terms.push(...remainder.split(/[,\s]+/).filter(t => t.trim().length > 0));
    return [...new Set(terms)].sort((a, b) => b.length - a.length);
  }
}
