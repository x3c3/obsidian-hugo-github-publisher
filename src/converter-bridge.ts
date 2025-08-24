import { MarkdownConverter as MarkdownConverterClass } from './converter';

export const getConverter = function (): Promise<{
  MarkdownConverter: typeof MarkdownConverterClass;
}> {
  return Promise.resolve({ MarkdownConverter: MarkdownConverterClass });
};
