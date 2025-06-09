#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { resolve, dirname, extname, join, relative, basename } from 'node:path';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlugins, walk, bundle, log, makeTree } from './core.js';

const __filename = fileURLToPath(import.meta.url);
const PKG_ROOT = dirname(dirname(__filename));

// Read package.json for version info
const packageJson = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));

class ScanexMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'scanex',
        version: packageJson.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'analyze_codebase',
            description: 'Analyze a codebase and generate a markdown bundle with dependency analysis. Discovers and includes all related files based on imports/requires.',
            inputSchema: {
              type: 'object',
              properties: {
                input: {
                  type: 'string',
                  description: 'Path to file or directory to analyze (comma-separated for multiple). Defaults to current directory if not specified.',
                  default: '.'
                },
                exclude: {
                  type: 'string',
                  description: 'Regex pattern of paths to ignore. Default: "node_modules|test|routes/index\\.js"',
                  default: 'node_modules|test|routes/index\\.js'
                },
                output: {
                  type: 'string',
                  description: 'Optional output file path. If not specified, returns the markdown content directly.'
                }
              },
              required: []
            },
          },
          {
            name: 'scan_dependencies',
            description: 'Scan a specific file for its dependencies without generating the full bundle. Returns a list of discovered dependencies.',
            inputSchema: {
              type: 'object',
              properties: {
                file: {
                  type: 'string',
                  description: 'Path to the file to scan for dependencies'
                },
                exclude: {
                  type: 'string',
                  description: 'Regex pattern of paths to ignore',
                  default: 'node_modules|test|routes/index\\.js'
                }
              },
              required: ['file']
            },
          },
          {
            name: 'generate_tree',
            description: 'Generate a directory tree visualization for specified paths',
            inputSchema: {
              type: 'object',
              properties: {
                input: {
                  type: 'string',
                  description: 'Path to directory to visualize',
                  default: '.'
                },
                exclude: {
                  type: 'string',
                  description: 'Regex pattern of paths to ignore',
                  default: 'node_modules|test|routes/index\\.js'
                }
              },
              required: []
            },
          }
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'analyze_codebase':
            return await this.analyzeCodebase(args);
          case 'scan_dependencies':
            return await this.scanDependencies(args);
          case 'generate_tree':
            return await this.generateTree(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async analyzeCodebase(args) {
    const { input = '.', exclude = 'node_modules|test|routes/index\\.js', output } = args;

    // Load plugins
    const { scanners, resolvers, ALL_EXT } = await loadPlugins(join(PKG_ROOT, 'lib/lang'));

    // Parse inputs with smart path resolution
    const INPUTS = input.split(',').map(p => {
      const trimmed = p.trim();
      
      // Strategy 1: If it's already absolute, use it
      if (trimmed.startsWith('/')) {
        if (existsSync(trimmed)) {
          return trimmed;
        }
      } else {
        // Strategy 2: Try relative to current working directory first
        const cwdRelative = resolve(process.cwd(), trimmed);
        if (existsSync(cwdRelative)) {
          return cwdRelative;
        } else {
          // Strategy 3: Try absolute resolution as fallback
          const absoluteResolved = resolve(trimmed);
          if (existsSync(absoluteResolved)) {
            return absoluteResolved;
          }
        }
      }
      
      // If nothing worked, return the cwd relative path for error reporting
      return resolve(process.cwd(), trimmed);
    });
    const IGNORE = new RegExp(exclude, 'i');

    // Validate inputs exist
    for (const inputPath of INPUTS) {
      if (!existsSync(inputPath)) {
        throw new Error(`Input path does not exist: ${inputPath}`);
      }
    }

    // Find project root
    let projectRoot = this.findProjectRoot(INPUTS[0]);

    // Load TS/JS config for path aliases
    const aliasConfig = this.loadAliasConfig(projectRoot, INPUTS[0]);

    // Helper function to get proper extension
    function getFileExtension(filepath, allExtensions) {
      const fileName = filepath.split('/').pop();
      if (fileName === 'Dockerfile' || fileName.startsWith('Dockerfile.')) {
        if (allExtensions.includes('Dockerfile')) {
          return 'Dockerfile';
        }
      }
      
      for (const ext of allExtensions) {
        if (filepath.endsWith(ext)) {
          return ext;
        }
      }
      return extname(filepath);
    }

    // Seed queue and perform BFS over imports
    const queue = [];
    for (const p of INPUTS) queue.push(...walk(p, IGNORE, projectRoot));
    
    const visited = new Set(queue.filter(f => ALL_EXT.includes(getFileExtension(f, ALL_EXT))));

    // BFS over imports
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      const scanner = scanners.get(getFileExtension(file, ALL_EXT));
      if (!scanner) continue;

      const src = readFileSync(file, 'utf8');
      for (const spec of scanner.scan(src, { file })) {
        let target = null;
        
        const specValue = typeof spec === 'string' ? spec : spec.value;

        if (specValue.startsWith('.')) {
          const base = resolve(dirname(file), specValue);
          target = ALL_EXT.map(e => base.endsWith(e) ? base : base + e)
                          .find(existsSync);
        }

        if (!target) {
          for (const r of resolvers) {
            const resolved = r.resolve?.(spec, { projectRoot, aliasConfig, configBasePath: dirname(projectRoot), file });
            if (resolved) {
              target = resolved;
              break;
            }
          }
        }

        if (target && !IGNORE.test(target) && !visited.has(target)) {
          try {
            const stat = statSync(target);
            if (stat.isFile()) {
              visited.add(target);
              queue.push(target);
            }
          } catch (e) {
            // File doesn't exist or can't be accessed
          }
        }
      }
    }

    // Build directory tree and bundle
    const treeStr = makeTree([...visited].map(f => relative(projectRoot, f)));
    const bundledContent = bundle([...visited].sort(), projectRoot, treeStr);

    // Handle output
    if (output) {
      writeFileSync(output, bundledContent);
      return {
        content: [
          {
            type: 'text',
            text: `✅ Successfully analyzed codebase and wrote ${visited.size} files to ${output}\n\nProject root: ${projectRoot}\nFiles analyzed: ${visited.size}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `✅ Successfully analyzed codebase (${visited.size} files)\n\nProject root: ${projectRoot}\n\n${bundledContent}`,
          },
        ],
      };
    }
  }

  async scanDependencies(args) {
    const { file: inputFile, exclude = 'node_modules|test|routes/index\\.js' } = args;

    // Smart path resolution - try multiple strategies
    let actualFile = null;
    
    // Strategy 1: If it's already absolute, use it
    if (inputFile.startsWith('/')) {
      if (existsSync(inputFile)) {
        actualFile = inputFile;
      }
    } else {
      // Strategy 2: Try relative to current working directory first
      const cwdRelative = resolve(process.cwd(), inputFile);
      if (existsSync(cwdRelative)) {
        actualFile = cwdRelative;
      } else {
        // Strategy 3: Try absolute resolution as fallback
        const absoluteResolved = resolve(inputFile);
        if (existsSync(absoluteResolved)) {
          actualFile = absoluteResolved;
        }
      }
    }
    
    if (!actualFile) {
      throw new Error(`File does not exist: ${inputFile}\nTried:\n- ${resolve(process.cwd(), inputFile)}\n- ${resolve(inputFile)}\nCurrent working directory: ${process.cwd()}`);
    }

    // Load plugins
    const { scanners, resolvers, ALL_EXT } = await loadPlugins(join(PKG_ROOT, 'lib/lang'));
    
    const IGNORE = new RegExp(exclude, 'i');
    const projectRoot = this.findProjectRoot(actualFile);
    const aliasConfig = this.loadAliasConfig(projectRoot, actualFile);

    function getFileExtension(filepath, allExtensions) {
      const fileName = filepath.split('/').pop();
      if (fileName === 'Dockerfile' || fileName.startsWith('Dockerfile.')) {
        if (allExtensions.includes('Dockerfile')) {
          return 'Dockerfile';
        }
      }
      
      for (const ext of allExtensions) {
        if (filepath.endsWith(ext)) {
          return ext;
        }
      }
      return extname(filepath);
    }

    const scanner = scanners.get(getFileExtension(actualFile, ALL_EXT));
    if (!scanner) {
      return {
        content: [
          {
            type: 'text',
            text: `No scanner available for file type: ${getFileExtension(actualFile, ALL_EXT)}`,
          },
        ],
      };
    }

    const src = readFileSync(actualFile, 'utf8');
    const dependencies = [];

    for (const spec of scanner.scan(src, { file: actualFile })) {
      let target = null;
      const specValue = typeof spec === 'string' ? spec : spec.value;

      if (specValue.startsWith('.')) {
        const base = resolve(dirname(actualFile), specValue);
        target = ALL_EXT.map(e => base.endsWith(e) ? base : base + e)
                        .find(existsSync);
      }

      if (!target) {
        for (const r of resolvers) {
          const resolved = r.resolve?.(spec, { projectRoot, aliasConfig, configBasePath: dirname(projectRoot), file: actualFile });
          if (resolved) {
            target = resolved;
            break;
          }
        }
      }

      dependencies.push({
        spec: specValue,
        resolved: target ? relative(projectRoot, target) : null,
        exists: target ? existsSync(target) : false
      });
    }

    // Format output for AI copy/paste
    const relativePath = relative(projectRoot, actualFile);
    const resolvedDeps = dependencies.filter(dep => dep.exists);
    const unresolvedDeps = dependencies.filter(dep => !dep.exists);
    
    let output = `# Dependency Analysis for \`${relativePath}\`\n\n`;
    output += `**Project Root:** \`${projectRoot}\`\n`;
    output += `**File Analyzed:** \`${actualFile}\`\n`;
    output += `**Total Dependencies:** ${dependencies.length}\n\n`;
    
    if (resolvedDeps.length > 0) {
      output += `## ✅ Resolved Dependencies (${resolvedDeps.length})\n\n`;
      output += '```\n';
      resolvedDeps.forEach(dep => {
        output += `${dep.spec} → ${dep.resolved}\n`;
      });
      output += '```\n\n';
      
      output += '**File List:**\n';
      resolvedDeps.forEach(dep => {
        output += `- \`${dep.resolved}\`\n`;
      });
      output += '\n';
    }
    
    if (unresolvedDeps.length > 0) {
      output += `## ❌ Unresolved Dependencies (${unresolvedDeps.length})\n\n`;
      output += '```\n';
      unresolvedDeps.forEach(dep => {
        output += `${dep.spec} → unresolved\n`;
      });
      output += '```\n\n';
    }
    
    if (dependencies.length === 0) {
      output += '## No Dependencies Found\n\nThis file does not import or require any other files.\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  async generateTree(args) {
    const { input = '.', exclude = 'node_modules|test|routes/index\\.js' } = args;

    // Smart path resolution
    let inputPath = null;
    
    // Strategy 1: If it's already absolute, use it
    if (input.startsWith('/')) {
      if (existsSync(input)) {
        inputPath = input;
      }
    } else {
      // Strategy 2: Try relative to current working directory first
      const cwdRelative = resolve(process.cwd(), input);
      if (existsSync(cwdRelative)) {
        inputPath = cwdRelative;
      } else {
        // Strategy 3: Try absolute resolution as fallback
        const absoluteResolved = resolve(input);
        if (existsSync(absoluteResolved)) {
          inputPath = absoluteResolved;
        }
      }
    }
    
    if (!inputPath) {
      throw new Error(`Path does not exist: ${input}\nTried:\n- ${resolve(process.cwd(), input)}\n- ${resolve(input)}\nCurrent working directory: ${process.cwd()}`);
    }

    const IGNORE = new RegExp(exclude, 'i');
    const projectRoot = this.findProjectRoot(inputPath);
    const files = walk(inputPath, IGNORE, projectRoot);
    const treeStr = makeTree(files.map(f => relative(projectRoot, f)));

    // Format output for AI copy/paste
    const relativePath = relative(process.cwd(), inputPath);
    const fileCount = files.length;
    
    let output = `# Directory Tree for \`${relativePath}\`\n\n`;
    output += `**Full Path:** \`${inputPath}\`\n`;
    output += `**Project Root:** \`${projectRoot}\`\n`;
    output += `**Files Found:** ${fileCount}\n`;
    output += `**Exclude Pattern:** \`${exclude}\`\n\n`;
    output += '## Tree Structure\n\n';
    output += '```\n';
    output += treeStr;
    output += '\n```\n\n';
    
    if (fileCount > 0) {
      output += '## File List\n\n';
      const sortedFiles = files.map(f => relative(projectRoot, f)).sort();
      sortedFiles.forEach(file => {
        output += `- \`${file}\`\n`;
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  findProjectRoot(startPath) {
    let projectRoot = startPath;

    if (existsSync(projectRoot) && statSync(projectRoot).isFile()) {
      projectRoot = dirname(projectRoot);
    }

    function isRepositoryRoot(dir) {
      return existsSync(join(dir, '.git'));
    }

    function isProjectRoot(dir) {
      const projectMarkers = [
        'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod',
        'pom.xml', 'build.gradle', 'composer.json', 'Gemfile', 'requirements.txt'
      ];
      return projectMarkers.some(marker => existsSync(join(dir, marker)));
    }

    let foundRepoRoot = null;
    let foundProjectRoot = null;
    let currentDir = projectRoot;

    while (currentDir !== dirname(currentDir)) {
      if (isRepositoryRoot(currentDir) && !foundRepoRoot) {
        foundRepoRoot = currentDir;
      }
      if (isProjectRoot(currentDir) && !foundProjectRoot) {
        foundProjectRoot = currentDir;
      }
      
      if (foundRepoRoot) break;
      
      const parent = dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }

    return foundRepoRoot || foundProjectRoot || projectRoot;
  }

  loadAliasConfig(projectRoot, inputFile) {
    // This is a simplified version - you may want to implement the full logic from the CLI
    const tsconfigPath = join(projectRoot, 'tsconfig.json');
    const jsconfigPath = join(projectRoot, 'jsconfig.json');

    if (existsSync(tsconfigPath)) {
      try {
        const content = readFileSync(tsconfigPath, 'utf8');
        return JSON.parse(content);
      } catch (e) {
        // Ignore parse errors
      }
    } else if (existsSync(jsconfigPath)) {
      try {
        const content = readFileSync(jsconfigPath, 'utf8');
        return JSON.parse(content);
      } catch (e) {
        // Ignore parse errors
      }
    }

    return null;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Scanex MCP server running on stdio');
    console.error(`Working directory: ${process.cwd()}`);
  }
}

// Start the server
const server = new ScanexMCPServer();
server.run().catch(console.error); 