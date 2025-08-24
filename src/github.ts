import { Notice, requestUrl, RequestUrlResponse } from 'obsidian';
import { IHugoGithubPublisherPlugin } from './types';
import 'tslib';

export class GithubIntegration {
  private plugin: IHugoGithubPublisherPlugin;

  constructor(plugin: IHugoGithubPublisherPlugin) {
    this.plugin = plugin;
  }

  /**
   * Generates a unique branch name using the branch root and current timestamp
   * @returns string with unique branch name
   */
  generateUniqueBranchName(): string {
    const { branchRoot } = this.plugin.settings;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${branchRoot}-${timestamp}`;
  }

  /**
   * Validates the GitHub configuration settings
   * @returns boolean indicating if settings are valid
   */
  validateSettings(): boolean {
    const { repoUrl, branchRoot, githubToken } = this.plugin.settings;

    if (!repoUrl || !branchRoot || !githubToken) {
      new Notice('GitHub configuration incomplete. Please check settings.');
      return false;
    }

    // Ensure the repo format is valid
    if (!this.getRepoInfo()) {
      new Notice('Invalid repository format. Use "username/repo" format.');
      return false;
    }

    return true;
  }

  /**
   * Extracts owner and repo name from the GitHub repository string
   * @returns object containing owner and repo or null if invalid
   */
  getRepoInfo(): { owner: string; repo: string } | null {
    try {
      const { repoUrl } = this.plugin.settings;

      // Check if it's already in the simple format (user/repo)
      if (repoUrl.includes('/') && !repoUrl.includes('://')) {
        const parts = repoUrl.split('/');
        const owner = parts[0];
        const repo = parts[1]?.replace('.git', '');

        if (owner && repo) {
          return { owner, repo };
        }
        return null;
      }

      // Try to parse as URL for backward compatibility
      try {
        const url = new URL(repoUrl);

        if (url.hostname !== 'github.com') {
          return null;
        }

        const parts = url.pathname.split('/');
        // Remove empty first element
        parts.shift();

        const owner = parts[0];
        const repo = parts[1]?.replace('.git', '');

        if (!owner || !repo) {
          return null;
        }

        return { owner, repo };
      } catch {
        // If URL parsing fails, return null
        return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Base URL for GitHub API
   */
  private get apiBaseUrl(): string {
    return 'https://api.github.com';
  }

  /**
   * Gets the default branch for the repository
   * @returns Promise with the default branch reference
   */
  private async getDefaultBranch(): Promise<{ name: string; sha: string }> {
    const repoInfo = this.getRepoInfo();
    if (!repoInfo) {
      throw new Error('Invalid repository format');
    }

    const { owner, repo } = repoInfo;

    try {
      const response = await this.makeApiRequest(`repos/${owner}/${repo}`);

      const data = response.json;
      const defaultBranch = data.default_branch;

      // Get the SHA of the default branch
      const refResponse = await this.makeApiRequest(
        `repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`
      );

      return {
        name: defaultBranch,
        sha: refResponse.json.object.sha,
      };
    } catch (error) {
      console.error('Error getting default branch:', error);
      throw new Error(`Failed to get default branch: ${error.message}`);
    }
  }

  /**
   * Creates a new branch in the repository
   * @param baseSha SHA of the commit to branch from
   * @param branchName Name of the new branch
   * @returns Promise with the new branch reference
   */
  private async createBranch(baseSha: string, branchName: string): Promise<string> {
    const repoInfo = this.getRepoInfo();
    if (!repoInfo) {
      throw new Error('Invalid repository format');
    }

    const { owner, repo } = repoInfo;

    try {
      const response = await this.makeApiRequest(`repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        }),
      });

      return response.json.ref;
    } catch (error) {
      console.error('Error creating branch:', error);
      throw new Error(`Failed to create branch: ${error.message}`);
    }
  }

  /**
   * Creates or updates a file in the repository
   * @param branchName Name of the branch
   * @param filePath Path to the file
   * @param content Content of the file
   * @param message Commit message
   * @returns Promise with the result
   */
  private async createOrUpdateFile(
    branchName: string,
    filePath: string,
    content: string,
    message: string
  ): Promise<{ sha: string }> {
    const repoInfo = this.getRepoInfo();
    if (!repoInfo) {
      throw new Error('Invalid repository format');
    }

    const { owner, repo } = repoInfo;
    const { contentPath } = this.plugin.settings;
    const fullPath = `${contentPath}/${filePath}`.replace(/\/\//g, '/');

    try {
      // Check if file exists first
      let existingSha: string | null = null;
      try {
        const fileResponse = await this.makeApiRequest(
          `repos/${owner}/${repo}/contents/${fullPath}?ref=${branchName}`
        );
        existingSha = fileResponse.json.sha;
      } catch {
        // File doesn't exist, which is fine
      }

      const encodedContent = btoa(unescape(encodeURIComponent(content)));

      const body: any = {
        message,
        content: encodedContent,
        branch: branchName,
      };

      if (existingSha) {
        body.sha = existingSha;
      }

      const response = await this.makeApiRequest(`repos/${owner}/${repo}/contents/${fullPath}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      return { sha: response.json.content.sha };
    } catch (error) {
      console.error(`Error creating/updating file ${filePath}:`, error);
      throw new Error(`Failed to create/update file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Makes an authenticated request to the GitHub API
   * @param endpoint API endpoint to call
   * @param options Request options
   * @returns Promise with the response
   */
  private async makeApiRequest(endpoint: string, options: any = {}): Promise<RequestUrlResponse> {
    const { githubToken } = this.plugin.settings;
    const headers = {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Obsidian-Hugo-Publisher-Plugin',
    };

    const url = `${this.apiBaseUrl}/${endpoint}`;
    const requestOptions = {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    };

    try {
      return await requestUrl({
        url,
        ...requestOptions,
      });
    } catch (error) {
      console.error(`API Error (${url}):`, error);
      throw error;
    }
  }

  /**
   * Pushes content to GitHub
   * @param files Array of file objects to push
   * @returns Promise with result
   */
  async pushToGithub(files: Array<{ path: string; content: string }>): Promise<boolean> {
    if (!this.validateSettings()) {
      return false;
    }

    try {
      // Show initial notification
      const initialNotice = new Notice(`Starting publication of ${files.length} files...`, 10000);

      // Generate a unique branch name for this push
      const branchName = this.generateUniqueBranchName();

      // Get default branch to branch from
      const defaultBranch = await this.getDefaultBranch();
      initialNotice.hide();

      // Create a new branch
      new Notice(`Creating branch: ${branchName}...`, 3000);
      await this.createBranch(defaultBranch.sha, branchName);

      // Upload files
      const progressNotice = new Notice(`Uploading files to GitHub...`, 0);
      let uploadedCount = 0;

      // Process files sequentially to avoid GitHub API rate limits
      for (const file of files) {
        progressNotice.setMessage(
          `Uploading files to GitHub (${++uploadedCount}/${files.length})...`
        );

        await this.createOrUpdateFile(
          branchName,
          file.path,
          file.content,
          `Update ${file.path} via Obsidian Hugo Publisher`
        );
      }

      progressNotice.hide();

      // Show success notification
      new Notice(
        `Successfully published ${files.length} files to GitHub on branch: ${branchName}`,
        5000
      );

      return true;
    } catch (error) {
      console.error('Error pushing to GitHub:', error);
      new Notice(`Failed to publish to GitHub: ${error.message}`, 10000);
      return false;
    }
  }
}
