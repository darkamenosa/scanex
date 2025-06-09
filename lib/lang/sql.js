import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

export const name = 'sql';
export const exts = ['.sql', '.ddl', '.dml', '.pgsql', '.mysql', '.sqlite', '.psql'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  
  const results = [];
  
  // SQL include/import patterns for different database systems
  const patterns = [
    // PostgreSQL \i and \include
    /\\i\s+(['"]?)([^'";\s]+)\1/gi,
    /\\include\s+(['"]?)([^'";\s]+)\1/gi,
    
    // MySQL SOURCE command
    /(?:^|\s)SOURCE\s+(['"]?)([^'";\s]+)\1/gi,
    
    // SQLite .read command  
    /\.read\s+(['"]?)([^'";\s]+)\1/gi,
    
    // Generic SQL comments with file references (often used for documentation)
    /--\s*@?(?:include|import|source|file):\s*([^\s;]+)/gi,
    /\/\*\s*@?(?:include|import|source|file):\s*([^\s*]+)\s*\*\//gi,
    
    // EXEC or EXECUTE with file paths (SQL Server)
    /EXEC(?:UTE)?\s+(?:xp_cmdshell\s+)?['"]?(?:sqlcmd|osql).*?-i\s+(['"]?)([^'";\s]+)\1/gi,
    
    // Oracle @@ and @ for script execution
    /@@?\s*(['"]?)([^'";\s]+)\1/gi,
    
    // Generic file references in strings (migration files, etc.)
    /(?:file|path|script)\s*[:=]\s*['"]([^'"]+\.sql)['"]/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(src)) !== null) {
      // Get the file path from the appropriate capture group
      const filePath = match[2] || match[1];
      
      if (filePath && 
          !filePath.startsWith('http://') && 
          !filePath.startsWith('https://') &&
          !filePath.startsWith('//')) {
        
        // Determine the type based on file extension
        let type = 'sql_include';
        if (filePath.match(/\.(?:ddl)$/i)) {
          type = 'ddl_script';
        } else if (filePath.match(/\.(?:dml)$/i)) {
          type = 'dml_script';
        } else if (filePath.match(/migration|seed|fixture/i)) {
          type = 'migration_script';
        }
        
        results.push({ type, value: filePath.trim() });
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
  
  // Guard clause: ensure value exists and is a string
  if (!value || typeof value !== 'string') {
    return null;
  }
  
  const currentDir = dirname(file);
  
  // For SQL includes, try various extensions if none specified
  const tryExtensions = ['.sql', '.ddl', '.dml', '.pgsql', '.mysql', '.sqlite', '.psql'];
  const extensions = value.includes('.') ? [''] : tryExtensions;
  
  // Handle absolute paths (starting with /)
  if (value.startsWith('/')) {
    for (const ext of extensions) {
      const fileName = `${value}${ext}`;
      const absolutePath = join(projectRoot, fileName.slice(1));
      if (existsSync(absolutePath)) return absolutePath;
    }
  } else {
    // Handle relative paths
    for (const ext of extensions) {
      const fileName = `${value}${ext}`;
      
      // Try relative to current file
      const relativePath = join(currentDir, fileName);
      if (existsSync(relativePath)) return relativePath;
      
      // Try relative to project root
      const projectPath = join(projectRoot, fileName);
      if (existsSync(projectPath)) return projectPath;
      
      // Try common SQL directories
      const sqlDirs = [
        'sql',
        'database',
        'db',
        'migrations',
        'scripts',
        'schema',
        'queries',
        'procedures',
        'functions',
        'views',
        'triggers',
        'seeds',
        'fixtures',
        'data',
        'sql/migrations',
        'db/migrate',
        'db/seeds',
        'database/migrations',
        'database/seeds',
        'src/sql',
        'src/database',
        'resources/sql',
        'assets/sql'
      ];
      
      for (const dir of sqlDirs) {
        const sqlPath = join(projectRoot, dir, fileName);
        if (existsSync(sqlPath)) return sqlPath;
      }
    }
  }
  
  return null;
} 