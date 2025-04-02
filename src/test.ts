import { NoteTracker } from './noteTracker';
import { MarkdownConverter } from './markdownConverter';
import { GitHubClient } from './githubClient';
import { createMockApp, createMockNote, verifyMarkdownConversion } from './testUtils';

/**
 * Test suite for the plugin
 */
async function runTests() {
  console.log('Running GitHub Publisher plugin tests...');

  // Test NoteTracker
  await testNoteTracker();

  // Test MarkdownConverter
  await testMarkdownConverter();

  // Test GitHubClient URL parsing
  testGitHubClientUrlParsing();

  console.log('All tests completed!');
}

/**
 * Test the NoteTracker component
 */
async function testNoteTracker() {
  console.log('Testing NoteTracker...');

  // Create mock notes
  const note1 = createMockNote('note1.md', '---\ntitle: Note 1\npublish: true\n---\nContent 1', {
    frontmatter: { title: 'Note 1', publish: true },
  });

  const note2 = createMockNote('note2.md', '---\ntitle: Note 2\npublish: false\n---\nContent 2', {
    frontmatter: { title: 'Note 2', publish: false },
  });

  const note3 = createMockNote('note3.md', '---\ntitle: Note 3\npublish: true\n---\nContent 3', {
    frontmatter: { title: 'Note 3', publish: true },
  });

  // Create mock app
  const mockApp = createMockApp([
    { ...note1, content: '---\ntitle: Note 1\npublish: true\n---\nContent 1' },
    { ...note2, content: '---\ntitle: Note 2\npublish: false\n---\nContent 2' },
    { ...note3, content: '---\ntitle: Note 3\npublish: true\n---\nContent 3' },
  ]);

  // Create tracker
  const noteTracker = new NoteTracker(mockApp.vault, mockApp.metadataCache);

  // Test scanning
  const trackedNotes = await noteTracker.scanVault();
  console.assert(trackedNotes.length === 2, `Expected 2 tracked notes, got ${trackedNotes.length}`);

  // Test getting tracked notes
  const allTracked = noteTracker.getTrackedNotes();
  console.assert(allTracked.length === 2, `Expected 2 tracked notes, got ${allTracked.length}`);

  // Test getting modified notes
  const modified = noteTracker.getModifiedNotes();
  console.assert(modified.length === 2, `Expected 2 modified notes, got ${modified.length}`);

  // Test updating published status
  noteTracker.updatePublishedStatus(note1.file.path);
  const modifiedAfterUpdate = noteTracker.getModifiedNotes();
  console.assert(
    modifiedAfterUpdate.length === 1,
    `Expected 1 modified note after update, got ${modifiedAfterUpdate.length}`
  );

  console.log('NoteTracker tests completed');
}

/**
 * Test the MarkdownConverter component
 */
async function testMarkdownConverter() {
  console.log('Testing MarkdownConverter...');

  // Create mock notes with Obsidian-specific syntax
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
  const hugoContent = await converter.convertNoteForHugo(note.file, {
    frontmatterTemplate: 'title: "{{title}}"\ndate: {{date}}\ndraft: false',
    fileExtension: '.md',
    imageHandling: 'copy',
  });

  // Verify conversion
  const conversionSuccessful = verifyMarkdownConversion(
    '---\ntitle: Test Note\npublish: true\ntags: [test, markdown]\n---\n' +
      '# Test Note\n\n' +
      'This is a test note with [[Internal Link]] and ![[image.png]].\n\n' +
      'Another [[Complex Link|with alias]].',
    hugoContent,
    [
      {
        from: '[[Internal Link]]',
        to: '[Internal Link]({{< ref "/internal-link" >}})',
      },
      { from: '![[image.png]]', to: '![](/assets/image.png)' },
      {
        from: '[[Complex Link|with alias]]',
        to: '[with alias]({{< ref "/complex-link" >}})',
      },
    ]
  );

  console.assert(conversionSuccessful, 'Markdown conversion did not produce expected output');

  console.log('MarkdownConverter tests completed');
}

/**
 * Test the GitHubClient URL parsing
 */
function testGitHubClientUrlParsing() {
  console.log('Testing GitHubClient URL parsing...');

  const client = new GitHubClient({
    owner: '',
    repo: '',
    branch: 'main',
    contentPath: 'content',
    token: 'token',
  });

  // Test valid URL
  const validResult = client.parseRepoUrl('https://github.com/username/repo');
  console.assert(
    validResult && validResult.owner === 'username' && validResult.repo === 'repo',
    'Failed to correctly parse valid GitHub URL'
  );

  // Test invalid URL
  const invalidResult = client.parseRepoUrl('https://example.com/username/repo');
  console.assert(invalidResult === null, 'Should return null for non-GitHub URL');

  console.log('GitHubClient URL parsing tests completed');
}

// Run the tests
if (typeof window !== 'undefined' && window.document) {
  console.log('Tests disabled in browser environment');
} else {
  runTests().catch(console.error);
}
