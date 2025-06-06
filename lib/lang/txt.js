export const name = 'txt';
export const exts = ['.txt'];

export function scan(src, { file }) {
  // Plain text files don't have dependencies in the same way as code files.
  // We include them for bundling, but don't scan for more files.
  return [];
} 