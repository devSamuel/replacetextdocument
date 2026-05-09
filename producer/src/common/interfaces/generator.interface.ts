export interface IGenerator {
  generate(text: string): Promise<Buffer>;
  readonly mime: string;
  readonly ext: string;
}
