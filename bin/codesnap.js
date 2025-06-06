#!/usr/bin/env node
import { program } from 'commander';
import { resolve, dirname, extname, join, relative } from 'node:path';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadPlugins, walk, bundle, log, makeTree } from '../lib/core.js';

const __filename = fileURLToPath(import.meta.url);
const PKG_ROOT   = dirname(dirname(__filename));              // repo root

// Read package.json for version info
const packageJson = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));

/* CLI -------------------------------------------------------------------- */
program
  .name('codesnap')
  .description('📸 A tool that extracts and bundles related code from files or directories into a markdown file.\n\nCodesnap analyzes your code dependencies and creates a comprehensive documentation file containing all related source files in a structured format.')
  .version(packageJson.version, '-v, --version', 'display version number')
  .option('-i, --input <paths>', 
    'comma-separated files or directories to analyze (default: current directory)\n' +
    '                                     Examples:\n' +
    '                                       --input src/main.js\n' +
    '                                       --input src/,lib/utils.js\n' +
    '                                       --input .')
  .option('-e, --exclude <pattern>', 
    'regex pattern of paths to ignore (default: "node_modules|test|routes/index.js")\n' +
    '                                     Note: .gitignore patterns are automatically included\n' +
    '                                     Examples:\n' +
    '                                       --exclude "node_modules|test|dist"\n' +
    '                                       --exclude ".*\\.spec\\.js$|routes/index.js"', 
    'node_modules|test|routes/index\\.js')
  .option('-o, --output <file>', 
    'markdown output file path\n' +
    '                                     Default: codesnap.md in current directory\n' +
    '                                     Examples:\n' +
    '                                       --output documentation.md\n' +
    '                                       --output ./docs/codebase.md')
  .addHelpText('after', `
Examples:
  $ codesnap
    Analyze all files in current directory (respects .gitignore)

  $ codesnap --input src/main.js
    Analyze main.js and its dependencies, output to codesnap.md

  $ codesnap --input src/ --output docs/codebase.md
    Analyze all files in src/ directory, output to docs/codebase.md

  $ codesnap --input lib/,src/utils.js --exclude "test|spec"
    Analyze lib/ directory and utils.js, excluding test files

  $ codesnap --exclude "node_modules|dist|build"
    Analyze entire project, excluding common build directories

Features:
  • 🔍 Automatically discovers file dependencies
  • 📁 Creates directory tree visualization
  • 📝 Bundles all related code into organized markdown
  • 🚀 Supports multiple programming languages
  • ⚡ Fast dependency resolution with tree-sitter
  • 🙈 Automatically respects .gitignore files

For more information, visit: https://github.com/darkamenosa/codesnap
`)
  .parse();

const opts = program.opts();

/* plug-ins --------------------------------------------------------------- */
const { scanners, resolvers, ALL_EXT } =
  await loadPlugins(join(PKG_ROOT, 'lib/lang'));

// Default to current directory if no input provided
const INPUTS = (opts.input || '.').split(',').map(p => resolve(p.trim()));

/* find project root ------------------------------------------------------ */
let projectRoot = INPUTS[0];

// If input is a file, start from its directory
if (existsSync(projectRoot) && statSync(projectRoot).isFile()) {
  projectRoot = dirname(projectRoot);
}

// Search upward for package.json to find project root
while (projectRoot !== '/' && !existsSync(join(projectRoot, 'package.json'))) {
  const parent = dirname(projectRoot);
  if (parent === projectRoot) break; // Prevent infinite loop at root
  projectRoot = parent;
}

console.log(`[codesnap] Project root detected as: ${projectRoot}`);

/* read .gitignore patterns ----------------------------------------------- */
function parseGitignore(gitignorePath) {
  if (!existsSync(gitignorePath)) return [];
  
  const content = readFileSync(gitignorePath, 'utf8');
  const patterns = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')) // Remove empty lines and comments
    .map(pattern => {
      // Convert gitignore patterns to regex patterns
      if (pattern.startsWith('!')) {
        // Negation patterns are complex to handle, skip for now
        return null;
      }
      
      // Handle different gitignore pattern types
      let regexPattern = pattern;
      
      // Remove leading slash for absolute patterns
      if (regexPattern.startsWith('/')) {
        regexPattern = regexPattern.slice(1);
      }
      
      // Escape special regex characters except * and ?
      regexPattern = regexPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      
      // Handle directory patterns (ending with /)
      if (pattern.endsWith('/')) {
        regexPattern = regexPattern + '.*';
      }
      
      // Make pattern match anywhere in the path
      regexPattern = '(^|/)' + regexPattern + '($|/)';
      
      return regexPattern;
    })
    .filter(Boolean);

  if (patterns.length > 0) {
    console.log(`[codesnap] Loaded ${patterns.length} .gitignore patterns`);
  }
  return patterns;
}

const gitignorePath = join(projectRoot, '.gitignore');
const gitignorePatterns = parseGitignore(gitignorePath);

// Combine user exclude patterns with gitignore patterns  
let excludePattern = opts.exclude;
if (gitignorePatterns.length > 0) {
  excludePattern += '|' + gitignorePatterns.join('|');
}

const IGNORE = new RegExp(excludePattern.replace(/\*/g, '.*'), 'i');
const OUTPUT = resolve(opts.output || 'codesnap.md');

/* load ts/jsconfig for path aliases -------------------------------------- */
let aliasConfig = null;
const tsconfigPath = join(projectRoot, 'tsconfig.json');
const jsconfigPath = join(projectRoot, 'jsconfig.json');

if (existsSync(tsconfigPath)) {
  try {
    const content = readFileSync(tsconfigPath, 'utf8');
    aliasConfig = JSON.parse(content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));
    if (aliasConfig) console.log(`[codesnap] Loaded tsconfig.json for path aliases`);
  } catch (e) { console.error(`Error parsing tsconfig.json: ${e.message}`); }
} else if (existsSync(jsconfigPath)) {
  try {
    const content = readFileSync(jsconfigPath, 'utf8');
    aliasConfig = JSON.parse(content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''));
    if (aliasConfig) console.log(`[codesnap] Loaded jsconfig.json for path aliases`);
  } catch (e) { console.error(`Error parsing jsconfig.json: ${e.message}`); }
}

/* seed queue ------------------------------------------------------------- */
const queue = [];
for (const p of INPUTS) queue.push(...walk(p, IGNORE));

const visited = new Set(queue.filter(f => ALL_EXT.includes(extname(f))));

/* BFS over imports ------------------------------------------------------- */
for (let i = 0; i < queue.length; i++) {
  const file = queue[i];
  const scanner = scanners.get(extname(file));
  if (!scanner) continue;

  const src = readFileSync(file, 'utf8');
  for (const spec of scanner.scan(src, { file })) {
    let target = null;
    
    // Handle both string specs (JavaScript) and object specs (Ruby)
    const specValue = typeof spec === 'string' ? spec : spec.value;

    /* relative ('./foo') */
    if (specValue.startsWith('.')) {
      const base = resolve(dirname(file), specValue);
      target = ALL_EXT.map(e => base.endsWith(e) ? base : base + e)
                      .find(existsSync);
    }

    /* plug-in custom resolver */
    if (!target) {
      for (const r of resolvers)
        target = r.resolve?.(spec, { projectRoot, aliasConfig, file }) || target;
    }

    if (target && !IGNORE.test(target) && !visited.has(target)) {
      visited.add(target);
      queue.push(target);
      log('⊕', relative(projectRoot, target));
    }
  }
}

/* build nice directory tree --------------------------------------------- */
const treeStr = makeTree([...visited].map(f => relative(projectRoot, f)));

/* write file ------------------------------------------------------------- */
writeFileSync(OUTPUT, bundle([...visited].sort(), projectRoot, treeStr));
console.log(`✅ wrote ${relative('.', OUTPUT)}   (${visited.size} files)`);
