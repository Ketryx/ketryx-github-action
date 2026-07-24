import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as core from '@actions/core';
import { run } from '../src/run';
import {
  cleanActionEnv,
  makeTmpDir,
  setGitHubRunEnv,
  setInput,
  setRequiredInputs,
  startTestServer,
  TestServer,
} from './helpers';

// End-to-end tests of the action's orchestration: real input parsing via
// INPUT_* env vars, real globbing over tmp files, and real HTTP uploads
// against a local server. Only core.setOutput and core.setFailed are
// stubbed — to observe results and keep setFailed from touching
// process.exitCode; everything else is real.

type UploadedArtifact = {
  filename: string;
  partContentType: string;
};

let server: TestServer;
let serverUrl: string;
let uploads: UploadedArtifact[];
let buildRequests: string[];
let buildResponse: object;
let artifactUploadStatus: number;

beforeAll(async () => {
  server = await startTestServer((req, body, res) => {
    const text = body.toString('utf8');
    if (req.url?.startsWith('/api/v1/build-artifacts')) {
      res.writeHead(artifactUploadStatus, {
        'content-type': 'application/json',
      });
      if (artifactUploadStatus !== 200) {
        res.end('{}');
        return;
      }
      uploads.push({
        filename: /filename="([^"]+)"/.exec(text)?.[1] ?? '',
        partContentType: /Content-Type: (\S+)/.exec(text)?.[1] ?? '',
      });
      res.end(JSON.stringify({ id: `file-${uploads.length}` }));
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      buildRequests.push(text);
      res.end(JSON.stringify(buildResponse));
    }
  });
  serverUrl = server.url;
});

afterAll(async () => {
  await server.close();
});

let restoreEnv: () => void;
let tmpDir: string;
let setOutput: ReturnType<typeof vi.spyOn>;
let setFailed: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  restoreEnv = cleanActionEnv();
  setRequiredInputs('proj-1', 'key-1');
  setInput('ketryx-url', serverUrl);
  setGitHubRunEnv('1');

  uploads = [];
  buildRequests = [];
  buildResponse = { ok: true, buildId: 'build-1', projectId: 'proj-1' };
  artifactUploadStatus = 200;
  tmpDir = await makeTmpDir('ketryx-run-test');

  setOutput = vi.spyOn(core, 'setOutput').mockImplementation(() => {});
  setFailed = vi.spyOn(core, 'setFailed').mockImplementation(() => {});
});

afterEach(async () => {
  restoreEnv();
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

test('fails the action and sets outputs when an upload throws', async () => {
  await fs.writeFile(path.join(tmpDir, 'junit-1.xml'), '<testsuite/>');
  setInput('test-junit-path', `${tmpDir}/junit-1.xml`);
  artifactUploadStatus = 500;

  await run();

  // A thrown failure must produce the same output contract as a
  // server-rejected build: downstream steps read outputs.ok/error.
  expect(setFailed).toHaveBeenCalledWith(expect.stringContaining('status 500'));
  expect(outputValue('ok')).toBe(false);
  expect(outputValue('error')).toEqual(expect.stringContaining('status 500'));
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
