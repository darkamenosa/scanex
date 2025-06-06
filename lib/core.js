// lib/core.js
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, extname, dirname, relative } from 'node:path';
import chalk from 'chalk';

/* small coloured logger -------------------------------------------------- */
export const log = (...args) => console.log(chalk.gray('[codesnap]'), ...args);

/* async plug-in loader ---------------------------------------------------- */
export async function loadPlugins(dir) {
  const scanners = new Map(), resolvers = [], exts = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const plug = await import(join(dir, f));
    plug.exts.forEach(e => scanners.set(e, plug));
    if (plug.resolve) resolvers.push(plug);
    exts.push(...plug.exts);
    log('plugin', plug.name, 'ready');
  }
  return { scanners, resolvers, ALL_EXT: exts };
}

/* recursive walk, honouring IGNORE --------------------------------------- */
export function walk(start, IGNORE, projectRoot) {
  const files = [];
  
  function parseGitignoreInDir(dirPath) {
    const gitignorePath = join(dirPath, '.gitignore');
    if (!existsSync(gitignorePath)) return [];
    
    try {
      const content = readFileSync(gitignorePath, 'utf8');
      const patterns = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && !line.startsWith('!'));
      
      if (patterns.length > 0) {
        const relativeDir = relative(projectRoot, dirPath).replace(/\\/g, '/');
        log(`Loading ${patterns.length} patterns from ${relativeDir}/.gitignore`);
      }
      
      const relativeDir = relative(projectRoot, dirPath).replace(/\\/g, '/');
      
      return patterns.map(pattern => {
        let originalPattern = pattern;
        let isDir = pattern.endsWith('/');
        if (isDir) pattern = pattern.slice(0, -1);
        
        let rooted = pattern.startsWith('/');
        if (rooted) pattern = pattern.slice(1);
        
        // Handle wildcards BEFORE escaping other special characters
        let re = pattern;
        re = re.replace(/\*\*/g, '___DOUBLESTAR___'); // Temporarily replace **
        re = re.replace(/\*/g, '___STAR___'); // Temporarily replace *
        
        // Now escape regex special characters
        re = re.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        
        // Restore wildcards with proper regex
        re = re.replace(/___DOUBLESTAR___/g, '.*'); // ** matches anything including /
        re = re.replace(/___STAR___/g, '[^/]*'); // * matches anything except /
        
        let regexString;
        if (rooted) {
          // Pattern is relative to the .gitignore's directory
          regexString = relativeDir ? `${relativeDir}/${re}` : re;
        } else {
          // Pattern can match anywhere under the .gitignore's directory
          if (relativeDir) {
            regexString = `${relativeDir}/(.*/)?(${re})`;
          } else {
            regexString = `(.*/)?(${re})`;
          }
        }
        
        if (isDir) {
          return {
            pattern: new RegExp(`^${regexString}(/.*)?$`),
            original: originalPattern,
            dir: relativeDir
          };
        }
        return {
          pattern: new RegExp(`^${regexString}$`),
          original: originalPattern,
          dir: relativeDir
        };
      });
    } catch (e) {
      console.warn(`Warning: Could not read ${gitignorePath}: ${e.message}`);
      return [];
    }
  }
  
  function isIgnored(path, gitignorePatterns) {
    const relativePath = relative(projectRoot, path).replace(/\\/g, '/');
    
    // Check global IGNORE pattern
    if (IGNORE.test(relativePath)) return true;
    
    // Check local gitignore patterns
    for (const patternObj of gitignorePatterns) {
      if (patternObj.pattern.test(relativePath)) {
        return true;
      }
    }
    
    return false;
  }
  
  (function dive(p, parentGitignorePatterns = []) {
    let st;
    try {
      st = statSync(p);
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.error(`❌ File or directory not found: ${p}`);
        console.error(`   Please check the path and try again.`);
        return;
      } else {
        console.error(`❌ Error accessing ${p}: ${e.message}`);
        return;
      }
    }
    
    if (st.isFile()) { 
      files.push(p); 
      return; 
    }
    
    if (st.isDirectory()) {
      // Parse .gitignore in current directory
      const localPatterns = parseGitignoreInDir(p);
      const allPatterns = [...parentGitignorePatterns, ...localPatterns];
      
      try {
        for (const c of readdirSync(p)) {
          const n = join(p, c);
          
          if (!isIgnored(n, allPatterns)) {
            dive(n, allPatterns);
          }
        }
      } catch (e) {
        console.warn(`⚠️  Warning: Could not read directory ${p}: ${e.message}`);
      }
    }
  })(start);
  
  return files;
}

/* turn ["a/b.js","a/c/d.rb"] into a proper ASCII tree ------------------ */
export function makeTree(relPaths) {
  const root = { name: '.', children: new Map() };

  for (const path of relPaths) {
    const parts = path.split('/');
    let current = root;
    for (const part of parts) {
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, children: new Map() });
      }
      current = current.children.get(part);
    }
  }

  function generateTree(node, prefix = '') {
    const entries = Array.from(node.children.entries());
    let treeString = '';
    entries.forEach(([name, child], index) => {
      const isLast = index === entries.length - 1;
      const connector = isLast ? '└──' : '├──';
      treeString += `${prefix}${connector} ${name}\n`;
      if (child.children.size > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        treeString += generateTree(child, newPrefix);
      }
    });
    return treeString;
  }
  
  return `.\n${generateTree(root).trim()}`;
}

/* final Markdown bundler -------------------------------------------------- */
export function bundle(files, root, treeStr) {
  const langMap = {
    '.rb': 'ruby',
    '.html.erb': 'erb',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.jsx': 'jsx',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.json': 'json',
    '.md': 'markdown',
    '.py': 'python',
  };

  let out = '<directory_tree>\n' + treeStr + '\n</directory_tree>\n\n';
  out += '<codebase>\n\n';
  for (const f of files) {
    const rel = f.slice(root.length + 1);
    let fileExt = extname(f);
    
    // Handle composite extensions like .html.erb
    if (fileExt === '.erb' && f.endsWith('.html.erb')) {
      fileExt = '.html.erb';
    }
    
    const lang = langMap[fileExt] || fileExt.slice(1);
    out += `#### \`${rel}\`\n\`\`\`${lang}\n`;
    out += readFileSync(f, 'utf8').trimEnd() + '\n```\n\n';
  }
  out += '</codebase>\n';
  return out;
}
