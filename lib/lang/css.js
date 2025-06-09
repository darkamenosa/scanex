import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

export const name = 'css';
export const exts = ['.css', '.scss', '.sass', '.less', '.styl'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  
  const results = [];
  
  // CSS import and asset reference patterns
  const patterns = [
    // @import statements - handles various formats
    /@import\s+['"]([^'"]+)['"]/gi,
    /@import\s+url\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
    /@import\s+url\s*\(\s*([^)'"]+)\s*\)/gi,
    
    // url() functions - for fonts, images, etc.
    /url\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
    /url\s*\(\s*([^)'"]+)\s*\)/gi,
    
    // SCSS/Sass @use and @forward
    /@use\s+['"]([^'"]+)['"]/gi,
    /@forward\s+['"]([^'"]+)['"]/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(src)) !== null) {
      const filePath = match[1].trim();
      
      // Skip external URLs, data URLs, and fragments
      if (filePath && 
          !filePath.startsWith('http://') && 
          !filePath.startsWith('https://') &&
          !filePath.startsWith('data:') &&
          !filePath.startsWith('//') &&
          !filePath.startsWith('#')) {
        
        // Determine the type based on context and file extension
        let type = 'asset_reference';
        if (filePath.match(/\.(?:css|scss|sass|less|styl)$/i)) {
          type = 'stylesheet_import';
        } else if (filePath.match(/\.(?:woff|woff2|ttf|otf|eot)$/i)) {
          type = 'font';
        } else if (filePath.match(/\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
          type = 'image';
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
  
  // Don't try to resolve Ruby constants as CSS assets
  if (typeof spec === 'object' && spec.type === 'constant') {
    return null;
  }
  
  // Guard clause: ensure value exists and is a string
  if (!value || typeof value !== 'string') {
    return null;
  }
  
  const currentDir = dirname(file);
  
  // For stylesheet imports, try various extensions if none specified
  const tryExtensions = type === 'stylesheet_import' ? ['.css', '.scss', '.sass', '.less', '.styl'] : [''];
  
  // Handle absolute paths (starting with /)
  if (value.startsWith('/')) {
    for (const ext of tryExtensions) {
      const fileName = value.includes('.') ? value : `${value}${ext}`;
      const absolutePath = join(projectRoot, fileName.slice(1));
      if (existsSync(absolutePath)) return absolutePath;
      
      // Try common web root directories
      const webRoots = ['public', 'static', 'assets', 'www', 'dist', 'build', 'src'];
      for (const webRoot of webRoots) {
        const webPath = join(projectRoot, webRoot, fileName.slice(1));
        if (existsSync(webPath)) return webPath;
      }
    }
  } else {
    // Handle relative paths
    for (const ext of tryExtensions) {
      const fileName = value.includes('.') ? value : `${value}${ext}`;
      const relativePath = join(currentDir, fileName);
      if (existsSync(relativePath)) return relativePath;
      
      // Try relative to project root
      const projectPath = join(projectRoot, fileName);
      if (existsSync(projectPath)) return projectPath;
      
      // Try common asset directories
      const assetDirs = [
        'assets',
        'styles',
        'css',
        'scss',
        'sass',
        'stylesheets',
        'src/assets',
        'src/styles',
        'app/assets/stylesheets',
        'public/css',
        'static/css',
        'dist/css',
        'build/css'
      ];
      
      for (const dir of assetDirs) {
        const assetPath = join(projectRoot, dir, fileName);
        if (existsSync(assetPath)) return assetPath;
      }
    }
  }
  
  return null;
} 