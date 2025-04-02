import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, TFile } from 'obsidian';
import { NoteTracker, TrackedNote } from './noteTracker';
import { MarkdownConverter, ConversionOptions } from './markdownConverter';
import { GitHubClient, CommitFile } from './githubClient';

interface HugoGitHubPublisherSettings {
  repoUrl: string;
  branch: string;
  contentPath: string;
  token: string;
  defaultFrontmatter: string;
  fileExtension: string;
  imageHandling: string;
}

const DEFAULT_SETTINGS: HugoGitHubPublisherSettings = {
  repoUrl: '',
  branch: 'main',
  contentPath: 'content',
  token: '',
  defaultFrontmatter: 'title: "{{title}}"\ndate: {{date}}\ndraft: false',
  fileExtension: '.md',
  imageHandling: 'copy',
};

export default class HugoGitHubPublisherPlugin extends Plugin {
  settings!: HugoGitHubPublisherSettings;
  noteTracker!: NoteTracker;
  markdownConverter!: MarkdownConverter;
  publishHistory: { note: string; timestamp: number; success: boolean }[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize components
    this.noteTracker = new NoteTracker(this.app.vault, this.app.metadataCache);
    this.markdownConverter = new MarkdownConverter(this.app.vault, this.app.metadataCache);

    // Register event to track file changes
    this.registerEvent(
      this.app.metadataCache.on('changed', file => {
        if (file instanceof TFile && file.extension === 'md') {
          // Refresh tracking when files change
          this.noteTracker.scanVault();
        }
      })
    );

    // Initial scan of vault
    await this.noteTracker.scanVault();

    // Add the command to publish to GitHub
    this.addCommand({
      id: 'publish-to-github',
      name: 'Publish to GitHub',
      callback: () => {
        this.publishToGitHub();
      },
    });

    // Add command to preview publishable notes
    this.addCommand({
      id: 'preview-publishable-notes',
      name: 'Preview Publishable Notes',
      callback: () => {
        this.previewPublishableNotes();
      },
    });

    // Add a settings tab
    this.addSettingTab(new HugoGitHubPublisherSettingTab(this.app, this));

    // Load CSS
    this.loadStyles();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  loadStyles(): void {
    // Add a css class to body so our styles apply only to our elements
    document.body.classList.add('hugo-github-publisher-enabled');
  }

  async publishToGitHub(): Promise<void> {
    // Check if settings are configured
    if (!this.settings.repoUrl || !this.settings.token) {
      new Notice('Please configure GitHub repository settings first.');
      return;
    }

    // Scan for publishable notes
    await this.noteTracker.scanVault();
    const modifiedNotes = this.noteTracker.getModifiedNotes();

    if (modifiedNotes.length === 0) {
      new Notice('No publishable notes have been modified since last publication.');
      return;
    }

    // Show preview and confirmation dialog
    const modal = new PublishConfirmationModal(this.app, modifiedNotes, async confirmed => {
      if (confirmed) {
        await this.doPublish(modifiedNotes);
      }
    });

    modal.open();
  }

  async doPublish(notes: TrackedNote[]): Promise<void> {
    try {
      // Parse repo URL to get owner and repo
      const githubClient = this.createGitHubClient();
      if (!githubClient) {
        new Notice('Invalid GitHub repository URL.');
        return;
      }

      // Convert notes to Hugo format
      const conversionOptions: ConversionOptions = {
        frontmatterTemplate: this.settings.defaultFrontmatter,
        fileExtension: this.settings.fileExtension,
        imageHandling: this.settings.imageHandling,
      };

      // Check for duplicate filenames since we're flattening the structure
      const fileNames = new Map<string, string>();
      const duplicates: string[] = [];

      for (const note of notes) {
        const fileName = note.file.basename;
        if (fileNames.has(fileName)) {
          duplicates.push(`${fileName} (${fileNames.get(fileName)} and ${note.file.path})`);
        } else {
          fileNames.set(fileName, note.file.path);
        }
      }

      if (duplicates.length > 0) {
        new Notice(
          `Warning: Duplicate filenames detected: ${duplicates.join(', ')}. Files will overwrite each other.`
        );
      }

      const commitFiles: CommitFile[] = [];

      for (const note of notes) {
        const hugoContent = await this.markdownConverter.convertNoteForHugo(
          note.file,
          conversionOptions
        );

        // Generate path for GitHub - extract only the filename, ignore subfolder structure
        const fileName = note.file.basename + this.settings.fileExtension;
        const notePath = `${this.settings.contentPath}/${fileName}`;

        commitFiles.push({
          path: notePath,
          content: hugoContent,
        });
      }

      // Upload files to GitHub
      const success = await githubClient.uploadFiles(commitFiles);

      if (success) {
        // Update published status
        for (const note of notes) {
          this.noteTracker.updatePublishedStatus(note.file.path);

          // Add to history
          this.publishHistory.push({
            note: note.file.basename,
            timestamp: Date.now(),
            success: true,
          });
        }

        // Keep history to reasonable size
        if (this.publishHistory.length > 50) {
          this.publishHistory = this.publishHistory.slice(-50);
        }

        // Save data with updated publishing timestamps
        await this.saveData({
          ...this.settings,
          publishHistory: this.publishHistory,
        });
      }
    } catch (error) {
      console.error('Error publishing to GitHub:', error);
      new Notice('Failed to publish to GitHub. Check console for details.');
    }
  }

  previewPublishableNotes(): void {
    const trackedNotes = this.noteTracker.getTrackedNotes();
    const modifiedNotes = this.noteTracker.getModifiedNotes();

    const modal = new PublishableNotesModal(this.app, trackedNotes, modifiedNotes);
    modal.open();
  }

  createGitHubClient(): GitHubClient | null {
    const repoUrl = this.settings.repoUrl;
    const client = new GitHubClient({
      owner: '',
      repo: '',
      branch: this.settings.branch,
      contentPath: this.settings.contentPath,
      token: this.settings.token,
    });

    const repoInfo = client.parseRepoUrl(repoUrl);
    if (!repoInfo) {
      return null;
    }

    return new GitHubClient({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      branch: this.settings.branch,
      contentPath: this.settings.contentPath,
      token: this.settings.token,
    });
  }

  onunload(): void {
    document.body.classList.remove('hugo-github-publisher-enabled');
  }
}

class PublishConfirmationModal extends Modal {
  notes: TrackedNote[];
  onConfirm: (confirmed: boolean) => void;
  plugin: HugoGitHubPublisherPlugin;

  constructor(app: App, notes: TrackedNote[], onConfirm: (confirmed: boolean) => void) {
    super(app);
    this.notes = notes;
    this.onConfirm = onConfirm;
    // Get access to the plugin instance
    // Use a type assertion for the Obsidian API
    interface ObsidianApp extends App {
      plugins: {
        plugins: Record<string, HugoGitHubPublisherPlugin>;
      };
    }
    this.plugin = (app as ObsidianApp).plugins.plugins['hugo-github-publisher'];
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Publish to GitHub' });

    contentEl.createEl('p', {
      text: `You are about to publish ${this.notes.length} notes to GitHub. Continue?`,
    });

    const previewDiv = contentEl.createDiv({ cls: 'hugo-github-publisher-preview' });

    this.notes.forEach(note => {
      const destinationPath = `${this.plugin.settings.contentPath}/${note.file.basename}${this.plugin.settings.fileExtension}`;
      previewDiv.createEl('div', {
        text: `${note.file.basename} → ${destinationPath}`,
        cls: 'hugo-github-publisher-preview-note',
      });
    });

    const buttonDiv = contentEl.createDiv({ cls: 'hugo-github-publisher-buttons' });

    buttonDiv.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
      this.close();
      this.onConfirm(false);
    });

    buttonDiv
      .createEl('button', {
        text: 'Publish',
        cls: 'mod-cta',
      })
      .addEventListener('click', () => {
        this.close();
        this.onConfirm(true);
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class PublishableNotesModal extends Modal {
  trackedNotes: TrackedNote[];
  modifiedNotes: TrackedNote[];

  constructor(app: App, trackedNotes: TrackedNote[], modifiedNotes: TrackedNote[]) {
    super(app);
    this.trackedNotes = trackedNotes;
    this.modifiedNotes = modifiedNotes;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Publishable Notes' });

    contentEl.createEl('p', {
      text:
        `Found ${this.trackedNotes.length} publishable notes, ` +
        `${this.modifiedNotes.length} modified since last publish.`,
    });

    const previewDiv = contentEl.createDiv({ cls: 'hugo-github-publisher-preview' });

    // Add a table header
    const headerRow = previewDiv.createEl('div', {
      cls: 'hugo-github-publisher-note-row hugo-github-publisher-header',
    });
    headerRow.createEl('span', {
      text: 'Note',
      cls: 'hugo-github-publisher-note-name',
    });
    headerRow.createEl('span', {
      text: 'Status',
      cls: 'hugo-github-publisher-note-status',
    });
    headerRow.createEl('span', {
      text: 'Last Modified',
      cls: 'hugo-github-publisher-note-modified',
    });

    // Add each note
    this.trackedNotes.forEach(note => {
      const noteRow = previewDiv.createEl('div', {
        cls: 'github-publisher-note-row',
      });

      noteRow.createEl('span', {
        text: note.file.basename,
        cls: 'github-publisher-note-name',
      });

      const isModified = this.modifiedNotes.some(n => n.file.path === note.file.path);

      noteRow.createEl('span', {
        text: isModified ? 'Modified' : 'Up to date',
        cls: `github-publisher-note-status ${isModified ? 'modified' : 'current'}`,
      });

      noteRow.createEl('span', {
        text: new Date(note.lastModified).toLocaleString(),
        cls: 'github-publisher-note-modified',
      });
    });

    const buttonDiv = contentEl.createDiv({ cls: 'hugo-github-publisher-buttons' });

    buttonDiv.createEl('button', { text: 'Close' }).addEventListener('click', () => {
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class HugoGitHubPublisherSettingTab extends PluginSettingTab {
  plugin: HugoGitHubPublisherPlugin;

  constructor(app: App, plugin: HugoGitHubPublisherPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Hugo GitHub Publisher Settings' });

    new Setting(containerEl)
      .setName('GitHub Repository URL')
      .setDesc('URL of the GitHub repository to publish to')
      .addText(text =>
        text
          .setPlaceholder('https://github.com/username/repo')
          .setValue(this.plugin.settings.repoUrl)
          .onChange(async value => {
            this.plugin.settings.repoUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Branch')
      .setDesc('Branch to publish to')
      .addText(text =>
        text
          .setPlaceholder('main')
          .setValue(this.plugin.settings.branch)
          .onChange(async value => {
            this.plugin.settings.branch = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Content Path')
      .setDesc('Path to the content directory in the repository')
      .addText(text =>
        text
          .setPlaceholder('content')
          .setValue(this.plugin.settings.contentPath)
          .onChange(async value => {
            this.plugin.settings.contentPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('GitHub Token')
      .setDesc('Personal access token for GitHub API')
      .addText(text =>
        text
          .setPlaceholder('ghp_xxxxxxxxxxxx')
          .setValue(this.plugin.settings.token)
          .onChange(async value => {
            this.plugin.settings.token = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default Frontmatter')
      .setDesc('Template for default frontmatter (use {{title}} and {{date}} as placeholders)')
      .addTextArea(text =>
        text
          .setPlaceholder('title: "{{title}}"\ndate: {{date}}\ndraft: false')
          .setValue(this.plugin.settings.defaultFrontmatter)
          .onChange(async value => {
            this.plugin.settings.defaultFrontmatter = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('File Extension')
      .setDesc('File extension for published files')
      .addDropdown(dropdown =>
        dropdown
          .addOption('.md', 'Markdown (.md)')
          .addOption('.markdown', 'Markdown (.markdown)')
          .setValue(this.plugin.settings.fileExtension)
          .onChange(async value => {
            this.plugin.settings.fileExtension = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Image Handling')
      .setDesc('How to handle images in notes')
      .addDropdown(dropdown =>
        dropdown
          .addOption('copy', 'Copy to assets folder')
          .addOption('reference', 'Keep references as-is')
          .setValue(this.plugin.settings.imageHandling)
          .onChange(async value => {
            this.plugin.settings.imageHandling = value;
            await this.plugin.saveSettings();
          })
      );

    // Publication history section
    containerEl.createEl('h3', { text: 'Publication History' });

    if (this.plugin.publishHistory && this.plugin.publishHistory.length > 0) {
      const historyContainer = containerEl.createDiv({
        cls: 'github-publisher-history',
      });

      this.plugin.publishHistory
        .slice()
        .reverse()
        .forEach(entry => {
          const historyItem = historyContainer.createDiv({
            cls: 'github-publisher-history-item',
          });

          historyItem.createSpan({
            text: entry.note,
            cls: 'github-publisher-history-note',
          });

          historyItem.createSpan({
            text: new Date(entry.timestamp).toLocaleString(),
            cls: 'github-publisher-history-time',
          });

          historyItem.createSpan({
            text: entry.success ? '✓' : '✗',
            cls: `github-publisher-history-status ${entry.success ? 'success' : 'failure'}`,
          });
        });
    } else {
      containerEl.createEl('p', {
        text: 'No publication history yet.',
        cls: 'github-publisher-no-history',
      });
    }
  }
}
