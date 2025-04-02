import { test, expect } from 'bun:test';
import { MarkdownConverter, ConversionOptions } from './markdownConverter';
import { createMockApp, createMockNote } from './testUtils';

test('MarkdownConverter converts Obsidian links to Hugo format', async () => {
  // Create mock note with Obsidian-specific syntax
  const note = createMockNote(
    'test-note.md',
    '---\ntitle: Test Note\npublish: true\ntags: [test, markdown]\n---\n' +
      '# Test Note\n\n' +
      'This is a test note with [[Internal Link]] and ![[image.png]].\n\n' +
      'Another [[Complex Link|with alias]].',
    {
      frontmatter: {
        title: 'Test Note',
        publish: true,
        tags: ['test', 'markdown'],
      },
    }
  );

  // Create mock app
  const mockApp = createMockApp([
    {
      ...note,
      content:
        '---\ntitle: Test Note\npublish: true\ntags: [test, markdown]\n---\n' +
        '# Test Note\n\n' +
        'This is a test note with [[Internal Link]] and ![[image.png]].\n\n' +
        'Another [[Complex Link|with alias]].',
    },
  ]);

  // Create converter
  const converter = new MarkdownConverter(mockApp.vault, mockApp.metadataCache);

  // Test conversion
  const options: ConversionOptions = {
    frontmatterTemplate: 'title: "{{title}}"\ndate: {{date}}\ndraft: false',
    fileExtension: '.md',
    imageHandling: 'copy',
  };

  const hugoContent = await converter.convertNoteForHugo(note.file, options);

  // Verify conversion results
  expect(hugoContent).toContain('title: "Test Note"');
  expect(hugoContent).toContain('date:');
  expect(hugoContent).toContain('draft: false');

  // Check wiki links conversion
  expect(hugoContent).toContain('[Internal Link]({{< ref "/internal-link" >}})');
  // The image pattern in the test should match the implementation
  expect(hugoContent).toContain('![image.png]({{< ref "/image.png" >}})');
  expect(hugoContent).toContain('[with alias]({{< ref "/complex-link" >}})');

  // Original markdown headings should be preserved
  expect(hugoContent).toContain('# Test Note');
});

test('MarkdownConverter handles frontmatter correctly', async () => {
  // Create mock note with frontmatter
  const note = createMockNote(
    'frontmatter-test.md',
    '---\ntitle: Frontmatter Test\npublish: true\ncustom: value\n---\n' +
      'Content with no special syntax.',
    {
      frontmatter: {
        title: 'Frontmatter Test',
        publish: true,
        custom: 'value',
      },
    }
  );

  // Create mock app
  const mockApp = createMockApp([
    {
      ...note,
      content:
        '---\ntitle: Frontmatter Test\npublish: true\ncustom: value\n---\n' +
        'Content with no special syntax.',
    },
  ]);

  // Create converter
  const converter = new MarkdownConverter(mockApp.vault, mockApp.metadataCache);

  // Test conversion with custom template
  const options: ConversionOptions = {
    frontmatterTemplate:
      'title: "{{title}}"\ndate: {{date}}\ncustomField: {{custom}}\ndraft: false',
    fileExtension: '.md',
    imageHandling: 'copy',
  };

  const hugoContent = await converter.convertNoteForHugo(note.file, options);

  // Verify frontmatter template applied correctly
  expect(hugoContent).toContain('title: "Frontmatter Test"');
  expect(hugoContent).toContain('customField: value');
  expect(hugoContent).toContain('draft: false');
});
