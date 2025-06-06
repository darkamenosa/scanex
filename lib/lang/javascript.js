import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TSGrammar  from 'tree-sitter-typescript';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const parserJS  = new Parser(); parserJS.setLanguage(JavaScript);
const parserTSX = new Parser(); parserTSX.setLanguage(TSGrammar.tsx);
const parserTS  = new Parser(); parserTS.setLanguage(TSGrammar.typescript);

const QUERY_JS = new Parser.Query(JavaScript, `
  (import_statement source: (string) @dep)
  (call_expression
     function: (identifier) @fn
     arguments: (arguments (string) @dep)
     (#eq? @fn "require"))
`);

const QUERY_TS = new Parser.Query(TSGrammar.typescript, `
  (import_statement source: (string) @dep)
  (call_expression
     function: (identifier) @fn
     arguments: (arguments (string) @dep)
     (#eq? @fn "require"))
`);

const QUERY_TSX = new Parser.Query(TSGrammar.tsx, `
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
    // Choose parser and query based on file extension
    let parser, query;
    if (file.endsWith('.tsx')) {
      parser = parserTSX;
      query = QUERY_TSX;
    } else if (file.endsWith('.ts')) {
      parser = parserTS;
      query = QUERY_TS;
    } else {
      parser = parserJS;
      query = QUERY_JS;
    }

    const tree = parser.parse(src);
    
    // Check if parsing was successful
    if (!tree || !tree.rootNode) {
      throw new Error('Failed to parse syntax tree');
    }
    
    const imports = [...query.matches(tree.rootNode)]
           .map(m => m.captures.find(c => c.name === 'dep').node.text.replace(/['"]/g,''));
    
    // Show what imports were found
    if (imports.length > 0) {
      console.log(`[codesnap] Found ${imports.length} imports in ${file.split('/').pop()}`);
    }
    
    return imports;
  } catch (e) {
    // For TSX files, try falling back to JavaScript parser
    if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      // Gracefully skip problematic files
      console.warn(`⚠️  Skipping ${file.split('/').pop()}: parsing failed. Error: ${e.message}`);
      return [];
    } else {
      console.warn(`⚠️  Skipping ${file.split('/').pop()}: ${e.message}`);
    }
    return [];
  }
}

export function resolve(spec, { projectRoot, aliasConfig, configBasePath, file }) {
  // Handle both string specs and object specs (from Ruby)
  const specValue = typeof spec === 'string' ? spec : spec.value;
  
  if (!aliasConfig?.compilerOptions?.paths) {
    return null;
  }

  const { baseUrl = ".", paths } = aliasConfig.compilerOptions; // Default baseUrl to "."

  // Use configBasePath (where tsconfig.json was found) as the base for resolution
  const resolveBasePath = configBasePath || projectRoot;

  for (const [alias, aliasPaths] of Object.entries(paths)) {
    const aliasPrefix = alias.slice(0, -2); // remove '/*'
    
    if (specValue.startsWith(aliasPrefix)) {
      const remainingPath = specValue.substring(aliasPrefix.length);
      
      for (const p of aliasPaths) {
        const base = join(resolveBasePath, baseUrl, p.slice(0, -2));
        const resolvedPath = join(base, remainingPath);

        // Check for file with extensions
        for (const ext of exts) {
          const pathWithExt = `${resolvedPath}${ext}`;
          if (existsSync(pathWithExt)) {
            return pathWithExt;
          }
        }

        // Check for directory with index file
        for (const ext of exts) {
          const indexFile = join(resolvedPath, `index${ext}`);
          if (existsSync(indexFile)) {
            return indexFile;
          }
        }
      }
    }
  }

  return null;
}
