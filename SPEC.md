---
publish: true
---

# Obsidian Github Publisher Plugin Specification

## Overview

A plugin that tracks specific notes and publishes them to GitHub, ready for Hugo site generation.

## Features

1. Track notes with frontmatter tag `publish: true`
2. Provide command to push tracked notes to a GitHub repository
3. Convert Obsidian-specific syntax to Hugo-compatible markdown
4. Place all files in the configured content directory (flat structure)
5. Support for configuration of GitHub repository details
6. Preview notes before publishing

## Technical Requirements

1. Use GitHub API for repository operations
2. Store GitHub authentication securely
3. Track note modification status to avoid unnecessary pushes
4. Support custom frontmatter fields for Hugo
5. Convert internal links to Hugo-compatible format
6. Handle image attachments and other resources

## User Interface

1. Settings tab for GitHub repository configuration
2. Command palette entry for publishing
3. Status indicator for tracked notes
4. Publish confirmation dialog with preview
5. Publication history/log

## Settings

1. GitHub repository URL
2. Branch name
3. Content directory path in repository
4. Personal access token storage
5. Default frontmatter template
6. File extension options (.md vs .markdown)
7. Image handling options

## Implementation Plan

1. Setup basic plugin structure
2. Implement note tracking system
3. Develop GitHub API integration
4. Create markdown conversion utilities
5. Build configuration UI
6. Implement command and preview functionality
7. Add publication history and logging
8. Test with various note structures and content types
