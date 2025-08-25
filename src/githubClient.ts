import { Notice } from 'obsidian';

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  branch: string;
  contentPath: string;
  token: string;
}

export interface CommitFile {
  path: string;
  content: string;
}

export class GitHubClient {
  private repoInfo: GitHubRepoInfo;

  constructor(repoInfo: GitHubRepoInfo) {
    this.repoInfo = repoInfo;
  }

  async uploadFiles(files: CommitFile[]): Promise<boolean> {
    try {
      // Get the latest commit SHA to use as the parent
      const branchData = await this.fetchBranchData();
      // Using a more specific type for the branch data
      const branchDataTyped = branchData as { commit?: { sha: string } };
      const parentSha = branchDataTyped.commit?.sha;

      if (!parentSha) {
        throw new Error('Could not retrieve commit SHA from branch data');
      }

      // Create a new commit with the files
      const commitResult = await this.createCommit(files, parentSha);

      if (commitResult) {
        new Notice('Successfully published to GitHub');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error uploading files to GitHub:', error);
      new Notice('Failed to publish to GitHub. Check console for details.');
      return false;
    }
  }

  private async fetchBranchData(): Promise<Record<string, unknown>> {
    const { owner, repo, branch, token } = this.repoInfo;

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
      {
        method: 'GET',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch branch data: ${response.statusText}`);
    }

    return await response.json();
  }

  private async createCommit(files: CommitFile[], parentSha: string): Promise<boolean> {
    const { owner: _owner, repo: _repo, branch: _branch, token: _token } = this.repoInfo;

    // Create a new tree with the files
    const tree = await this.createTree(files, parentSha);

    // Create a commit with the new tree
    const commitSha = await this.createCommitObject((tree as { sha: string }).sha, parentSha);

    // Update the branch reference to point to the new commit
    return await this.updateBranchReference(commitSha);
  }

  private async createTree(
    files: CommitFile[],
    parentSha: string
  ): Promise<Record<string, unknown>> {
    const { owner, repo, token } = this.repoInfo;

    const treeItems = files.map(file => ({
      path: file.path,
      mode: '100644', // Regular file
      type: 'blob',
      content: file.content,
    }));

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        base_tree: parentSha,
        tree: treeItems,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create tree: ${response.statusText}`);
    }

    return await response.json();
  }

  private async createCommitObject(treeSha: string, parentSha: string): Promise<string> {
    const { owner, repo, token } = this.repoInfo;

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: 'Publish Obsidian notes',
        tree: treeSha,
        parents: [parentSha],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create commit: ${response.statusText}`);
    }

    const data = await response.json();
    return (data as { sha: string }).sha;
  }

  private async updateBranchReference(commitSha: string): Promise<boolean> {
    const { owner, repo, branch, token } = this.repoInfo;

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          sha: commitSha,
          force: false,
        }),
      }
    );

    return response.ok;
  }

  parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
    try {
      const url = new URL(repoUrl);

      if (url.hostname !== 'github.com') {
        return null;
      }

      const pathParts = url.pathname.split('/').filter(Boolean);

      if (pathParts.length < 2) {
        return null;
      }

      return {
        owner: pathParts[0],
        repo: pathParts[1],
      };
    } catch (error) {
      console.error('Error parsing repo URL:', error);
      return null;
    }
  }
}
