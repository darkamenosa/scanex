import Parser from 'tree-sitter';
import JSON from 'tree-sitter-json';

const parser = new Parser();
parser.setLanguage(JSON);

export const name = 'json';
export const exts = ['.json'];

export function scan(src, { file }) {
  // JSON files don't have dependencies in the same way as code files.
  // We include them for bundling, but don't scan for more files.
  return [];
} 