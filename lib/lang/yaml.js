import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

export const name = 'yaml';
export const exts = ['.yml', '.yaml'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  
  const results = [];
  
  // Look for file references in YAML values
  // Common patterns: file paths, includes, requires
  const filePatterns = [
    // Direct file references
    /(?:^|\s)(?:file|path|include|require|template|config):\s*["']?([^"'\s\n]+\.(?:yml|yaml|rb|json|html|erb))["']?/gmi,
    // Array entries that look like file paths
    /^\s*-\s*["']?([^"'\s\n]+\.(?:yml|yaml|rb|json|html|erb))["']?$/gmi,
    // ERB template references (common in Rails)
    /<%=?\s*.*?["']([^"']+\.(?:html\.erb|erb))["'].*?%>/g,
  ];
  
  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(src)) !== null) {
      const filePath = match[1];
      if (filePath && !filePath.startsWith('http') && !filePath.startsWith('#')) {
        results.push({ type: 'file_reference', value: filePath });
      }
    }
  }
  
  // Remove duplicates
  const unique = results.filter((item, index, arr) => 
    arr.findIndex(other => other.type === item.type && other.value === item.value) === index
  );
  
  return unique;
}

export function resolve(spec, { projectRoot, file }) {
  const { type, value } = spec;
  
  if (type === 'file_reference') {
    const currentDir = dirname(file);
    
    // Try relative to current file
    const relativePath = join(currentDir, value);
    if (existsSync(relativePath)) return relativePath;
    
    // Try relative to project root
    const projectPath = join(projectRoot, value);
    if (existsSync(projectPath)) return projectPath;
    
    // Try common Rails/config directories
    const configDirs = [
      'config',
      'config/environments',
      'config/initializers',
      'app/views',
      'app/views/layouts',
      'lib'
    ];
    
    for (const dir of configDirs) {
      const configPath = join(projectRoot, dir, value);
      if (existsSync(configPath)) return configPath;
    }
  }
  
  return null;
} 