import fetch, { fileFrom, FormData } from 'node-fetch';
import path from 'node:path';
import * as core from '@actions/core';
import type { ActionInput } from './input';
import { hasProperty } from './util';

export type ArtifactData = {
  id: string;
  type: 'artifact' | 'cucumber-json' | 'junit-xml' | 'spdx-json';
};

type BuildApiInputData = {
  project: string;
  version?: string;
  commitSha?: string;
  buildName?: string;
  log?: string;
  sourceUrl?: string;
  repositoryUrls?: string[];
  syncRepositoryUpdate?: boolean;
  tests?: Array<{
    testedItem: string;
    result: 'PASS' | 'FAIL';
    title: string;
    log?: string;
  }>;
  artifacts?: Array<ArtifactData>;
  checkDependenciesStatus?: boolean;
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

export async function uploadBuildArtifact(
  input: Pick<ActionInput, 'ketryxUrl' | 'project' | 'apiKey'>,
  filePath: string,
  contentType = 'application/json'
): Promise<string> {
  const url = new URL('/api/v1/build-artifacts', input.ketryxUrl);
  url.searchParams.set('project', input.project);
  const urlString = url.toString();
  const formData = new FormData();
  const file = await fileFrom(filePath, contentType);
  formData.set('file', file, path.basename(filePath));

  core.debug(`Sending request to ${urlString}`);
  const response = await fetch(urlString, {
    method: 'post',
    body: formData,
    headers: {
      authorization: `Bearer ${input.apiKey}`,
    },
  });

  if (response.status !== 200) {
    throw new Error(
      `Error uploading build artifact to ${urlString}: status ${response.status}`
    );
  }

  const responseData = await response.json();
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
  artifacts: ArtifactData[]
): Promise<BuildApiResponseData> {
  const sourceUrl = getGitHubRunUrl();
  const repositoryUrl = getGitHubRepositoryUrl();

  const data: BuildApiInputData = {
    project: input.project,
    version: input.version,
    buildName: input.buildName,
    commitSha: input.commitSha,
    log: input.log,
    artifacts,
    sourceUrl,
    repositoryUrls: [repositoryUrl],

    // When checking for dependencies or release status, trigger a synchronous update of the repository
    // on the Ketryx side, to make sure the current commit can be found.
    syncRepositoryUpdate:
      input.checkDependenciesStatus || input.checkReleaseStatus,
    checkDependenciesStatus: input.checkDependenciesStatus,
    checkReleaseStatus: input.checkReleaseStatus,
  };
  const url = new URL('/api/v1/builds', input.ketryxUrl);
  const urlString = url.toString();

  core.debug(`Sending request to ${urlString}: ${JSON.stringify(data)}`);
  const response = await fetch(urlString, {
    method: 'post',
    body: JSON.stringify(data),
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
  });
  if (response.status !== 200) {
    let error = `Error status ${response.status}`;
    const contentType = response.headers.get('content-type');
    if (
      contentType === 'application/json' ||
      contentType?.startsWith('application/json;')
    ) {
      const responseData = (await response.json()) as BuildApiResponseData;
      core.debug(
        `Received response status ${response.status}, JSON ${JSON.stringify(
          responseData
        )}`
      );
      if (responseData.error) {
        error = responseData.error;
      }
    } else {
      core.debug(
        `Received response status ${response.status}, type ${
          contentType || 'unspecified'
        }`
      );
    }
    return { ok: false, error };
  }
  const responseData = (await response.json()) as BuildApiResponseData;
  core.debug(`Received response ${JSON.stringify(responseData)}`);
  return responseData;
}
