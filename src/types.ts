import { TFile } from 'obsidian';

// Plugin settings
export interface HugoGithubPublisherSettings {
  repoUrl: string;
  branchRoot: string;
  contentPath: string;
  githubToken: string;
  trackingData?: NoteTrackingData; // Persistent tracking data
}

export const DEFAULT_SETTINGS: HugoGithubPublisherSettings = {
  repoUrl: '',
  branchRoot: 'updates',
  contentPath: 'content/posts',
  githubToken: '',
  trackingData: { notes: {} }, // Initial empty tracking data
};

// Hugo frontmatter specific structure
export interface HugoFrontmatter {
  title: string;
  date?: string;
  lastmod?: string;
  draft?: boolean;
  tags?: string[];
  categories?: string[];
  publish: boolean;
  [key: string]: any; // Other custom fields
}

// Persistent tracking data structure
export interface NoteTrackingData {
  notes: Record<
    string,
    {
      path: string;
      lastPublished?: number;
      contentHash?: string;
      frontmatterHash?: string;
      publicationHistory?: PublicationEvent[];
    }
  >;
}

// Publication event type
export interface PublicationEvent {
  timestamp: number;
  branch: string;
  commitHash?: string;
  status: 'success' | 'failure';
  error?: string;
}

// Enhanced publishable note with more metadata
export interface PublishableNote {
  file: TFile;
  frontmatter: HugoFrontmatter;
  lastPublished?: number;
  modified: boolean;
  contentHash?: string;
  validationErrors?: string[];
  publicationHistory?: PublicationEvent[];
}

// Plugin instance interface for passing between classes without circular dependencies
export interface IHugoGithubPublisherPlugin {
  settings: HugoGithubPublisherSettings;
  saveSettings(): Promise<void>;
  app: any; // App from obsidian
}
