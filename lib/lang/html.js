import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

export const name = 'html';
export const exts = ['.html', '.htm'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  
  const results = [];
  
  // HTML file reference patterns
  const patterns = [
    // Script tags
    /<script[^>]+src=["']([^"']+)["']/gi,
    // Link tags (CSS, etc.)
    /<link[^>]+href=["']([^"']+)["']/gi,
    // Image tags
    /<img[^>]+src=["']([^"']+)["']/gi,
    // Audio/Video sources
    /<(?:audio|video)[^>]+src=["']([^"']+)["']/gi,
    /<source[^>]+src=["']([^"']+)["']/gi,
    // Iframe sources
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    // Object data
    /<object[^>]+data=["']([^"']+)["']/gi,
    // Embed sources
    /<embed[^>]+src=["']([^"']+)["']/gi,
    // Form actions
    /<form[^>]+action=["']([^"']+)["']/gi,
    // Anchor hrefs (only local files)
    /<a[^>]+href=["']([^"'#][^"']*\.(?:html|htm|php|jsp|asp))["']/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(src)) !== null) {
      const filePath = match[1];
      
      // Skip external URLs, data URLs, and fragments
      if (filePath && 
          !filePath.startsWith('http://') && 
          !filePath.startsWith('https://') &&
          !filePath.startsWith('data:') &&
          !filePath.startsWith('mailto:') &&
          !filePath.startsWith('tel:') &&
          !filePath.startsWith('//') &&
          !filePath.startsWith('#')) {
        
        // Determine the type based on file extension or context
        let type = 'file_reference';
        if (filePath.match(/\.(?:js|mjs|ts)$/i)) {
          type = 'script';
        } else if (filePath.match(/\.css$/i)) {
          type = 'stylesheet';
        } else if (filePath.match(/\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
          type = 'image';
        } else if (filePath.match(/\.(?:html|htm)$/i)) {
          type = 'html_page';
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
  
  if (['file_reference', 'script', 'stylesheet', 'image', 'html_page'].includes(type)) {
    const currentDir = dirname(file);
    
    // Handle absolute paths (starting with /)
    if (value.startsWith('/')) {
      const absolutePath = join(projectRoot, value.slice(1));
      if (existsSync(absolutePath)) return absolutePath;
      
      // Try common web root directories
      const webRoots = ['public', 'static', 'assets', 'www', 'dist', 'build'];
      for (const webRoot of webRoots) {
        const webPath = join(projectRoot, webRoot, value.slice(1));
        if (existsSync(webPath)) return webPath;
      }
    } else {
      // Handle relative paths
      const relativePath = join(currentDir, value);
      if (existsSync(relativePath)) return relativePath;
      
      // Try relative to project root
      const projectPath = join(projectRoot, value);
      if (existsSync(projectPath)) return projectPath;
      
      // Try common asset directories
      const assetDirs = [
        'public',
        'static', 
        'assets',
        'src',
        'app/assets',
        'app/assets/javascripts',
        'app/assets/stylesheets',
        'app/assets/images',
        'dist',
        'build'
      ];
      
      for (const dir of assetDirs) {
        const assetPath = join(projectRoot, dir, value);
        if (existsSync(assetPath)) return assetPath;
      }
    }
  }
  
  return null;
} 