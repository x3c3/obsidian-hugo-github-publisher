import { TFile, TAbstractFile, EventRef } from 'obsidian';
import {
  IHugoGithubPublisherPlugin,
  PublishableNote,
  HugoFrontmatter,
  NoteTrackingData,
  PublicationEvent,
} from './types';
import 'tslib';

export class NoteTracker {
  private plugin: IHugoGithubPublisherPlugin;
  private trackedNotes: Map<string, PublishableNote> = new Map();
  private eventRefs: EventRef[] = [];
  private isRefreshing = false;

  constructor(plugin: IHugoGithubPublisherPlugin) {
    this.plugin = plugin;
    this.eventRefs = [];
    this.isRefreshing = false;
  }

  /**
   * Initialize the tracker, loading persisted data and setting up listeners
   */
  async initialize(): Promise<void> {
    // Initialize tracking from persisted data if available
    await this.initializeFromPersistedData();

    // Set up file event listeners
    this.registerEventListeners();

    // After initialization, refresh to ensure all files are properly tracked
    await this.refreshTrackedNotes();
  }

  /**
   * Initialize tracked notes from persisted data
   */
  private async initializeFromPersistedData(): Promise<void> {
    // If there's no tracking data in settings, create an empty structure
    if (!this.plugin.settings.trackingData) {
      console.log('No tracking data found in settings, creating empty structure');
      this.plugin.settings.trackingData = { notes: {} };
      await this.plugin.saveSettings();
      return;
    }

    const trackingData = this.plugin.settings.trackingData;
    console.log('Initializing from persisted data:', trackingData);
    console.log('Number of notes in tracking data:', Object.keys(trackingData.notes).length);
    console.log('Note paths in tracking data:', Object.keys(trackingData.notes));

    // Get all markdown files in the vault
    const files = this.plugin.app.vault.getMarkdownFiles();

    for (const file of files) {
      const persistedData = trackingData.notes[file.path];
      console.log(`Checking file ${file.path} against persisted data:`, persistedData);

      if (persistedData) {
        try {
          const frontmatter = await this.extractFrontmatter(file);
          const contentHash = await this.generateContentHash(file);

          if (frontmatter && frontmatter.publish === true) {
            console.log(
              `Restoring tracking for ${file.path} with history:`,
              persistedData.publicationHistory
            );
            this.trackedNotes.set(file.path, {
              file,
              frontmatter,
              lastPublished: persistedData.lastPublished,
              modified: persistedData.contentHash !== contentHash,
              contentHash,
              publicationHistory: persistedData.publicationHistory || [],
            });
          } else {
            console.log(`File ${file.path} no longer has publish: true, removing from tracking`);
            delete trackingData.notes[file.path];
          }
        } catch (error) {
          console.error(`Error initializing ${file.path}:`, error);
        }
      }
    }

    // Save any changes to tracking data
    await this.plugin.saveSettings();
  }

  /**
   * Register event listeners for file changes
   */
  private registerEventListeners(): void {
    // Monitor file modifications
    const modifyRef = this.plugin.app.vault.on('modify', (file: TAbstractFile) => {
      if (file instanceof TFile && file.extension === 'md') {
        this.checkFileModification(file);
      }
    });
    this.eventRefs.push(modifyRef);

    // Monitor file deletions
    const deleteRef = this.plugin.app.vault.on('delete', (file: TAbstractFile) => {
      if (file instanceof TFile && file.extension === 'md') {
        this.removeTrackedNote(file.path);
      }
    });
    this.eventRefs.push(deleteRef);

    // Monitor file renames
    const renameRef = this.plugin.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
      if (file instanceof TFile && file.extension === 'md') {
        this.handleFileRename(oldPath, file);
      }
    });
    this.eventRefs.push(renameRef);
  }

  /**
   * Unregister all event listeners
   */
  public unloadListeners(): void {
    // Unregister all event listeners
    for (const ref of this.eventRefs) {
      this.plugin.app.vault.offref(ref);
    }
    this.eventRefs = [];
  }

  /**
   * Check if a file was modified and update tracking if needed
   */
  private async checkFileModification(file: TFile): Promise<void> {
    try {
      const frontmatter = await this.extractFrontmatter(file);
      const contentHash = await this.generateContentHash(file);

      if (frontmatter && frontmatter.publish === true) {
        const existingNote = this.trackedNotes.get(file.path);

        if (existingNote) {
          // Always update the content hash and check for modifications
          const isModified = existingNote.contentHash !== contentHash;
          existingNote.modified = isModified;
          existingNote.contentHash = contentHash;
          this.trackedNotes.set(file.path, existingNote);
        } else {
          // New publishable note
          await this.addFileToTracking(file);
        }
      } else if (this.trackedNotes.has(file.path)) {
        this.removeTrackedNote(file.path);
      }
    } catch (error) {
      console.error(`Error checking file modification for ${file.path}:`, error);
    }
  }

  /**
   * Handle file rename events
   */
  private async handleFileRename(oldPath: string, newFile: TFile): Promise<void> {
    // Check if the old path was tracked
    if (this.trackedNotes.has(oldPath)) {
      const oldData = this.trackedNotes.get(oldPath);

      if (oldData) {
        // Remove the old entry
        this.trackedNotes.delete(oldPath);

        // Check if the file should still be tracked
        const frontmatter = await this.extractFrontmatter(newFile);

        if (frontmatter && frontmatter.publish === true) {
          // Update the tracked note with the new file
          const contentHash = await this.generateContentHash(newFile);

          this.trackedNotes.set(newFile.path, {
            file: newFile,
            frontmatter,
            lastPublished: oldData.lastPublished,
            modified: true, // Mark as modified since the path changed
            contentHash,
          });

          // Update persisted data
          this.updatePersistedTrackingData();
        } else {
          // Also remove from persisted data if publish is no longer true
          this.removeFromPersistedData(oldPath);
        }
      }
    } else {
      // Check if the new file should be tracked
      await this.checkFileModification(newFile);
    }
  }

  /**
   * Refresh all tracked notes, ensuring consistent state
   */
  async refreshTrackedNotes(): Promise<void> {
    if (this.isRefreshing) {
      console.log('Refresh already in progress, skipping');
      return;
    }

    this.isRefreshing = true;
    try {
      console.log('Starting refresh of tracked notes');
      console.log(
        'Current vault path:',
        (this.plugin.app.vault.adapter as { basePath?: string })?.basePath || 'unknown'
      );

      // Get all markdown files in the vault
      const files = this.plugin.app.vault.getMarkdownFiles();
      console.log(`Found ${files.length} markdown files`);
      console.log(
        'File paths:',
        files.map(f => f.path)
      );

      // Create a new map for tracked notes
      const newTrackedNotes = new Map<string, PublishableNote>();

      for (const file of files) {
        try {
          console.log(`Processing file: ${file.path}`);
          const frontmatter = await this.extractFrontmatter(file);
          console.log(`Frontmatter for ${file.path}:`, frontmatter);

          if (frontmatter && frontmatter.publish === true) {
            const contentHash = await this.generateContentHash(file);
            const existingNote = this.trackedNotes.get(file.path);
            console.log(`Existing note data for ${file.path}:`, existingNote);

            // Create new tracked note, preserving publication history
            const note: PublishableNote = {
              file,
              frontmatter,
              contentHash,
              modified: !existingNote || existingNote.contentHash !== contentHash,
              lastPublished: existingNote?.lastPublished,
              publicationHistory: existingNote?.publicationHistory || [],
            };

            newTrackedNotes.set(file.path, note);
            console.log(
              `Added ${file.path} to tracked notes with history:`,
              note.publicationHistory
            );
          }
        } catch (error) {
          console.error(`Error processing file ${file.path}:`, error);
        }
      }

      // Update tracked notes
      this.trackedNotes = newTrackedNotes;

      // Update persisted data
      await this.updatePersistedTrackingData();
      console.log('Refresh complete. Total tracked notes:', this.trackedNotes.size);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Add a file to tracking if it should be tracked
   */
  private async addFileToTracking(file: TFile): Promise<boolean> {
    const frontmatter = await this.extractFrontmatter(file);

    // Check if the note is publishable
    if (frontmatter && frontmatter.publish === true) {
      // Generate content hash for change detection
      const contentHash = await this.generateContentHash(file);

      // Get previous tracking data if available
      const trackingData = this.plugin.settings.trackingData?.notes[file.path];
      const wasModified = !trackingData || trackingData.contentHash !== contentHash;

      // Create or update tracked note
      this.trackedNotes.set(file.path, {
        file,
        frontmatter,
        lastPublished: trackingData?.lastPublished,
        modified: wasModified,
        contentHash,
      });

      return true;
    }

    return false;
  }

  /**
   * Generate a hash of file content for tracking changes
   */
  private async generateContentHash(file: TFile): Promise<string> {
    try {
      const content = await this.plugin.app.vault.read(file);

      // Simple hash function for content
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
      }

      return hash.toString(16);
    } catch (error) {
      console.error(`Error generating content hash for ${file.path}:`, error);
      return Date.now().toString(); // Fallback to timestamp
    }
  }

  /**
   * Remove a note from tracking
   */
  private removeTrackedNote(path: string): void {
    if (this.trackedNotes.has(path)) {
      this.trackedNotes.delete(path);
      this.removeFromPersistedData(path);
    }
  }

  /**
   * Remove a note from persisted tracking data
   */
  private removeFromPersistedData(path: string): void {
    if (this.plugin.settings.trackingData?.notes[path]) {
      delete this.plugin.settings.trackingData.notes[path];
      this.plugin.saveSettings();
    }
  }

  /**
   * Update the persisted tracking data
   */
  private async updatePersistedTrackingData(): Promise<void> {
    console.log('Updating persisted tracking data');
    console.log('Current tracked notes:', Array.from(this.trackedNotes.keys()));

    const trackingData: NoteTrackingData = { notes: {} };

    for (const [path, note] of this.trackedNotes.entries()) {
      console.log(`Saving tracking data for ${path}:`, {
        lastPublished: note.lastPublished,
        contentHash: note.contentHash,
        publicationHistory: note.publicationHistory,
      });

      trackingData.notes[path] = {
        path,
        lastPublished: note.lastPublished,
        contentHash: note.contentHash,
        frontmatterHash: this.generateFrontmatterHash(note.frontmatter),
        publicationHistory: note.publicationHistory || [],
      };
    }

    this.plugin.settings.trackingData = trackingData;
    await this.plugin.saveSettings();
    console.log('Persisted tracking data updated:', trackingData);
  }

  /**
   * Generate a simple hash for frontmatter
   */
  private generateFrontmatterHash(frontmatter: HugoFrontmatter): string {
    try {
      const str = JSON.stringify(frontmatter);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return hash.toString(16);
    } catch {
      return Date.now().toString(); // Fallback
    }
  }

  /**
   * Get all tracked notes with consistent state
   */
  getTrackedNotes(modifiedOnly = false): PublishableNote[] {
    const notes = Array.from(this.trackedNotes.values());
    const filteredNotes = notes.filter(note => !modifiedOnly || note.modified);
    console.log(
      `Returning ${filteredNotes.length} tracked notes (${modifiedOnly ? 'modified only' : 'all'})`
    );
    return filteredNotes;
  }

  /**
   * Extract frontmatter from a file
   */
  private async extractFrontmatter(file: TFile): Promise<HugoFrontmatter | null> {
    try {
      console.log(`Reading file: ${file.path}`);
      const content = await this.plugin.app.vault.read(file);

      // Check if the file has frontmatter
      const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
      const match = content.match(frontmatterRegex);

      if (!match) {
        console.log(`No frontmatter found in ${file.path}`);
        return null;
      }

      // Parse the frontmatter
      const frontmatterText = match[1];
      console.log(`Frontmatter text for ${file.path}:`, frontmatterText);

      const frontmatter: Record<string, unknown> = {};

      frontmatterText.split('\n').forEach(line => {
        const [key, value] = line.split(':').map(s => s.trim());
        if (key && value !== undefined) {
          // Handle boolean values
          if (value.toLowerCase() === 'true') {
            frontmatter[key] = true;
          } else if (value.toLowerCase() === 'false') {
            frontmatter[key] = false;
          } else {
            frontmatter[key] = value;
          }
          console.log(`Parsed frontmatter key: ${key} = ${frontmatter[key]}`);
        }
      });

      return frontmatter as HugoFrontmatter;
    } catch (error) {
      console.error(`Error extracting frontmatter from ${file.path}:`, error);
      return null;
    }
  }

  /**
   * Mark a note as published
   * @param path The path of the published note
   * @param event The publication event details
   */
  markNoteAsPublished(path: string, event: PublicationEvent): void {
    console.log('Marking note as published:', { path, event });

    const note = this.trackedNotes.get(path);
    console.log('Current note state:', note);

    if (note) {
      note.modified = false;
      note.lastPublished = event.timestamp;

      // Initialize or update publication history
      if (!note.publicationHistory) {
        note.publicationHistory = [];
      }
      note.publicationHistory.push(event);

      // Keep only the last 10 publication events
      if (note.publicationHistory.length > 10) {
        note.publicationHistory = note.publicationHistory.slice(-10);
      }

      this.trackedNotes.set(path, note);
      console.log('Updated note state:', note);

      // Update persisted data
      this.updatePersistedTrackingData();
    } else {
      console.warn('Note not found in tracked notes:', path);
    }
  }

  /**
   * Get publication history for a note
   * @param path The path of the note
   * @returns Array of publication events
   */
  getPublicationHistory(path: string): PublicationEvent[] {
    const note = this.trackedNotes.get(path);
    return note?.publicationHistory || [];
  }

  /**
   * Get all publication events across all notes
   * @returns Array of publication events with note paths
   */
  getAllPublicationHistory(): Array<{
    path: string;
    events: PublicationEvent[];
  }> {
    const history: Array<{ path: string; events: PublicationEvent[] }> = [];

    for (const [path, note] of this.trackedNotes.entries()) {
      if (note.publicationHistory && note.publicationHistory.length > 0) {
        history.push({
          path,
          events: note.publicationHistory,
        });
      }
    }

    return history;
  }
}
