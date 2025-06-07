#!/usr/bin/env node
import { program } from 'commander';
import { resolve, dirname, extname, join, relative, basename } from 'node:path';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
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

// Validate inputs exist
for (const inputPath of INPUTS) {
  if (!existsSync(inputPath)) {
    console.error(`❌ Input path does not exist: ${inputPath}`);
    
    // Try to provide helpful suggestions
    const inputDir = dirname(inputPath);
    const inputFile = basename(inputPath);
    
    if (existsSync(inputDir)) {
      console.error(`   Directory ${inputDir} exists, but file ${inputFile} was not found.`);
      
      // Look for similar files
      try {
        const files = readdirSync(inputDir);
        const similar = files.filter(f => 
          f.toLowerCase().includes(inputFile.toLowerCase()) || 
          inputFile.toLowerCase().includes(f.toLowerCase())
        );
        
        if (similar.length > 0) {
          console.error(`   Did you mean one of these?`);
          similar.slice(0, 3).forEach(f => console.error(`     - ${join(inputDir, f)}`));
        }
      } catch (e) {
        // Ignore errors when trying to read directory
      }
    } else {
      console.error(`   Directory ${inputDir} also does not exist.`);
    }
    
    process.exit(1);
  }
}

/* find project root ------------------------------------------------------ */
let projectRoot = INPUTS[0];

// If input is a file, start from its directory
if (existsSync(projectRoot) && statSync(projectRoot).isFile()) {
  projectRoot = dirname(projectRoot);
}

// Function to check for repository root markers
function isRepositoryRoot(dir) {
  // Only consider it a repo root if it has .git directory (the definitive marker)
  // .gitignore alone is not enough as it can exist in subdirectories
  return existsSync(join(dir, '.git'));
}

// Function to check for project root markers
function isProjectRoot(dir) {
  const projectMarkers = [
    'package.json',    // Node.js/JavaScript
    'pyproject.toml',  // Python
    'Cargo.toml',      // Rust
    'go.mod',          // Go
    'pom.xml',         // Java/Maven
    'build.gradle',    // Java/Gradle
    'composer.json',   // PHP
    'Gemfile',         // Ruby
    'requirements.txt' // Python (alternative)
  ];
  return projectMarkers.some(marker => existsSync(join(dir, marker)));
}

// Function to safely parse JSON-like config files (tsconfig, jsconfig)
function parseConfigFile(content) {
  try {
    // First, try to parse as-is (in case it's already valid JSON)
    return JSON.parse(content);
  } catch (e) {
    // If that fails, clean it up
    let cleanContent = content;
    
    // Remove single-line comments, but not inside strings
    cleanContent = cleanContent.replace(/\/\/.*$/gm, '');
    
    // Remove multi-line comments, but be careful about strings
    cleanContent = cleanContent.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Remove trailing commas before closing brackets/braces
    cleanContent = cleanContent.replace(/,(\s*[}\]])/g, '$1');
    
    // Handle common tsconfig.json issues
    cleanContent = cleanContent
      // Remove any remaining trailing commas
      .replace(/,(\s*[}\],])/g, '$1')
      // Clean up any double commas that might have been created
      .replace(/,,+/g, ',')
      // Remove commas before closing braces/brackets
      .replace(/,(\s*[}\]])/g, '$1');
    
    try {
      return JSON.parse(cleanContent);
    } catch (e2) {
      // If still failing, try a more aggressive approach
      console.warn(`⚠️  TSConfig parsing failed, attempting fallback parsing...`);
      
      // Try to extract just the compilerOptions section if possible
      const compilerOptionsMatch = cleanContent.match(/"compilerOptions"\s*:\s*({[^}]*})/);
      if (compilerOptionsMatch) {
        try {
          const compilerOptions = JSON.parse(compilerOptionsMatch[1]);
          return { compilerOptions };
        } catch (e3) {
          // If even that fails, return minimal config
          console.warn(`⚠️  Could not parse tsconfig.json, path aliases will not work`);
          return null;
        }
      }
      
      // Last resort: return null to disable path alias resolution
      console.warn(`⚠️  Could not parse tsconfig.json, path aliases will not work`);
      return null;
    }
  }
}

// Search strategy: prioritize repository root, then project root
const originalProjectRoot = projectRoot;
let foundRepoRoot = null;
let foundProjectRoot = null;

// Search upward for repository and project markers
let currentDir = projectRoot;
while (currentDir !== dirname(currentDir)) { // Stop at filesystem root
  if (isRepositoryRoot(currentDir) && !foundRepoRoot) {
    foundRepoRoot = currentDir;
  }
  if (isProjectRoot(currentDir) && !foundProjectRoot) {
    foundProjectRoot = currentDir;
  }
  
  // If we found a repository root, we can stop searching
  if (foundRepoRoot) break;
  
  const parent = dirname(currentDir);
  if (parent === currentDir) break; // Additional safety check
  currentDir = parent;
}

// Choose the best project root:
// 1. Repository root (if found)
// 2. Project root (if found)  
// 3. Original input directory (fallback)
if (foundRepoRoot) {
  projectRoot = foundRepoRoot;
  console.log(`[codesnap] Repository root detected as: ${projectRoot}`);
} else if (foundProjectRoot) {
  projectRoot = foundProjectRoot;
  console.log(`[codesnap] Project root detected as: ${projectRoot}`);
} else {
  projectRoot = originalProjectRoot;
  console.log(`[codesnap] Using input directory as project root: ${projectRoot}`);
}

/* read .gitignore patterns ----------------------------------------------- */
// .gitignore files are now handled on-demand in the walk function
// Only keep user exclude patterns
const IGNORE = new RegExp(opts.exclude, 'i');
const OUTPUT = resolve(opts.output || 'codesnap.md');

/* load ts/jsconfig for path aliases -------------------------------------- */
// Function to find the nearest tsconfig.json or jsconfig.json
function findNearestConfig(startPath, projectRoot) {
  let currentDir = dirname(startPath);
  
  // Search upward from the file location, but don't go above project root
  while (currentDir.startsWith(projectRoot)) {
    const tsconfigPath = join(currentDir, 'tsconfig.json');
    const jsconfigPath = join(currentDir, 'jsconfig.json');
    
    if (existsSync(tsconfigPath)) {
      return { path: tsconfigPath, type: 'tsconfig' };
    }
    if (existsSync(jsconfigPath)) {
      return { path: jsconfigPath, type: 'jsconfig' };
    }
    
    const parent = dirname(currentDir);
    if (parent === currentDir) break; // Reached filesystem root
    currentDir = parent;
  }
  
  return null;
}

let aliasConfig = null;
let configBasePath = projectRoot;

// If we have specific input files, find config relative to them
if (INPUTS.length > 0 && INPUTS[0] !== projectRoot) {
  const inputFile = INPUTS[0];
  if (existsSync(inputFile) && statSync(inputFile).isFile()) {
    const config = findNearestConfig(inputFile, projectRoot);
    if (config) {
      configBasePath = dirname(config.path);
      try {
        const content = readFileSync(config.path, 'utf8');
        aliasConfig = parseConfigFile(content);
        console.log(`[codesnap] Loaded ${config.type}.json from ${relative(projectRoot, config.path)} for path aliases`);
      } catch (e) {
        console.error(`Error parsing ${config.type}.json: ${e.message}`);
      }
    }
  }
}

// Fallback: look in project root
if (!aliasConfig) {
  const tsconfigPath = join(projectRoot, 'tsconfig.json');
  const jsconfigPath = join(projectRoot, 'jsconfig.json');

  if (existsSync(tsconfigPath)) {
    try {
      const content = readFileSync(tsconfigPath, 'utf8');
      aliasConfig = parseConfigFile(content);
      console.log(`[codesnap] Loaded tsconfig.json for path aliases`);
    } catch (e) {
      console.error(`Error parsing tsconfig.json: ${e.message}`);
    }
  } else if (existsSync(jsconfigPath)) {
    try {
      const content = readFileSync(jsconfigPath, 'utf8');
      aliasConfig = parseConfigFile(content);
      console.log(`[codesnap] Loaded jsconfig.json for path aliases`);
    } catch (e) {
      console.error(`Error parsing jsconfig.json: ${e.message}`);
    }
  }
}

/* helper function to get proper extension including composite ones -------- */
function getFileExtension(filepath, allExtensions) {
  // Handle Dockerfiles first (special case with no traditional extension)
  const fileName = filepath.split('/').pop();
  if (fileName === 'Dockerfile' || fileName.startsWith('Dockerfile.')) {
    if (allExtensions.includes('Dockerfile')) {
      return 'Dockerfile';
    }
  }
  
  // Check for composite extensions (like .html.erb)
  for (const ext of allExtensions) {
    if (filepath.endsWith(ext)) {
      return ext;
    }
  }
  // Fallback to standard extname for simple extensions
  return extname(filepath);
}

/* seed queue ------------------------------------------------------------- */
const queue = [];
for (const p of INPUTS) queue.push(...walk(p, IGNORE, projectRoot));

const visited = new Set(queue.filter(f => ALL_EXT.includes(getFileExtension(f, ALL_EXT))));

/* BFS over imports ------------------------------------------------------- */
for (let i = 0; i < queue.length; i++) {
  const file = queue[i];
  const scanner = scanners.get(getFileExtension(file, ALL_EXT));
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
      for (const r of resolvers) {
        const resolved = r.resolve?.(spec, { projectRoot, aliasConfig, configBasePath, file });
        if (resolved) {
          target = resolved;
          break;
        }
      }
    }

    if (target && !IGNORE.test(target) && !visited.has(target)) {
      // Safety check: ensure target is a file, not a directory
      try {
        const stat = statSync(target);
        if (stat.isFile()) {
          visited.add(target);
          queue.push(target);
          log('⊕', relative(projectRoot, target));
        } else if (stat.isDirectory()) {
          console.warn(`⚠️  Skipping directory: ${relative(projectRoot, target)}`);
        }
      } catch (e) {
        // File doesn't exist or can't be accessed
        console.warn(`⚠️  Skipping invalid path: ${relative(projectRoot, target)} (${e.message})`);
      }
    }
  }
}

/* build nice directory tree --------------------------------------------- */
const treeStr = makeTree([...visited].map(f => relative(projectRoot, f)));

/* write file ------------------------------------------------------------- */
writeFileSync(OUTPUT, bundle([...visited].sort(), projectRoot, treeStr));
console.log(`✅ wrote ${relative('.', OUTPUT)}   (${visited.size} files)`);
