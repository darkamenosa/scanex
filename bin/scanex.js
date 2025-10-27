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
  .name('scanex')
  .description('📸 A tool that extracts and bundles related code from files or directories into a markdown file.\n\nScanEx analyzes your code dependencies and creates a comprehensive documentation file containing all related source files in a structured format.')
  .version(packageJson.version, '-v, --version', 'display version number')
  .argument('[paths...]', 'files or directories to analyze (space-separated)')
  .option('-i, --input <paths>',
    'comma-separated files or directories to analyze (legacy)\n' +
    '                                     You can now use positional arguments instead:\n' +
    '                                       scanex src/main.js lib/utils.js\n' +
    '                                     Or continue using --input for backward compatibility:\n' +
    '                                       --input src/main.js,lib/utils.js')
  .option('-e, --exclude <pattern>',
    'regex pattern of paths to ignore (default: "node_modules")\n' +
    '                                     Note: .gitignore patterns are automatically included\n' +
    '                                     Examples:\n' +
    '                                       --exclude "node_modules|test|dist"\n' +
    '                                       --exclude ".*\\.spec\\.js$"',
    'node_modules')
  .option('-o, --output <file>',
    'write output to specified file instead of stdout\n' +
    '                                     Examples:\n' +
    '                                       --output documentation.md\n' +
    '                                       --output ./docs/codebase.md')
  .option('--no-tree', 'skip directory tree visualization')
  .option('--no-deps', 'do not follow dependencies (scan only specified files)')
  .option('--dry-run', 'preview what files would be scanned without processing')
  .option('--stats', 'show statistics (file count, languages, size)')
  .option('-q, --quiet', 'suppress progress messages')
  .addHelpText('after', `
Examples:
  $ scanex
    Analyze all files in current directory, output to stdout

  $ scanex src/main.js
    Analyze main.js and its dependencies (NEW: positional args!)

  $ scanex src/ lib/utils.js
    Analyze multiple files/directories (NEW: space-separated!)

  $ scanex src/ --exclude "test" --output docs.md
    Analyze src with custom exclude pattern

  $ scanex --input src/main.js
    Analyze using legacy --input flag (still supported)

  $ scanex --dry-run src/
    Preview what would be scanned (NEW!)

  $ scanex --stats src/
    Show statistics about the codebase (NEW!)

  $ scanex --no-tree src/ --output docs.md
    Skip directory tree in output (NEW!)

  $ scanex | pbcopy
    Copy bundled code directly to clipboard (macOS)

  $ scanex | grep "function"
    Pipe output through grep to find functions

Features:
  • 🔍 Automatically discovers file dependencies
  • 📁 Creates directory tree visualization
  • 📝 Bundles all related code into organized markdown
  • 🚀 Supports multiple programming languages
  • ⚡ Fast dependency resolution with tree-sitter
  • 🙈 Automatically respects .gitignore files

For more information, visit: https://github.com/darkamenosa/scanex
`)
  .parse();

const opts = program.opts();
const positionalArgs = program.args;

/* plug-ins --------------------------------------------------------------- */
const { scanners, resolvers, ALL_EXT } =
  await loadPlugins(join(PKG_ROOT, 'lib/lang'), opts.quiet);

// Determine inputs: positional args > --input flag > current directory
let INPUTS;
if (positionalArgs && positionalArgs.length > 0) {
  // Use positional arguments (space-separated)
  INPUTS = positionalArgs.map(p => resolve(p));
} else if (opts.input) {
  // Use --input flag (comma-separated for backward compatibility)
  INPUTS = opts.input.split(',').map(p => resolve(p.trim()));
} else {
  // Default to current directory
  INPUTS = [resolve('.')];
}

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
  if (!opts.quiet) console.error(`[scanex] Repository root detected as: ${projectRoot}`);
} else if (foundProjectRoot) {
  projectRoot = foundProjectRoot;
  if (!opts.quiet) console.error(`[scanex] Project root detected as: ${projectRoot}`);
} else {
  projectRoot = originalProjectRoot;
  if (!opts.quiet) console.error(`[scanex] Using input directory as project root: ${projectRoot}`);
}

/* read .gitignore patterns ----------------------------------------------- */
// .gitignore files are now handled on-demand in the walk function
// Only keep user exclude patterns
const IGNORE = new RegExp(opts.exclude, 'i');

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
        if (!opts.quiet) console.error(`[scanex] Loaded ${config.type}.json from ${relative(projectRoot, config.path)} for path aliases`);
      } catch (e) {
        if (!opts.quiet) console.error(`Error parsing ${config.type}.json: ${e.message}`);
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
      if (!opts.quiet) console.error(`[scanex] Loaded tsconfig.json for path aliases`);
    } catch (e) {
      if (!opts.quiet) console.error(`Error parsing tsconfig.json: ${e.message}`);
    }
  } else if (existsSync(jsconfigPath)) {
    try {
      const content = readFileSync(jsconfigPath, 'utf8');
      aliasConfig = parseConfigFile(content);
      if (!opts.quiet) console.error(`[scanex] Loaded jsconfig.json for path aliases`);
    } catch (e) {
      if (!opts.quiet) console.error(`Error parsing jsconfig.json: ${e.message}`);
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
// Skip dependency scanning if --no-deps flag is set
if (opts.deps !== false) {
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
            if (!opts.quiet) log('⊕', relative(projectRoot, target));
          } else if (stat.isDirectory()) {
            if (!opts.quiet) console.warn(`⚠️  Skipping directory: ${relative(projectRoot, target)}`);
          }
        } catch (e) {
          // File doesn't exist or can't be accessed
          if (!opts.quiet) console.warn(`⚠️  Skipping invalid path: ${relative(projectRoot, target)} (${e.message})`);
        }
      }
    }
  }
}

/* --dry-run: preview files without processing ---------------------------- */
if (opts.dryRun) {
  const sortedFiles = [...visited].sort();
  if (!opts.quiet) {
    console.error(`\n📋 Files that would be scanned (${sortedFiles.length}):\n`);
    sortedFiles.forEach(f => console.error(`  ${relative(projectRoot, f)}`));
  }
  process.exit(0);
}

/* --stats: show statistics ----------------------------------------------- */
if (opts.stats) {
  const sortedFiles = [...visited].sort();
  const extCounts = {};
  let totalSize = 0;

  sortedFiles.forEach(f => {
    const ext = getFileExtension(f, ALL_EXT);
    extCounts[ext] = (extCounts[ext] || 0) + 1;
    try {
      totalSize += statSync(f).size;
    } catch (e) {}
  });

  if (!opts.quiet) {
    console.error(`\n📊 Codebase Statistics:\n`);
    console.error(`  Total files: ${sortedFiles.length}`);
    console.error(`  Total size: ${(totalSize / 1024).toFixed(2)} KB\n`);
    console.error(`  Languages:`);
    Object.entries(extCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([ext, count]) => {
        console.error(`    ${ext.padEnd(15)} ${count} file${count > 1 ? 's' : ''}`);
      });
    console.error('');
  }
  process.exit(0);
}

/* build nice directory tree --------------------------------------------- */
const treeStr = opts.tree !== false ? makeTree([...visited].map(f => relative(projectRoot, f))) : '';

/* write output ----------------------------------------------------------- */
const bundledContent = bundle([...visited].sort(), projectRoot, treeStr, opts.tree !== false);

if (opts.output) {
  // Write to specified file
  writeFileSync(opts.output, bundledContent);
  if (!opts.quiet) console.error(`✅ wrote ${relative('.', opts.output)} (${visited.size} files)`);
} else {
  // Default: write to stdout
  console.log(bundledContent);
  // Success info goes to stderr so it doesn't interfere with piping
  if (!opts.quiet) console.error(`✅ processed ${visited.size} files`);
}
