import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TSGrammar  from 'tree-sitter-typescript';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const parserJS  = new Parser(); parserJS.setLanguage(JavaScript);
const parserTSX = new Parser(); parserTSX.setLanguage(TSGrammar.tsx);

const QUERY = new Parser.Query(JavaScript, `
  (import_statement source: (string) @dep)
  (call_expression
     function: (identifier) @fn
     arguments: (arguments (string) @dep)
     (#eq? @fn "require"))
`);

export const name = 'javascript';
export const exts = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  try {
    const tree = parserJS.parse(src);
    return [...QUERY.matches(tree.rootNode)]
           .map(m => m.captures.find(c => c.name === 'dep').node.text.replace(/['"]/g,''));
  } catch (e) {
    console.error(`Error parsing ${file} with tree-sitter: ${e.message}`);
    return [];
  }
}

export function resolve(spec, { projectRoot, aliasConfig }) {
  // Handle both string specs and object specs (from Ruby)
  const specValue = typeof spec === 'string' ? spec : spec.value;
  
  if (!aliasConfig?.compilerOptions?.paths) return null;

  const { baseUrl, paths } = aliasConfig.compilerOptions;
  if (!baseUrl || !paths) return null;

  for (const [alias, aliasPaths] of Object.entries(paths)) {
    const aliasPrefix = alias.slice(0, -2); // remove '/*'
    if (specValue.startsWith(aliasPrefix)) {
      const remainingPath = specValue.substring(aliasPrefix.length);
      for (const p of aliasPaths) {
        const base = join(projectRoot, baseUrl, p.slice(0, -2));
        const resolvedPath = join(base, remainingPath);

        // Check for file with extensions
        for (const ext of exts) {
          const pathWithExt = `${resolvedPath}${ext}`;
          if (existsSync(pathWithExt)) return pathWithExt;
        }

        // Check for directory with index file
        for (const ext of exts) {
          const indexFile = join(resolvedPath, `index${ext}`);
          if (existsSync(indexFile)) return indexFile;
        }
      }
    }
  }

  return null;
}
