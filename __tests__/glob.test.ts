import { afterAll, beforeAll, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { glob } from 'glob';

// Characterization of the glob contract that main.ts relies on:
// awaiting glob(pattern) yields the list of matching file paths.
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ketryx-glob-test-'));
  await fs.mkdir(path.join(tmpDir, 'reports'));
  await fs.writeFile(path.join(tmpDir, 'reports', 'junit-1.xml'), '<xml/>');
  await fs.writeFile(path.join(tmpDir, 'reports', 'junit-2.xml'), '<xml/>');
  await fs.writeFile(path.join(tmpDir, 'reports', 'other.txt'), 'text');
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('resolves matching file paths for a glob pattern', async () => {
  const pattern = `${tmpDir}/reports/junit-*.xml`;
  const files = await glob(pattern);
  expect(files.sort()).toEqual([
    path.join(tmpDir, 'reports', 'junit-1.xml'),
    path.join(tmpDir, 'reports', 'junit-2.xml'),
  ]);
});

test('resolves to an empty list when nothing matches', async () => {
  const files = await glob(`${tmpDir}/reports/*.json`);
  expect(files).toEqual([]);
});

test('supports recursive ** patterns', async () => {
  const files = await glob(`${tmpDir}/**/junit-1.xml`);
  expect(files).toEqual([path.join(tmpDir, 'reports', 'junit-1.xml')]);
});
