// import Parser from 'tree-sitter';
// import Markdown from 'tree-sitter-markdown';

// const parser = new Parser();
// parser.setLanguage(Markdown);

export const name = 'markdown';
export const exts = ['.md'];

export function scan(src, { file }) {
  // Markdown files don't have dependencies in the same way as code files.
  // We include them for bundling, but don't scan for more files.
  return [];
}