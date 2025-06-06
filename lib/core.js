// lib/core.js
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
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
export function walk(start, IGNORE) {
  const files = [];
  (function dive(p) {
    const st = statSync(p);
    if (st.isFile()) { files.push(p); return; }
    if (st.isDirectory()) {
      for (const c of readdirSync(p)) {
        const n = join(p, c);
        if (!IGNORE.test(n)) dive(n);
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
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.jsx': 'jsx',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.json': 'json',
  };

  let out = '<directory_tree>\n' + treeStr + '\n</directory_tree>\n\n';
  out += '<codebase>\n';
  for (const f of files) {
    const rel = f.slice(root.length + 1);
    const fileExt = extname(f);
    const lang = langMap[fileExt] || fileExt.slice(1);
    out += `// ${rel}\n\`\`\`${lang}\n`;
    out += readFileSync(f, 'utf8').trimEnd() + '\n```\n\n';
  }
  out += '</codebase>\n';
  return out;
}
