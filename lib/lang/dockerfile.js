export const name = 'dockerfile';
export const exts = ['Dockerfile', 'Dockerfile.dev', 'Dockerfile.prod', 'Dockerfile.production', 'Dockerfile.staging', 'Dockerfile.test', '.dockerfile'];

export function scan(src, { file }) {
  // Dockerfiles don't have dependencies in the same way as code files.
  // We include them for bundling, but don't scan for more files.
  return [];
} 