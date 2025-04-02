---
publish: true
---

# Obsidian Plugin Development Guidelines

## Purpose

This plugin allows Obsidian users to publish their notes directly to GitHub, making them ready for Hugo static site generation. The plugin tracks notes with the frontmatter tag `publish: true`, converts Obsidian-specific syntax to Hugo-compatible format, and uploads the files to a specified GitHub repository.

## Rules of Thumb

- Yes, and…
- Name things once
- Embrace simplicity
- Ask permission once
- Assume good intentions
- Use one file/folder until needed
- Accept defaults first, deviate when justified

## Build & Test Commands

- `bun run dev` - Build and watch for changes
- `bun run build` - Production build
- `bun test` - Run all tests
- `bun test -t "test name"` - Run specific test
- `bun lint` - Run ESLint
- `bun lint:fix` - Fix linting issues
- `bun format` - Format code with Prettier

## Code Style Guidelines

- **TypeScript**: Use strict typing, avoid `any` and `unknown` when possible
- **Format**: Use Prettier with 2-space indentation, 100 char line limit
- **Imports**: Group imports (core, third-party, internal) with blank line separators
- **Naming**: PascalCase for components/classes, camelCase for variables/functions
- **Components**: One component per file, named same as file
- **Error Handling**: Use try/catch with specific error types
- **CSS**: Use kebab-case for CSS classes, prefer CSS modules
- **Comments**: Document public APIs and complex logic, avoid obvious comments

Run `bun lint`, `bun format` and `bun typecheck` before committing changes.
