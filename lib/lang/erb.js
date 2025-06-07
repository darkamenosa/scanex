import Parser from 'tree-sitter';
import Ruby from 'tree-sitter-ruby';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const parser = new Parser();
parser.setLanguage(Ruby);

// Query for Ruby code within ERB templates
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
  'lib'
];

export const name = 'erb';
export const exts = ['.html.erb'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  
  // Extract Ruby code from ERB tags
  const rubyCodeBlocks = [];
  const erbRegex = /<%[-=]?\s*(.*?)\s*[-]?%>/gs;
  let match;
  
  while ((match = erbRegex.exec(src)) !== null) {
    const rubyCode = match[1].trim();
    if (rubyCode) {
      rubyCodeBlocks.push(rubyCode);
    }
  }
  
  // If no Ruby code found, return empty array
  if (rubyCodeBlocks.length === 0) return [];
  
  // Parse each Ruby code block
  const results = [];
  
  for (const rubyCode of rubyCodeBlocks) {
    try {
      const tree = parser.parse(rubyCode);
      const matches = QUERY.matches(tree.rootNode);
      
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
                } else if (method === 'render') {
                  results.push({ type: 'render', value: capture.node.text });
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
    } catch (e) {
      // Silently ignore parsing errors for individual Ruby blocks
      // ERB templates often have incomplete Ruby statements
      continue;
    }
  }
  
  // Remove duplicates
  const unique = results.filter((item, index, arr) => 
    arr.findIndex(other => other.type === item.type && other.value === item.value) === index
  );
  
  return unique;
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
  // Only handle specs that came from ERB files
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
    // Only resolve constants from ERB files
    if (file.endsWith('.html.erb')) {
      return resolveConstant(value, projectRoot);
    }
  } else if (type === 'render') {
    return resolveRender(value, projectRoot, file);
  }
  
  return null;
}

function resolveRender(renderPath, projectRoot, currentFile) {
  // Rails render path resolution
  const viewsDir = join(projectRoot, 'app', 'views');
  
  // Handle absolute paths like "layouts/application"
  if (renderPath.includes('/')) {
    const templatePath = `${renderPath}.html.erb`;
    const fullPath = join(viewsDir, templatePath);
    if (existsSync(fullPath)) return fullPath;
    
    // Try as partial (with underscore)
    const pathParts = renderPath.split('/');
    const fileName = pathParts.pop();
    const dir = pathParts.join('/');
    const partialPath = join(viewsDir, dir, `_${fileName}.html.erb`);
    if (existsSync(partialPath)) return partialPath;
  } else {
    // Handle relative paths - look in the same directory as current file
    const currentDir = dirname(currentFile);
    
    // First try in the same directory as current file
    const relativePath = join(currentDir, `${renderPath}.html.erb`);
    if (existsSync(relativePath)) return relativePath;
    
    // Try as partial in same directory
    const relativePartialPath = join(currentDir, `_${renderPath}.html.erb`);
    if (existsSync(relativePartialPath)) return relativePartialPath;
    
    // Extract the view directory from current file path
    // e.g., /app/views/messages/show.html.erb -> messages
    const fileRelative = currentFile.replace(viewsDir + '/', '');
    const viewDir = dirname(fileRelative);
    
    if (viewDir && viewDir !== '.') {
      // Try in the inferred view directory
      const viewDirPath = join(viewsDir, viewDir, `${renderPath}.html.erb`);
      if (existsSync(viewDirPath)) return viewDirPath;
      
      // Try as partial in view directory
      const viewDirPartialPath = join(viewsDir, viewDir, `_${renderPath}.html.erb`);
      if (existsSync(viewDirPartialPath)) return viewDirPartialPath;
    }
  }
  
  return null;
} 