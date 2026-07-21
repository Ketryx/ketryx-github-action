import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// @actions/core reads inputs from environment variables of the form
// INPUT_<NAME>, with spaces replaced by underscores and uppercased.
export function setInput(name: string, value: string): void {
  process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] = value;
}

// Snapshots process.env and removes all action-related variables, so tests
// start from a clean slate regardless of the real CI environment. Returns
// the restore function for afterEach.
export function cleanActionEnv(): () => void {
  const savedEnv = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (/^(INPUT_|GITHUB_)/.test(key)) {
      delete process.env[key];
    }
  }
  return () => {
    process.env = savedEnv;
  };
}

// project/api-key are required; the check-* booleans replicate action.yml
// defaults, which only the GitHub runner injects into INPUT_* env vars
// (getBooleanInput throws on an unset input).
export function setRequiredInputs(
  project = 'test-project',
  apiKey = 'test-api-key'
): void {
  setInput('project', project);
  setInput('api-key', apiKey);
  setInput('check-dependencies-status', 'false');
  setInput('check-item-association', 'false');
  setInput('check-release-status', 'false');
}

export type TestServer = {
  url: string;
  close: () => Promise<void>;
};

// Starts a local HTTP server that buffers each request body and hands it to
// the given handler.
export async function startTestServer(
  handle: (
    req: http.IncomingMessage,
    body: Buffer,
    res: http.ServerResponse
  ) => void
): Promise<TestServer> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => handle(req, Buffer.concat(chunks), res));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export async function makeTmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}
