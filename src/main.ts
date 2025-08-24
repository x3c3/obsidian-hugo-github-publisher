import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

import {
  HugoGithubPublisherSettings,
  DEFAULT_SETTINGS,
  IHugoGithubPublisherPlugin,
  PublicationEvent,
  PublishableNote,
} from './types';

import { GithubIntegration } from './github';
import 'tslib';

export default class HugoGithubPublisherPlugin
  extends Plugin
  implements IHugoGithubPublisherPlugin
{
  settings: HugoGithubPublisherSettings;
  github: GithubIntegration;
  converter: {
    convertToSafeHugoFilename: (filename: string) => string;
    convertToHugoMarkdown: (content: string, filePath: string, originalFilename: string) => string;
  };
  tracker: {
    initialize: () => Promise<void>;
    getTrackedNotes: (modifiedOnly?: boolean) => PublishableNote[];
    markNoteAsPublished: (path: string, event: PublicationEvent) => void;
    refreshTrackedNotes: () => Promise<void>;
    getAllPublicationHistory: () => { path: string; events: PublicationEvent[] }[];
    unloadListeners?: () => void;
  };

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize components
    this.github = new GithubIntegration(this);

    // Import and initialize other components using bridge files
    const { getConverter } = await import('./converter-bridge');
    const { getTracker } = await import('./tracker-bridge');

    const { MarkdownConverter } = await getConverter();
    const { NoteTracker } = await getTracker();

    this.converter = new MarkdownConverter(this);
    this.tracker = new NoteTracker(this);

    // Add settings tab
    const settingsTab = new HugoGithubPublisherSettingTab(this.app, this);
    this.addSettingTab(settingsTab);

    // Add command to publish current file
    this.addCommand({
      id: 'publish-to-github',
      name: 'Publish current file to GitHub',
      callback: () => this.publishNotes(),
    });

    // Add command to republish notes
    this.addCommand({
      id: 'republish-notes',
      name: 'Republish current file',
      callback: () => this.republishNotes(),
    });

    // Wait for the vault to be ready before initializing tracking
    this.app.workspace.onLayoutReady(async () => {
      console.log('Vault is ready, initializing tracking');
      await this.tracker.initialize();
      // Update the settings display after tracking is initialized
      settingsTab.display();
    });

    console.log('Hugo GitHub Publisher plugin loaded');
  }

  onunload(): void {
    // Unregister event listeners
    if (this.tracker && typeof this.tracker.unloadListeners === 'function') {
      this.tracker.unloadListeners();
    }
    console.log('Hugo GitHub Publisher plugin unloaded');
  }

  async loadSettings(): Promise<void> {
    console.log('Starting to load settings');
    const loadedData = await this.loadData();
    console.log('Raw loaded data:', loadedData);

    // Ensure trackingData exists in loaded settings
    if (loadedData && !loadedData.trackingData) {
      console.log('No tracking data found in loaded settings, initializing');
      loadedData.trackingData = { notes: {} };
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    console.log('Final settings after merge:', this.settings);
    console.log('Tracking data in final settings:', this.settings.trackingData);
  }

  async saveSettings(): Promise<void> {
    console.log('Saving settings:', this.settings);
    console.log('Tracking data being saved:', this.settings.trackingData);
    await this.saveData(this.settings);
  }

  async publishNotes(): Promise<void> {
    let noteToPublish: PublishableNote | null = null;

    try {
      // Get the current active file
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice('No active file to publish.');
        return;
      }

      // Check if the current file is trackable (has publish: true)
      const allTrackedNotes = this.tracker.getTrackedNotes();
      noteToPublish = allTrackedNotes.find(note => note.file.path === activeFile.path) || null;

      if (!noteToPublish) {
        new Notice('Current file is not publishable. Add "publish: true" to frontmatter.');
        return;
      }

      // Convert the current file to Hugo format
      const content = await this.app.vault.read(noteToPublish.file);
      const originalFilename = noteToPublish.file.name;
      const safeFilename = this.converter.convertToSafeHugoFilename(originalFilename);
      const hugoContent = this.converter.convertToHugoMarkdown(
        content,
        noteToPublish.file.path,
        originalFilename
      );

      const filesToPublish = [
        {
          path: safeFilename,
          content: hugoContent,
        },
      ];

      // Publish to GitHub
      const result = await this.github.pushToGithub(filesToPublish);

      if (result) {
        const event: PublicationEvent = {
          timestamp: Date.now(),
          branch: this.github.generateUniqueBranchName(),
          status: 'success',
        };

        // Mark the note as published
        this.tracker.markNoteAsPublished(noteToPublish.file.path, event);
        new Notice(`Successfully published: ${noteToPublish.file.name}`);
      }
    } catch (error) {
      console.error('Error publishing notes:', error);
      new Notice(`Error publishing notes: ${error.message}`);

      const event: PublicationEvent = {
        timestamp: Date.now(),
        branch: 'unknown',
        status: 'failure',
        error: error.message,
      };

      if (noteToPublish) {
        this.tracker.markNoteAsPublished(noteToPublish.file.path, event);
      }
    }
  }

  private async republishNotes(): Promise<void> {
    // Get the current active file
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file to republish.');
      return;
    }

    // Check if the current file is trackable (has publish: true)
    const allTrackedNotes = this.tracker.getTrackedNotes();
    const noteToRepublish = allTrackedNotes.find(note => note.file.path === activeFile.path);

    if (!noteToRepublish) {
      new Notice('Current file is not publishable. Add "publish: true" to frontmatter.');
      return;
    }

    try {
      // Force republish by calling publishNotes (which now handles current file)
      await this.publishNotes();
      new Notice(`Successfully republished: ${noteToRepublish.file.name}`);
    } catch (error) {
      console.error('Error republishing note:', error);
      new Notice('Error republishing note: ' + error.message);
    }
  }
}

class HugoGithubPublisherSettingTab extends PluginSettingTab {
  plugin: HugoGithubPublisherPlugin;

  constructor(app: App, plugin: HugoGithubPublisherPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'GitHub Publisher Settings' });

    new Setting(containerEl)
      .setName('GitHub Repository')
      .setDesc('Repository in format username/repo or organization/repo')
      .addText(text =>
        text
          .setPlaceholder('username/repo')
          .setValue(this.plugin.settings.repoUrl)
          .onChange(async value => {
            this.plugin.settings.repoUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Branch Root')
      .setDesc('Root name for generated branches (e.g., updates-2023-01-01)')
      .addText(text =>
        text
          .setPlaceholder('updates')
          .setValue(this.plugin.settings.branchRoot)
          .onChange(async value => {
            this.plugin.settings.branchRoot = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Content Path')
      .setDesc('Path where content will be published (e.g., content/posts)')
      .addText(text =>
        text
          .setPlaceholder('content/posts')
          .setValue(this.plugin.settings.contentPath)
          .onChange(async value => {
            this.plugin.settings.contentPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('GitHub Token')
      .setDesc('Personal access token with repo scope')
      .addText(text =>
        text
          .setPlaceholder('ghp_...')
          .setValue(this.plugin.settings.githubToken)
          .onChange(async value => {
            this.plugin.settings.githubToken = value;
            await this.plugin.saveSettings();
          })
      );

    // Add publication history section
    containerEl.createEl('h3', { text: 'Publication History' });

    const historyContainer = containerEl.createDiv('publication-history');
    console.log('Displaying publication history');
    console.log('Plugin settings:', this.plugin.settings);
    console.log('Tracking data:', this.plugin.settings.trackingData);
    console.log('Tracked notes:', this.plugin.tracker.getTrackedNotes());
    this.displayPublicationHistory(historyContainer);
  }

  private displayPublicationHistory(container: HTMLElement): void {
    const history = this.plugin.tracker.getAllPublicationHistory();
    console.log('Publication history:', history);

    if (history.length === 0) {
      container.createEl('p', { text: 'No publication history available.' });
      return;
    }

    // Sort by most recent first
    history.sort(
      (a: { events: { timestamp: number }[] }, b: { events: { timestamp: number }[] }) => {
        const aLatest = a.events[a.events.length - 1].timestamp;
        const bLatest = b.events[b.events.length - 1].timestamp;
        return bLatest - aLatest;
      }
    );

    // Create a collapsible section for each note
    for (const { path, events } of history) {
      const noteSection = container.createDiv('note-history');
      const noteName = path.split('/').pop() || path;

      // Create header with note name and last publication status
      const header = noteSection.createDiv('note-history-header');
      const lastEvent = events[events.length - 1];
      const statusIcon = lastEvent.status === 'success' ? '✅' : '❌';

      header.createEl('h4', {
        text: `${statusIcon} ${noteName}`,
        cls: 'note-history-title',
      });

      // Create collapsible content
      const content = noteSection.createDiv('note-history-content');

      // Display events in reverse chronological order
      for (const event of events.reverse()) {
        const eventDiv = content.createDiv('publication-event');

        // Format timestamp
        const date = new Date(event.timestamp);
        const formattedDate = date.toLocaleString();

        // Create event details
        eventDiv.createEl('p', {
          text: `📅 ${formattedDate}`,
          cls: 'event-timestamp',
        });

        eventDiv.createEl('p', {
          text: `🌿 Branch: ${event.branch}`,
          cls: 'event-branch',
        });

        if (event.commitHash) {
          eventDiv.createEl('p', {
            text: `🔗 Commit: ${event.commitHash}`,
            cls: 'event-commit',
          });
        }

        if (event.error) {
          eventDiv.createEl('p', {
            text: `❌ Error: ${event.error}`,
            cls: 'event-error',
          });
        }
      }

      // Add click handler to toggle content
      header.addEventListener('click', () => {
        content.toggleClass('collapsed', !content.hasClass('collapsed'));
      });
    }
  }
}
