import { test, expect } from 'bun:test';
import { NoteTracker } from './noteTracker';
import { createMockApp, createMockNote } from './testUtils';

test('NoteTracker identifies notes with publish: true', async () => {
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
  expect(trackedNotes.length).toBe(2);

  // Verify correct notes were tracked
  const paths = trackedNotes.map(note => note.file.path);
  expect(paths).toContain('note1.md');
  expect(paths).toContain('note3.md');
  expect(paths).not.toContain('note2.md');
});

test('NoteTracker tracks modified notes', async () => {
  // Create mock notes
  const note1 = createMockNote('note1.md', '---\ntitle: Note 1\npublish: true\n---\nContent 1', {
    frontmatter: { title: 'Note 1', publish: true },
  });

  // Create mock app
  const mockApp = createMockApp([
    { ...note1, content: '---\ntitle: Note 1\npublish: true\n---\nContent 1' },
  ]);

  // Create tracker
  const noteTracker = new NoteTracker(mockApp.vault, mockApp.metadataCache);

  // Test initial state
  await noteTracker.scanVault();
  const initialModified = noteTracker.getModifiedNotes();
  expect(initialModified.length).toBe(1); // All notes start as modified

  // Test updating published status
  noteTracker.updatePublishedStatus(note1.file.path);
  const afterUpdate = noteTracker.getModifiedNotes();
  expect(afterUpdate.length).toBe(0); // No modified notes after update
});
