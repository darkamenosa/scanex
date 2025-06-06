import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

export const name = 'shell';
export const exts = ['.sh', '.bash', '.zsh', '.fish', '.ksh', '.csh'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  
  const results = [];
  
  // Shell script file reference patterns
  const patterns = [
    // Source commands: source file.sh, . file.sh
    /(?:^|\s)(?:source|\.)[\s]+([^\s#]+\.(?:sh|bash|zsh|fish|ksh|csh|env|conf|config))/gm,
    
    // Script execution: ./script.sh, bash script.sh, sh script.sh
    /(?:^|\s)(?:bash|sh|zsh|fish|ksh|csh|\.)[\s]+([^\s#]+\.(?:sh|bash|zsh|fish|ksh|csh))/gm,
    
    // Direct script execution: ./path/to/script.sh
    /(?:^|\s)\.\/([^\s#]+\.(?:sh|bash|zsh|fish|ksh|csh))/gm,
    
    // Configuration files often sourced
    /(?:^|\s)(?:source|\.)[\s]+([^\s#]+\.(?:env|conf|config|rc))/gm,
    
    // File operations with specific extensions that might be scripts or configs
    /(?:cat|grep|awk|sed|head|tail|less|more|vim|nano|emacs)[\s]+([^\s#]+\.(?:sh|env|conf|config|txt|log|md))/gm,
    
    // Files in quotes or double quotes
    /(?:source|\.|bash|sh|zsh|fish|cat|grep)[\s]+["']([^"'#]+\.(?:sh|bash|zsh|fish|ksh|csh|env|conf|config|txt))["']/gm,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(src)) !== null) {
      const filePath = match[1];
      
      // Skip if it looks like a variable or command substitution
      if (filePath && 
          !filePath.startsWith('$') && 
          !filePath.includes('$') &&
          !filePath.startsWith('/dev/') &&
          !filePath.startsWith('/proc/') &&
          !filePath.startsWith('/sys/')) {
        
        // Determine the type based on file extension
        let type = 'file_reference';
        if (filePath.match(/\.(?:sh|bash|zsh|fish|ksh|csh)$/i)) {
          type = 'script';
        } else if (filePath.match(/\.(?:env|conf|config|rc)$/i)) {
          type = 'config';
        }
        
        results.push({ type, value: filePath });
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
  
  if (['file_reference', 'script', 'config'].includes(type)) {
    const currentDir = dirname(file);
    
    // Handle relative paths (most common in shell scripts)
    if (value.startsWith('./') || value.startsWith('../')) {
      const relativePath = join(currentDir, value);
      if (existsSync(relativePath)) return relativePath;
    } else if (value.startsWith('/')) {
      // Absolute paths - check if they're within project
      if (value.startsWith(projectRoot) && existsSync(value)) {
        return value;
      }
    } else {
      // Relative to current directory
      const relativePath = join(currentDir, value);
      if (existsSync(relativePath)) return relativePath;
      
      // Try relative to project root
      const projectPath = join(projectRoot, value);
      if (existsSync(projectPath)) return projectPath;
      
      // Try common script directories
      const scriptDirs = [
        'bin',
        'scripts',
        'tools',
        'config',
        'etc',
        '.env',
        'deploy',
        'ci',
        '.github/workflows',
        '.gitlab-ci',
        'docker'
      ];
      
      for (const dir of scriptDirs) {
        const scriptPath = join(projectRoot, dir, value);
        if (existsSync(scriptPath)) return scriptPath;
      }
    }
  }
  
  return null;
} 