import { Injectable } from '@nestjs/common';
import { IGenerator } from '../common/interfaces/generator.interface';

@Injectable()
export class RtfGenerator implements IGenerator {
  readonly mime = 'application/rtf';
  readonly ext = 'rtf';

  async generate(text: string): Promise<Buffer> {
    const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const body = paras.map(p =>
      p.split('\n').map(l => this.esc(l)).join('\\line\n') + '\\par\n'
    ).join('');
    return Buffer.from(`{\\rtf1\\ansi\\deff0\\pard\n${body}}`, 'latin1');
  }

  private esc(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  }
}
