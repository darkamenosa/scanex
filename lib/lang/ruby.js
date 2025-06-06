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
  'lib'
];

export const name = 'ruby';
export const exts = ['.rb'];

export function scan(src, { file }) {
  if (!src || src.trim() === '') return [];
  
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
  return null;
}

export function resolve(spec, { projectRoot, file }) {
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
    return resolveConstant(value, projectRoot);
  }
  
  return null;
}
