export interface IExtractor {
  extract(buf: Buffer): Promise<string>;
}
