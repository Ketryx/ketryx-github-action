import fs from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';
import { Agent, fetch as undiciFetch, FormData } from 'undici';
import type { ActionInput } from './input';
import { hasProperty } from './util';

export type ArtifactData = {
  id: string;
  type:
    | 'artifact'
    | 'cucumber-json'
    | 'cyclonedx-json'
    | 'junit-xml'
    | 'spdx-json';
};

export type TestArtifactData = {
  id: string;
};

export type TestData = {
  testedItem: string;
  result: 'pass' | 'fail' | 'PASS' | 'FAIL';
  title: string;
  log?: string;
  artifacts?: Array<TestArtifactData>;
};

type BuildApiInputData = {
  project: string;
  version?: string;
  commitSha?: string;
  changeRequestNumber?: number | null;
  buildName?: string;
  log?: string;
  sourceUrl?: string;
  repositoryUrls?: string[];
  syncRepositoryUpdate?: boolean;
  tests?: Array<TestData>;
  artifacts?: Array<ArtifactData>;
  checkDependenciesStatus?: boolean;
  checkChangeRequestItemAssociation?: boolean;
  checkReleaseStatus?: boolean;
};

type BuildApiResponseData = {
  ok?: boolean;
  error?: string;
  buildId?: string;
  projectId?: string;
  repositoryIds?: string[];
  versionIds?: string[];
  commitShas?: string[];
  dependenciesAccepted?: boolean | null;
  dependenciesControlled?: boolean | null;
  versionsReleased?: boolean | null;
};

function describeError(error: unknown): string {
  // Aggregated connection errors (e.g. from trying multiple addresses)
  // often carry an empty message; their parts are more informative.
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map(String).join('; ');
  }
  return String(error);
}

// Native fetch rejects with a bare "fetch failed" TypeError and hides the
// actual reason (DNS, connection, TLS, ...) in error.cause; unwrap it so
// failures surface with actionable context.
async function fetchWithContext(
  urlString: string,
  init: Parameters<typeof undiciFetch>[1],
  timeoutSeconds: number
): Promise<Response> {
  // Node's global fetch (undici) enforces a 5-minute headers/body timeout by
  // default, which large uploads legitimately exceed; an explicit dispatcher
  // is the only way to raise it (an AbortSignal can only shorten it).
  const timeoutMs = timeoutSeconds * 1000;
  const dispatcher = new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  try {
    return (await undiciFetch(urlString, { ...init, dispatcher })) as Response;
  } catch (error) {
    const cause =
      error instanceof Error && error.cause != null
        ? `: ${describeError(error.cause)}`
        : '';
    throw new Error(`Request to ${urlString} failed${cause}`, {
      cause: error,
    });
  } finally {
    // Graceful close: resolves only after the caller has consumed the
    // response body, then frees the socket — so every request gets a fresh
    // connection and no idle socket lingers to hold the process open.
    void dispatcher.close();
  }
}

async function readJsonResponse(
  urlString: string,
  response: Response
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(
      `Unexpected non-JSON response from ${urlString} (status ${response.status}): ${error}`,
      { cause: error }
    );
  }
}

// Extracts the most useful error description from a non-200 response: the
// server-reported error message if the body contains one, otherwise a
// generic status error. The body may come from an intercepting proxy or SSO
// gateway and can contain sensitive content, so the visible warning carries
// metadata only; the (truncated) body stays in opt-in debug logs.
async function readErrorMessage(
  urlString: string,
  response: Response
): Promise<string> {
  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch (readError) {
    core.debug(
      `Failed to read error response body from ${urlString}: ${readError}`
    );
  }

  let serverError: string | undefined;
  try {
    const responseData = JSON.parse(bodyText) as BuildApiResponseData;
    core.debug(
      `Received response status ${response.status}, JSON ${JSON.stringify(
        responseData
      )}`
    );
    serverError = responseData.error;
  } catch (parseError) {
    core.debug(
      `Failed to parse error response from ${urlString}: ${parseError}`
    );
  }

  if (serverError) {
    return serverError;
  }

  core.warning(
    `Ketryx returned status ${response.status} from ${urlString} without a readable ` +
      `error message (content-type ${
        response.headers.get('content-type') || 'unspecified'
      }, ${Buffer.byteLength(bodyText)} bytes). ` +
      'Enable ACTIONS_STEP_DEBUG and re-run for details.'
  );
  core.debug(
    `Error response body from ${urlString} (truncated): ${bodyText.slice(
      0,
      512
    )}`
  );
  return `Error status ${response.status}`;
}

export async function uploadBuildArtifact(
  input: Pick<
    ActionInput,
    'ketryxUrl' | 'project' | 'apiKey' | 'requestTimeoutSeconds'
  >,
  filePath: string,
  contentType: string
): Promise<string> {
  const url = new URL('/api/v1/build-artifacts', input.ketryxUrl);
  url.searchParams.set('project', input.project);
  const urlString = url.toString();
  const formData = new FormData();
  const file = await fs.openAsBlob(filePath, { type: contentType });
  formData.set('file', file, path.basename(filePath));

  core.debug(`Sending request to ${urlString}`);
  const response = await fetchWithContext(
    urlString,
    {
      method: 'post',
      body: formData,
      headers: {
        authorization: `Bearer ${input.apiKey}`,
      },
    },
    input.requestTimeoutSeconds
  );

  if (response.status !== 200) {
    throw new Error(
      `Error uploading build artifact to ${urlString}: ${await readErrorMessage(
        urlString,
        response
      )}`
    );
  }

  const responseData = await readJsonResponse(urlString, response);
  if (hasProperty(responseData, 'id') && typeof responseData.id === 'string') {
    return responseData.id;
  }

  throw new Error(`Unexpected response data from ${urlString}`);
}

function getGitHubRepositoryUrl(): string {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  return `${serverUrl}/${repository}`;
}

function getGitHubRunUrl(): string {
  // As described on https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables
  // the build URL is of the following form:
  // $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!serverUrl) {
    return '';
  }
  if (!repository || !runId) {
    // If, for whatever reason, these are not set, just use the server URL.
    return serverUrl;
  }
  return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

export async function uploadBuild(
  input: ActionInput,
  artifacts: ArtifactData[],
  tests: TestData[]
): Promise<BuildApiResponseData> {
  const sourceUrl = getGitHubRunUrl();
  const repositoryUrl = getGitHubRepositoryUrl();

  const data: BuildApiInputData = {
    project: input.project,
    version: input.version,
    buildName: input.buildName,
    commitSha: input.commitSha,
    changeRequestNumber: input.changeRequestNumber,
    log: input.log,
    artifacts,
    tests,
    sourceUrl,
    repositoryUrls: [repositoryUrl],

    // When checking for dependencies or release status, trigger a synchronous update of the repository
    // on the Ketryx side, to make sure the current commit can be found.
    syncRepositoryUpdate:
      input.checkDependenciesStatus || input.checkReleaseStatus,
    checkDependenciesStatus: input.checkDependenciesStatus,
    checkChangeRequestItemAssociation: input.checkChangeRequestItemAssociation,
    checkReleaseStatus: input.checkReleaseStatus,
  };
  const url = new URL('/api/v1/builds', input.ketryxUrl);
  const urlString = url.toString();

  core.debug(`Sending request to ${urlString}: ${JSON.stringify(data)}`);
  const response = await fetchWithContext(
    urlString,
    {
      method: 'post',
      body: JSON.stringify(data),
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
    },
    input.requestTimeoutSeconds
  );
  if (response.status !== 200) {
    return { ok: false, error: await readErrorMessage(urlString, response) };
  }
  const responseData = (await readJsonResponse(
    urlString,
    response
  )) as BuildApiResponseData;
  core.debug(`Received response ${JSON.stringify(responseData)}`);
  return responseData;
}
