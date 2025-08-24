import { MarkdownConverter as MarkdownConverterClass } from './converter';

export const getConverter = function () {
  return Promise.resolve({ MarkdownConverter: MarkdownConverterClass });
};
