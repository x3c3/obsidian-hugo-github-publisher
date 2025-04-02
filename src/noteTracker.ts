import { TFile, Vault, MetadataCache } from 'obsidian';

export interface TrackedNote {
  file: TFile;
  lastPublished: number | null;
  lastModified: number;
  frontmatter: Record<string, unknown>;
}

export class NoteTracker {
  private vault: Vault;
  private metadataCache: MetadataCache;
  private trackedNotes: Map<string, TrackedNote> = new Map();

  constructor(vault: Vault, metadataCache: MetadataCache) {
    this.vault = vault;
    this.metadataCache = metadataCache;
  }

  async scanVault(): Promise<TrackedNote[]> {
    const markdownFiles = this.vault.getMarkdownFiles();
    const trackedNotes: TrackedNote[] = [];

    for (const file of markdownFiles) {
      const metadata = this.metadataCache.getFileCache(file);
      const frontmatter = metadata?.frontmatter;

      if (frontmatter && frontmatter.publish === true) {
        const trackedNote: TrackedNote = {
          file,
          lastPublished: this.trackedNotes.get(file.path)?.lastPublished || null,
          lastModified: file.stat.mtime,
          frontmatter,
        };

        this.trackedNotes.set(file.path, trackedNote);
        trackedNotes.push(trackedNote);
      }
    }

    return trackedNotes;
  }

  getTrackedNotes(): TrackedNote[] {
    return Array.from(this.trackedNotes.values());
  }

  getModifiedNotes(): TrackedNote[] {
    return this.getTrackedNotes().filter(
      note => note.lastPublished === null || note.lastModified > note.lastPublished
    );
  }

  updatePublishedStatus(notePath: string): void {
    const note = this.trackedNotes.get(notePath);
    if (note) {
      note.lastPublished = Date.now();
      this.trackedNotes.set(notePath, note);
    }
  }

  clearTracking(): void {
    this.trackedNotes.clear();
  }
}
