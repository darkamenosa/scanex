import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const parser = new Parser();
parser.setLanguage(Python);

const QUERY = new Parser.Query(Python, `
  (import_statement name: (dotted_name (identifier) @import))
  (import_from_statement module_name: (dotted_name (identifier) @import))
`);

export const name = 'python';
export const exts = ['.py'];

export function scan(src) {
  if (!src || src.trim() === '') return [];
  try {
    const tree = parser.parse(src);
    const matches = QUERY.matches(tree.rootNode);
    return matches.map(m => m.captures[0].node.text);
  } catch (e) {
    console.error(`Error parsing python: ${e.message}`);
    return [];
  }
}

export function resolve(spec, { file }) {
  const path = spec.replace(/\./g, '/') + '.py';
  const fullPath = join(dirname(file), path);
  if (existsSync(fullPath)) return fullPath;
  return null;
} 