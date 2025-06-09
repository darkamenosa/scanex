import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import { join, dirname, resolve as pathResolve } from 'node:path';
import { existsSync } from 'node:fs';

const parser = new Parser();
parser.setLanguage(Python);

// Simplified query to capture Python imports
const QUERY = new Parser.Query(Python, `
  (import_statement) @import_stmt
  (import_from_statement) @import_from_stmt
`);

export const name = 'python';
export const exts = ['.py'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  
  try {
    const tree = parser.parse(src);
    const imports = [];
    
    // Get all import matches
    const matches = QUERY.matches(tree.rootNode);
    for (const match of matches) {
      for (const capture of match.captures) {
        const importStmt = capture.node.text;
        
        if (capture.name === 'import_stmt') {
          // Handle "import module" statements
          const moduleMatch = importStmt.match(/^import\s+([\w\.]+)/);
          if (moduleMatch) {
            imports.push(moduleMatch[1]);
          }
        } else if (capture.name === 'import_from_stmt') {
          // Handle "from module import ..." statements
          const moduleMatch = importStmt.match(/^from\s+([\w\.]+)\s+import/);
          if (moduleMatch) {
            imports.push(moduleMatch[1]);
          }
        }
      }
    }
    
    // Remove duplicates and return
    return [...new Set(imports)];
  } catch (e) {
    console.warn(`⚠️ Error parsing Python file ${file}: ${e.message}`);
    return [];
  }
}

export function resolve(spec, { file, projectRoot }) {
  if (!projectRoot || !spec) return null;
  
  // Handle both string specs (Python) and object specs (Ruby/ERB)
  const specValue = typeof spec === 'string' ? spec : spec.value;
  if (!specValue) return null;
  
  // Handle relative imports
  if (specValue.startsWith('.')) {
    return resolveRelativeImport(specValue, file, projectRoot);
  }
  
  // Handle absolute imports
  return resolveAbsoluteImport(specValue, file, projectRoot);
}

function resolveRelativeImport(spec, file, projectRoot) {
  const fileDir = dirname(file);
  const levels = (spec.match(/^\./g) || []).length;
  
  let targetDir = fileDir;
  // Go up directory levels based on number of dots
  for (let i = 1; i < levels; i++) {
    targetDir = dirname(targetDir);
  }
  
  // Remove leading dots to get the module path
  const modulePath = spec.replace(/^\.+/, '');
  if (modulePath) {
    const path = modulePath.replace(/\./g, '/');
    return tryResolveModule(join(targetDir, path), projectRoot);
  }
  
  return null;
}

function resolveAbsoluteImport(spec, file, projectRoot) {
  // Try to find the module starting from common Python source directories
  const sourceDirs = [
    projectRoot,
    join(projectRoot, 'src'),
    join(projectRoot, 'backend'),
    join(projectRoot, 'app'),
    dirname(file) // Also try relative to current file
  ];
  
  const modulePath = spec.replace(/\./g, '/');
  
  for (const sourceDir of sourceDirs) {
    if (!sourceDir.startsWith(projectRoot)) continue; // Security check
    
    const resolved = tryResolveModule(join(sourceDir, modulePath), projectRoot);
    if (resolved) return resolved;
  }
  
  return null;
}

function tryResolveModule(basePath, projectRoot) {
  // Ensure we stay within project boundaries
  if (!pathResolve(basePath).startsWith(pathResolve(projectRoot))) {
    return null;
  }
  
  // Try direct file
  const pyFile = `${basePath}.py`;
  if (existsSync(pyFile)) {
    return pyFile;
  }
  
  // Try package directory with __init__.py
  const initFile = join(basePath, '__init__.py');
  if (existsSync(initFile)) {
    return initFile;
  }
  
  // Try without extension (in case it was already provided)
  if (existsSync(basePath) && basePath.endsWith('.py')) {
    return basePath;
  }
  
  return null;
} 