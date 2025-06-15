import Parser from 'tree-sitter';
import Ruby from 'tree-sitter-ruby';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const parser = new Parser();
parser.setLanguage(Ruby);

// Start with a basic, working query
const QUERY = new Parser.Query(Ruby, `
  (call
    method: (identifier) @method
    arguments: (argument_list 
      (string 
        (string_content) @path)))
  
  (constant) @const
`);

const IGNORED_CONSTANTS = new Set([
  'ApplicationController', 'ActionController::Base', 'ApplicationRecord',
  'ActiveRecord::Base', 'ActiveRecord::RecordInvalid', 'ActiveStorage::Blob',
  'ActiveSupport::TimeZone', 'Pagy::Backend', 'Current', 'self', 'true',
  'false', 'nil', 'Rails', 'ENV'
]);

const SEARCH_DIRS = [
  'app/models', 'app/controllers', 'app/helpers', 'app/jobs', 'app/mailers',
  'app/services', 'app/workers', 'app/channels', 'app/policies',
  'app/controllers/concerns', 'app/models/concerns',
  'lib',
  'test',
  'test/models',
  'test/controllers',
  'test/helpers',
  'test/jobs',
  'test/mailers',
  'test/services',
  'test/workers',
  'test/channels',
  'test/policies',
];

// Query for parsing Gemfile syntax
const GEMFILE_QUERY = new Parser.Query(Ruby, `
  (call
    method: (identifier) @method
    arguments: (argument_list 
      (string 
        (string_content) @gem_name)))
`);

function scanGemfile(src, file) {
  const results = [];
  
  // For Gemfile.lock, extract gem names
  if (file.endsWith('Gemfile.lock')) {
    const lines = src.split('\n');
    let inGemSection = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === 'GEM') {
        inGemSection = true;
        continue;
      }
      if (trimmed === 'PLATFORMS' || trimmed === 'DEPENDENCIES' || trimmed === 'BUNDLED WITH') {
        inGemSection = false;
        continue;
      }
      
      if (inGemSection && trimmed && !trimmed.startsWith('remote:') && !trimmed.startsWith('specs:')) {
        // Extract gem name from lines like "    rails (7.0.4)"
        const match = trimmed.match(/^([a-z0-9_-]+)\s*\(/i);
        if (match) {
          results.push({ type: 'gem', value: match[1] });
        }
      }
    }
    
    return results;
  }
  
  // For Gemfile and .gemspec files, use tree-sitter
  try {
    const tree = parser.parse(src);
    const matches = GEMFILE_QUERY.matches(tree.rootNode);
    
    for (const match of matches) {
      let method = null;
      let gemName = null;
      
      for (const capture of match.captures) {
        if (capture.name === 'method') {
          method = capture.node.text;
        } else if (capture.name === 'gem_name') {
          gemName = capture.node.text;
        }
      }
      
      // Only track 'gem' method calls
      if (method === 'gem' && gemName) {
        results.push({ type: 'gem', value: gemName });
      }
    }
    
    // Remove duplicates
    const unique = results.filter((item, index, arr) => 
      arr.findIndex(other => other.type === item.type && other.value === item.value) === index
    );
    
    return unique;
  } catch (e) {
    console.error(`Error parsing ${file} with tree-sitter: ${e.message}`);
    return [];
  }
}

export const name = 'ruby';
export const exts = ['.rb', 'Gemfile', '.gemspec', 'Gemfile.lock'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  
  // Handle Gemfile and .gemspec files
  if (file.endsWith('Gemfile') || file.endsWith('.gemspec') || file.endsWith('Gemfile.lock')) {
    return scanGemfile(src, file);
  }
  
  // Handle regular Ruby files
  try {
    const tree = parser.parse(src);
    const matches = QUERY.matches(tree.rootNode);
    const results = [];
    
    for (const match of matches) {
      for (const capture of match.captures) {
        if (capture.name === 'path') {
          // Find the method name for this capture
          let methodNode = capture.node;
          while (methodNode && methodNode.type !== 'call') {
            methodNode = methodNode.parent;
          }
          
          if (methodNode) {
            let methodIdentifier = null;
            for (const child of methodNode.children) {
              if (child.type === 'identifier') {
                methodIdentifier = child;
                break;
              }
            }

            if (methodIdentifier) {
              const method = methodIdentifier.text;
              if (method === 'require' || method === 'require_relative') {
                const type = method === 'require' ? 'require' : 'require_relative';
                results.push({ type, value: capture.node.text });
              }
            }
          }
        } else if (capture.name === 'const') {
          const value = capture.node.text;
          const rootConst = value.split('::')[0];
          
          if (!IGNORED_CONSTANTS.has(value) && !IGNORED_CONSTANTS.has(rootConst)) {
            results.push({ type: 'constant', value });
          }
        }
      }
    }
    
    // Remove duplicates
    const unique = results.filter((item, index, arr) => 
      arr.findIndex(other => other.type === item.type && other.value === item.value) === index
    );
    
    return unique;
  } catch (e) {
    console.error(`Error parsing ${file} with tree-sitter: ${e.message}`);
    return [];
  }
}

function underscore(str) {
  return str
    .replace(/::/g, '/')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function resolveConstant(value, projectRoot) {
  const filePath = underscore(value) + '.rb';
  for (const dir of SEARCH_DIRS) {
    const fullPath = join(projectRoot, dir, filePath);
    if (existsSync(fullPath)) return fullPath;
  }
  
  // Handle plural constants that might map to singular files
  // e.g., "Rooms" -> "room.rb" instead of "rooms.rb"
  if (value.endsWith('s')) {
    const singularValue = value.slice(0, -1);
    const singularFilePath = underscore(singularValue) + '.rb';
    for (const dir of SEARCH_DIRS) {
      const fullPath = join(projectRoot, dir, singularFilePath);
      if (existsSync(fullPath)) return fullPath;
    }
  }
  
  return null;
}

export function resolve(spec, { projectRoot, file }) {
  // Only handle specs that came from Ruby files or ERB files
  if (typeof spec !== 'object' || !spec.type || !spec.value) {
    return null;
  }
  
  const { type, value } = spec;

  if (type === 'require_relative') {
    const path = value.endsWith('.rb') ? value : `${value}.rb`;
    const fullPath = join(dirname(file), path);
    if (existsSync(fullPath)) return fullPath;
  } else if (type === 'require') {
    const path = value.endsWith('.rb') ? value : `${value}.rb`;
    const fullPath = join(projectRoot, 'lib', path);
    if (existsSync(fullPath)) return fullPath;
  } else if (type === 'constant') {
    // Only resolve constants from Ruby and ERB files
    const fileExt = file.split('.').pop();
    if (fileExt === 'rb' || file.endsWith('.html.erb')) {
      return resolveConstant(value, projectRoot);
    }
  } else if (type === 'gem') {
    // For gem dependencies, try to find corresponding files in the project
    // Convert gem name to potential file paths
    const possiblePaths = [
      join(projectRoot, 'lib', `${value}.rb`),
      join(projectRoot, 'lib', value, 'init.rb'),
      join(projectRoot, 'lib', value, `${value}.rb`),
      // For Rails-specific gems, check app directories
      join(projectRoot, 'app', 'models', `${value}.rb`),
      join(projectRoot, 'app', 'controllers', `${value}_controller.rb`),
      join(projectRoot, 'app', 'helpers', `${value}_helper.rb`),
    ];
    
    for (const path of possiblePaths) {
      if (existsSync(path)) return path;
    }
    
    // If gem name has hyphens, try underscore version
    if (value.includes('-')) {
      const underscored = value.replace(/-/g, '_');
      const morePaths = [
        join(projectRoot, 'lib', `${underscored}.rb`),
        join(projectRoot, 'lib', underscored, 'init.rb'),
        join(projectRoot, 'lib', underscored, `${underscored}.rb`),
      ];
      
      for (const path of morePaths) {
        if (existsSync(path)) return path;
      }
    }
  }
  
  return null;
}
