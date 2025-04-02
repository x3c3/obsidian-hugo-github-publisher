// This file provides utilities for testing the plugin

import { App, TFile, Vault, MetadataCache } from 'obsidian';

/**
 * Creates a mock note for testing
 */
export function createMockNote(
  path: string,
  content: string,
  metadata: Record<string, unknown> = { frontmatter: { publish: true } }
): { file: TFile; metadata: Record<string, unknown> } {
  const file = {
    path,
    name: path.split('/').pop() || '',
    basename: (path.split('/').pop() || '').replace('.md', ''),
    extension: 'md',
    stat: {
      mtime: Date.now(),
      ctime: Date.now(),
      size: content.length,
    },
  } as unknown as TFile;

  return { file, metadata };
}

/**
 * Creates a mock vault for testing
 */
export function createMockVault(notes: { file: TFile; content: string }[]): Vault {
  return {
    getMarkdownFiles: () => notes.map(n => n.file),
    cachedRead: async (file: TFile) => {
      const note = notes.find(n => n.file.path === file.path);
      return note ? note.content : '';
    },
  } as unknown as Vault;
}

/**
 * Creates a mock metadata cache for testing
 */
export function createMockMetadataCache(
  notes: { file: TFile; metadata: Record<string, unknown> }[]
): MetadataCache {
  return {
    getFileCache: (file: TFile) => {
      const note = notes.find(n => n.file.path === file.path);
      return note ? note.metadata : null;
    },
  } as unknown as MetadataCache;
}

/**
 * Creates a mock app for testing
 */
export function createMockApp(
  notes: { file: TFile; content: string; metadata: Record<string, unknown> }[]
): App {
  return {
    vault: createMockVault(notes.map(n => ({ file: n.file, content: n.content }))),
    metadataCache: createMockMetadataCache(
      notes.map(n => ({ file: n.file, metadata: n.metadata }))
    ),
  } as unknown as App;
}

/**
 * Verifies that a converted markdown matches expected output
 */
export function verifyMarkdownConversion(
  original: string,
  converted: string,
  expectedChanges: { from: string; to: string }[]
): boolean {
  let isValid = true;

  for (const change of expectedChanges) {
    // Check if original has the 'from' text
    if (!original.includes(change.from)) {
      console.error(`Original does not contain: ${change.from}`);
      isValid = false;
    }

    // Check if converted has the 'to' text
    if (!converted.includes(change.to)) {
      console.error(`Converted does not contain: ${change.to}`);
      isValid = false;
    }
  }

  return isValid;
}
