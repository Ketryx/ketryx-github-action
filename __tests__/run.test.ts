import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import * as core from '@actions/core';
import { run } from '../src/run';

// End-to-end tests of the action's orchestration: real input parsing via
// INPUT_* env vars, real globbing over tmp files, and real HTTP uploads
// against a local server. Only core outputs are spied on for observation.

type UploadedArtifact = {
  filename: string;
  partContentType: string;
};

let server: http.Server;
let serverUrl: string;
let uploads: UploadedArtifact[];
let buildRequests: string[];
let buildResponse: object;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url?.startsWith('/api/v1/build-artifacts')) {
        uploads.push({
          filename: /filename="([^"]+)"/.exec(body)?.[1] ?? '',
          partContentType: /Content-Type: (\S+)/.exec(body)?.[1] ?? '',
        });
        res.end(JSON.stringify({ id: `file-${uploads.length}` }));
      } else {
        buildRequests.push(body);
        res.end(JSON.stringify(buildResponse));
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function setInput(name: string, value: string): void {
  process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] = value;
}

let savedEnv: NodeJS.ProcessEnv;
let tmpDir: string;
let setOutput: ReturnType<typeof vi.spyOn>;
let setFailed: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  savedEnv = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (/^(INPUT_|GITHUB_)/.test(key)) {
      delete process.env[key];
    }
  }
  setInput('ketryx-url', serverUrl);
  setInput('project', 'proj-1');
  setInput('api-key', 'key-1');
  setInput('check-dependencies-status', 'false');
  setInput('check-item-association', 'false');
  setInput('check-release-status', 'false');
  process.env.GITHUB_SERVER_URL = 'https://github.com';
  process.env.GITHUB_REPOSITORY = 'ketryx/example';
  process.env.GITHUB_RUN_ID = '1';

  uploads = [];
  buildRequests = [];
  buildResponse = { ok: true, buildId: 'build-1', projectId: 'proj-1' };
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ketryx-run-test-'));

  setOutput = vi.spyOn(core, 'setOutput').mockImplementation(() => {});
  setFailed = vi.spyOn(core, 'setFailed').mockImplementation(() => {});
});

afterEach(async () => {
  process.env = savedEnv;
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function outputValue(name: string): unknown {
  const call = setOutput.mock.calls.findLast(([key]) => key === name);
  return call?.[1];
}

test('uploads artifacts with per-type content types and reports the build', async () => {
  await fs.writeFile(path.join(tmpDir, 'junit-1.xml'), '<testsuite/>');
  await fs.writeFile(path.join(tmpDir, 'junit-2.xml'), '<testsuite/>');
  await fs.writeFile(path.join(tmpDir, 'cucumber.json'), '[]');
  await fs.writeFile(path.join(tmpDir, 'test.log'), 'log line');
  setInput('test-junit-path', `${tmpDir}/junit-*.xml`);
  setInput('test-cucumber-path', `${tmpDir}/cucumber.json`);
  setInput(
    'tests',
    [
      '- testedItem: SAMD-42',
      '  result: pass',
      '  title: Test A',
      '  artifactPaths:',
      `    - ${tmpDir}/test.log`,
    ].join('\n')
  );

  await run();

  expect(setFailed).not.toHaveBeenCalled();

  // 2 junit + 1 cucumber + 1 test artifact, with correct content types.
  expect(uploads).toHaveLength(4);
  const byName = new Map(uploads.map((u) => [u.filename, u.partContentType]));
  expect(byName.get('junit-1.xml')).toBe('application/xml');
  expect(byName.get('junit-2.xml')).toBe('application/xml');
  expect(byName.get('cucumber.json')).toBe('application/json');
  expect(byName.get('test.log')).toBe('application/octet-stream');

  expect(buildRequests).toHaveLength(1);
  const build = JSON.parse(buildRequests[0]);
  expect(build.artifacts.map((a: { type: string }) => a.type).sort()).toEqual([
    'cucumber-json',
    'junit-xml',
    'junit-xml',
  ]);
  expect(build.tests).toHaveLength(1);
  expect(build.tests[0]).toMatchObject({
    testedItem: 'SAMD-42',
    result: 'pass',
    title: 'Test A',
  });
  expect(build.tests[0].artifacts).toHaveLength(1);

  // Every artifact id in the build payload refers to an uploaded file.
  const uploadedIds = uploads.map((_, i) => `file-${i + 1}`);
  for (const artifact of [...build.artifacts, ...build.tests[0].artifacts]) {
    expect(uploadedIds).toContain(artifact.id);
  }

  expect(outputValue('ok')).toBe(true);
  expect(outputValue('build-id')).toBe('build-1');
  expect(outputValue('build-url')).toBe(
    `${serverUrl}/projects/proj-1/builds/build-1`
  );
});

test('uploads a file only once when patterns overlap', async () => {
  await fs.writeFile(path.join(tmpDir, 'junit-1.xml'), '<testsuite/>');
  setInput(
    'test-junit-path',
    [`${tmpDir}/junit-1.xml`, `${tmpDir}/junit-*.xml`].join('\n')
  );

  await run();

  expect(setFailed).not.toHaveBeenCalled();
  // One physical upload, but both pattern matches appear as artifacts
  // referencing the same file id.
  expect(uploads).toHaveLength(1);
  const build = JSON.parse(buildRequests[0]);
  expect(build.artifacts).toEqual([
    { id: 'file-1', type: 'junit-xml' },
    { id: 'file-1', type: 'junit-xml' },
  ]);
});

test('fails the action and sets outputs when the server rejects the build', async () => {
  buildResponse = { ok: false, error: 'Version not released' };

  await run();

  expect(setFailed).toHaveBeenCalledWith(
    'Failure reporting build to Ketryx: Version not released'
  );
  expect(outputValue('ok')).toBe(false);
  expect(outputValue('error')).toBe('Version not released');
});
