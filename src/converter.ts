import { IHugoGithubPublisherPlugin } from './types';

export class MarkdownConverter {
  private plugin: IHugoGithubPublisherPlugin;

  constructor(plugin: IHugoGithubPublisherPlugin) {
    this.plugin = plugin;
  }

  /**
   * Converts an Obsidian filename to a safe Hugo filename
   * @param filename The original filename
   * @returns Safe Hugo filename
   */
  convertToSafeHugoFilename(filename: string): string {
    // Remove the extension if present
    const nameWithoutExtension = filename.replace(/\.md$/, '');

    // Convert to a safe filename
    return this.slugify(nameWithoutExtension) + '.md';
  }

  /**
   * Gets the title from a filename
   * @param filename The original filename
   * @returns Title for the post
   */
  getTitleFromFilename(filename: string): string {
    // Remove the extension if present
    const nameWithoutExtension = filename.replace(/\.md$/, '');
    return nameWithoutExtension;
  }

  /**
   * Ensures the frontmatter has a title, injecting one from the filename if needed
   * @param content The markdown content
   * @param filename The original filename
   * @returns Markdown content with title in frontmatter
   */
  ensureTitleInFrontmatter(content: string, filename: string): string {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      // No frontmatter found, add basic frontmatter with title
      const title = this.getTitleFromFilename(filename);
      return `---\ntitle: "${title}"\npublish: true\n---\n\n${content}`;
    }

    // Parse existing frontmatter
    const frontmatterText = match[1];
    const frontmatterLines = frontmatterText.split('\n');

    // Check if title exists in frontmatter
    const titleLine = frontmatterLines.find(line => line.startsWith('title:'));

    if (!titleLine) {
      // Title not found, add it
      const title = this.getTitleFromFilename(filename);
      const newFrontmatter = `---\ntitle: "${title}"\n${frontmatterText}\n---`;
      return content.replace(frontmatterRegex, newFrontmatter);
    }

    // Title already exists, no change needed
    return content;
  }

  /**
   * Converts Obsidian-style markdown to Hugo-compatible markdown
   * @param content The original Obsidian markdown content
   * @param filePath The file path for resolving relative links
   * @param filename The original filename (needed for title generation)
   * @returns Converted Hugo-compatible markdown
   */
  convertToHugoMarkdown(content: string, filePath: string, filename = ''): string {
    let hugoContent = content;

    // Ensure we have a filename to work with
    if (!filename && filePath) {
      // Extract filename from path
      const pathParts = filePath.split('/');
      filename = pathParts[pathParts.length - 1];
    }

    // Add or update title in frontmatter if we have a filename
    if (filename) {
      hugoContent = this.ensureTitleInFrontmatter(hugoContent, filename);
    }

    // Convert internal links
    hugoContent = this.convertInternalLinks(hugoContent);

    // Convert image links
    hugoContent = this.convertImageLinks(hugoContent, filePath);

    // Handle other Obsidian-specific syntax
    hugoContent = this.handleObsidianSyntax(hugoContent);

    return hugoContent;
  }

  /**
   * Converts Obsidian internal links to Hugo-compatible format
   * @param content The original content
   * @returns Content with converted internal links
   */
  private convertInternalLinks(content: string): string {
    // Replace [[Page Name]] with [Page Name]({{< ref "page-name" >}})
    const wikiLinkRegex = /\[\[(.*?)(\|.*?)?\]\]/g;

    return content.replace(wikiLinkRegex, (match, page, alias) => {
      const pageTitle = page.trim();
      const displayText = alias ? alias.substring(1).trim() : pageTitle;
      const slugifiedPath = this.slugify(pageTitle);

      return `[${displayText}]({{< ref "${slugifiedPath}" >}})`;
    });
  }

  /**
   * Converts Obsidian image links to Hugo-compatible format
   * @param content The original content
   * @param filePath The current file path for resolving relative paths
   * @returns Content with converted image links
   */
  private convertImageLinks(content: string, filePath: string): string {
    // Handle standard markdown image syntax ![alt](path)
    const imageRegex = /!\[(.*?)\]\((.*?)\)/g;

    return content.replace(imageRegex, (match, alt, path) => {
      // Handle different types of image paths
      if (path.startsWith('http')) {
        // External URLs - keep as is
        return match;
      } else if (path.startsWith('data:')) {
        // Data URLs - keep as is
        return match;
      } else {
        // Local images - convert to Hugo static path
        const cleanPath = path.replace(/^\.\//, ''); // Remove leading ./
        // Use filePath to determine the correct static path
        const staticPath = `/images/${this.getRelativePath(cleanPath, filePath)}`;
        return `![${alt}](${staticPath})`;
      }
    });
  }

  private getRelativePath(imagePath: string, filePath: string): string {
    // If the image path is already absolute, return it
    if (imagePath.startsWith('/')) {
      return imagePath.substring(1);
    }

    // Get the directory of the current file
    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));

    // If the image path is relative to the current file
    if (imagePath.startsWith('./')) {
      return `${fileDir}/${imagePath.substring(2)}`;
    }

    // Default case: image is in the same directory as the file
    return `${fileDir}/${imagePath}`;
  }

  /**
   * Handles other Obsidian-specific syntax conversions
   * @param content The original content
   * @returns Content with converted syntax
   */
  private handleObsidianSyntax(content: string): string {
    let processedContent = content;

    // Convert embeds to Hugo shortcodes
    processedContent = this.convertEmbeds(processedContent);

    // Convert task lists
    processedContent = this.convertTaskLists(processedContent);

    // Convert wikilinks with aliases
    processedContent = this.convertWikilinksWithAliases(processedContent);

    return processedContent;
  }

  private convertEmbeds(content: string): string {
    // Convert Obsidian embeds to Hugo shortcodes
    const embedRegex = /!\[\[(.*?)(\|.*?)?\]\]/g;

    return content.replace(embedRegex, (match, path, size) => {
      const cleanPath = path.trim();
      const sizeParam = size ? ` size="${size.substring(1)}"` : '';
      return `{{< embed "${cleanPath}"${sizeParam} >}}`;
    });
  }

  private convertTaskLists(content: string): string {
    // Convert Obsidian task lists to Hugo-compatible format
    const taskRegex = /^(\s*)- \[( |x)\] (.*)$/gm;

    return content.replace(taskRegex, (match, indent, status, text) => {
      return `${indent}- [${status}] ${text}`;
    });
  }

  private convertWikilinksWithAliases(content: string): string {
    // Convert wikilinks with aliases to Hugo shortcodes
    const wikilinkRegex = /\[\[(.*?)(\|.*?)?\]\]/g;

    return content.replace(wikilinkRegex, (match, target, alias) => {
      const cleanTarget = target.trim();
      const cleanAlias = alias ? alias.substring(1).trim() : cleanTarget;
      return `[${cleanAlias}]({{< ref "${this.slugify(cleanTarget)}" >}})`;
    });
  }

  /**
   * Simple slugify function for converting titles to URL-friendly paths
   * @param text The text to slugify
   * @returns Slugified text
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w-]+/g, '') // Remove all non-word chars
      .replace(/--+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, ''); // Trim - from end of text
  }
}
