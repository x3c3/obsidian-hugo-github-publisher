---
publish: true
---

# Hugo GitHub Publisher Plugin for Obsidian

A plugin that helps you publish your Obsidian notes to GitHub, ready for Hugo site generation.

## Features

- Automatically track notes with frontmatter tag `publish: true`
- Publish current file to a GitHub repository with a single command
- Convert Obsidian-specific syntax to Hugo-compatible markdown
- All files are placed in the configured content directory (flat structure)
- Track publication history
- Support for configuring GitHub repository details

## Installation

1. Download the latest release from the Releases section
2. Extract the ZIP file into your Obsidian plugins folder
3. Enable the plugin in Obsidian settings

### Manual Installation

1. Clone this repository
2. Run `bun install` to install dependencies
3. Run `bun run build` to build the plugin
4. Copy `main.js` and `manifest.json` to your Obsidian plugins folder

## Setup

1. Open Obsidian settings
2. Go to "GitHub Publisher" in the plugins section
3. Configure your GitHub repository details:
   - Repository URL (e.g., https://github.com/username/repo)
   - Branch (default: main)
   - Content path (default: content)
   - GitHub personal access token (with repo scope)
4. Set your preferred frontmatter template and other options

## Usage

### Adding a Note for Publication

To mark a note for publication, add `publish: true` to its frontmatter:

```yaml
---
title: My Note
publish: true
---
```

### Publishing the Current File

1. Open the file you want to publish in Obsidian
2. Use the command palette (Ctrl/Cmd+P) and search for "Publish current file to GitHub"
3. The plugin will publish the currently active file if it has `publish: true` in its frontmatter

### Republishing the Current File

1. Open the file you want to republish in Obsidian
2. Use the command palette and search for "Republish current file"
3. This will force republish the current file even if it hasn't been modified

## Development

### Build Commands

- `bun run dev` - Watch for changes and rebuild
- `bun run build` - Production build
- `bun test` - Run tests
- `bun lint` - Run linter
- `bun lint:fix` - Fix linting issues
- `bun format` - Format code with Prettier

### Project Structure

- `src/main.ts` - Main plugin file
- `src/tracker.ts` - Tracks notes with publish frontmatter
- `src/markdownConverter.ts` - Converts Obsidian markdown to Hugo format
- `src/githubClient.ts` - Handles GitHub API integration
- `styles/styles.css` - Plugin styles

## License

MIT
