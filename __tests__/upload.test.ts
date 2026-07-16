import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { uploadBuild, uploadBuildArtifact } from '../src/upload';
import type { ActionInput } from '../src/input';

type RecordedRequest = {
  method: string | undefined;
  url: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
};

type StubbedResponse = {
  status: number;
  contentType?: string;
  body: string;
};

// Characterization tests against a real HTTP server, so that they hold
// regardless of the underlying fetch implementation.
let server: http.Server;
let serverUrl: string;
let requests: RecordedRequest[];
let nextResponse: StubbedResponse;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(nextResponse.status, {
        'content-type': nextResponse.contentType ?? 'application/json',
      });
      res.end(nextResponse.body);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  serverUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  requests = [];
  nextResponse = { status: 200, body: '{}' };
});

function baseInput(): ActionInput {
  return {
    ketryxUrl: serverUrl,
    apiKey: 'test-api-key',
    project: 'test-project',
    artifactPath: [],
    testCucumberPath: [],
    testJunitPath: [],
    tests: [],
    cycloneDxJsonPath: [],
    spdxJsonPath: [],
    checkDependenciesStatus: false,
    checkChangeRequestItemAssociation: false,
    checkReleaseStatus: false,
  };
}

describe('uploadBuildArtifact', () => {
  let tmpDir: string;
  let filePath: string;
  const fileContent = 'test artifact content';

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ketryx-test-'));
    filePath = path.join(tmpDir, 'artifact.json');
    await fs.writeFile(filePath, fileContent);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('posts the file as multipart form data and returns the file ID', async () => {
    nextResponse = { status: 200, body: JSON.stringify({ id: 'file-123' }) };

    const id = await uploadBuildArtifact(
      baseInput(),
      filePath,
      'application/json'
    );

    expect(id).toBe('file-123');
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/api/v1/build-artifacts?project=test-project');
    expect(request.headers.authorization).toBe('Bearer test-api-key');
    expect(request.headers['content-type']).toMatch(/^multipart\/form-data/);
    expect(request.body).toContain('filename="artifact.json"');
    expect(request.body).toContain('Content-Type: application/json');
    expect(request.body).toContain(fileContent);
  });

  test('throws on a non-200 response status', async () => {
    nextResponse = { status: 403, body: '{}' };

    await expect(
      uploadBuildArtifact(baseInput(), filePath, 'application/json')
    ).rejects.toThrow('status 403');
  });

  test('throws if the response contains no file ID', async () => {
    nextResponse = { status: 200, body: JSON.stringify({ unexpected: true }) };

    await expect(
      uploadBuildArtifact(baseInput(), filePath, 'application/json')
    ).rejects.toThrow('Unexpected response data');
  });

  test('reports URL and status when a 200 response is not JSON', async () => {
    nextResponse = { status: 200, body: '<html>SSO login</html>' };

    await expect(
      uploadBuildArtifact(baseInput(), filePath, 'application/json')
    ).rejects.toThrow(/\/api\/v1\/build-artifacts\?project=test-project.*200/);
  });
});

describe('uploadBuild', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    process.env.GITHUB_SERVER_URL = 'https://github.com';
    process.env.GITHUB_REPOSITORY = 'ketryx/example';
    process.env.GITHUB_RUN_ID = '12345';
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  test('posts build data as JSON and returns the response data', async () => {
    nextResponse = {
      status: 200,
      body: JSON.stringify({ ok: true, buildId: 'build-1', projectId: 'p-1' }),
    };

    const input: ActionInput = {
      ...baseInput(),
      version: 'v1.0',
      buildName: 'build-a',
      log: 'log output',
    };
    const result = await uploadBuild(
      input,
      [{ id: 'file-123', type: 'junit-xml' }],
      [{ testedItem: 'SAMD-42', result: 'pass', title: 'Test A' }]
    );

    expect(result).toEqual({ ok: true, buildId: 'build-1', projectId: 'p-1' });
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/api/v1/builds');
    expect(request.headers.authorization).toBe('Bearer test-api-key');
    expect(request.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request.body)).toMatchObject({
      project: 'test-project',
      version: 'v1.0',
      buildName: 'build-a',
      log: 'log output',
      artifacts: [{ id: 'file-123', type: 'junit-xml' }],
      tests: [{ testedItem: 'SAMD-42', result: 'pass', title: 'Test A' }],
      sourceUrl: 'https://github.com/ketryx/example/actions/runs/12345',
      repositoryUrls: ['https://github.com/ketryx/example'],
      syncRepositoryUpdate: false,
    });
  });

  test('requests a synchronous repository update when checking statuses', async () => {
    nextResponse = { status: 200, body: JSON.stringify({ ok: true }) };

    const input: ActionInput = { ...baseInput(), checkReleaseStatus: true };
    await uploadBuild(input, [], []);

    expect(JSON.parse(requests[0].body)).toMatchObject({
      syncRepositoryUpdate: true,
      checkReleaseStatus: true,
    });
  });

  test('returns the server-reported error on a JSON error response', async () => {
    nextResponse = {
      status: 400,
      body: JSON.stringify({ ok: false, error: 'Version not found' }),
    };

    const result = await uploadBuild(baseInput(), [], []);

    expect(result).toEqual({ ok: false, error: 'Version not found' });
  });

  test('returns a generic error on a non-JSON error response', async () => {
    nextResponse = {
      status: 500,
      contentType: 'text/plain',
      body: 'Internal Server Error',
    };

    const result = await uploadBuild(baseInput(), [], []);

    expect(result).toEqual({ ok: false, error: 'Error status 500' });
  });

  test('reports URL and status when a 200 response is not JSON', async () => {
    nextResponse = { status: 200, body: '<html>SSO login</html>' };

    await expect(uploadBuild(baseInput(), [], [])).rejects.toThrow(
      /\/api\/v1\/builds.*200/
    );
  });

  test('degrades to the generic error when a JSON error response is malformed', async () => {
    nextResponse = { status: 400, body: '<html>not json after all</html>' };

    const result = await uploadBuild(baseInput(), [], []);

    expect(result).toEqual({ ok: false, error: 'Error status 400' });
  });

  test('reports the URL and cause when the server is unreachable', async () => {
    // Grab a port that is guaranteed to be closed.
    const probe = http.createServer();
    await new Promise<void>((resolve) => {
      probe.listen(0, '127.0.0.1', resolve);
    });
    const closedPort = (probe.address() as AddressInfo).port;
    await new Promise((resolve) => probe.close(resolve));

    const input: ActionInput = {
      ...baseInput(),
      ketryxUrl: `http://127.0.0.1:${closedPort}`,
    };

    // Native fetch fails with a bare "fetch failed" TypeError; the error
    // surfaced to the user must carry the URL and the underlying cause.
    await expect(uploadBuild(input, [], [])).rejects.toThrow(
      new RegExp(`http://127\\.0\\.0\\.1:${closedPort}/api/v1/builds`)
    );
    await expect(uploadBuild(input, [], [])).rejects.toThrow(/ECONNREFUSED/);
  });
});
