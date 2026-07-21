import { glob as fsGlob } from 'node:fs/promises';

// Node's built-in glob shares minimatch-style semantics (**, ?, [...],
// {a,b}, dotfile exclusion) with the previously used glob package; the
// contract tests in __tests__/glob.test.ts pin this down.
export async function glob(pattern: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of fsGlob(pattern)) {
    files.push(file);
  }
  return files;
}
