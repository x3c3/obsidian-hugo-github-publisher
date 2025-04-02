import { test, expect } from 'bun:test';
import { GitHubClient } from './githubClient.mock';

test('GitHubClient parses valid GitHub URLs', () => {
  const client = new GitHubClient({
    owner: '',
    repo: '',
    branch: 'main',
    contentPath: 'content',
    token: 'test-token',
  });

  // Test standard GitHub URL
  const result1 = client.parseRepoUrl('https://github.com/username/repo');
  expect(result1).not.toBeNull();
  expect(result1?.owner).toBe('username');
  expect(result1?.repo).toBe('repo');

  // Test with trailing slash
  const result2 = client.parseRepoUrl('https://github.com/username/repo/');
  expect(result2).not.toBeNull();
  expect(result2?.owner).toBe('username');
  expect(result2?.repo).toBe('repo');

  // Test with additional path components
  const result3 = client.parseRepoUrl('https://github.com/username/repo/tree/main');
  expect(result3).not.toBeNull();
  expect(result3?.owner).toBe('username');
  expect(result3?.repo).toBe('repo');
});

test('GitHubClient rejects invalid URLs', () => {
  const client = new GitHubClient({
    owner: '',
    repo: '',
    branch: 'main',
    contentPath: 'content',
    token: 'test-token',
  });

  // Test non-GitHub URL
  const result1 = client.parseRepoUrl('https://example.com/username/repo');
  expect(result1).toBeNull();

  // Test malformed GitHub URL
  const result2 = client.parseRepoUrl('https://github.com/username');
  expect(result2).toBeNull();
});
