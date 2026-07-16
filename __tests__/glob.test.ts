import { afterAll, beforeAll, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from '../src/glob';
import { makeTmpDir } from './helpers';

// Characterization of the glob contract that run.ts relies on:
// awaiting glob(pattern) yields the list of matching file paths.
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await makeTmpDir('ketryx-glob-test');
  await fs.mkdir(path.join(tmpDir, 'reports'));
  await fs.writeFile(path.join(tmpDir, 'reports', 'junit-1.xml'), '<xml/>');
  await fs.writeFile(path.join(tmpDir, 'reports', 'junit-2.xml'), '<xml/>');
  await fs.writeFile(path.join(tmpDir, 'reports', 'other.txt'), 'text');
  await fs.writeFile(path.join(tmpDir, 'reports', '.hidden.xml'), '<xml/>');
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

test('supports ? and character classes', async () => {
  expect((await glob(`${tmpDir}/reports/junit-?.xml`)).sort()).toEqual([
    path.join(tmpDir, 'reports', 'junit-1.xml'),
    path.join(tmpDir, 'reports', 'junit-2.xml'),
  ]);
  expect(await glob(`${tmpDir}/reports/junit-[2-9].xml`)).toEqual([
    path.join(tmpDir, 'reports', 'junit-2.xml'),
  ]);
});

test('supports brace expansion', async () => {
  const files = await glob(`${tmpDir}/reports/{junit-1,other}.*`);
  expect(files.sort()).toEqual([
    path.join(tmpDir, 'reports', 'junit-1.xml'),
    path.join(tmpDir, 'reports', 'other.txt'),
  ]);
});

test('excludes dotfiles from wildcards but matches them explicitly', async () => {
  const wildcard = await glob(`${tmpDir}/reports/*.xml`);
  expect(wildcard.sort()).toEqual([
    path.join(tmpDir, 'reports', 'junit-1.xml'),
    path.join(tmpDir, 'reports', 'junit-2.xml'),
  ]);

  const explicit = await glob(`${tmpDir}/reports/.*.xml`);
  expect(explicit).toEqual([path.join(tmpDir, 'reports', '.hidden.xml')]);
});
