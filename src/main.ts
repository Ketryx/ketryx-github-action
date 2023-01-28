import * as core from '@actions/core';
import fetch, { fileFrom, FormData } from 'node-fetch';
import * as path from 'node:path';
import { ActionInput, readActionInput } from './input';

type ArtifactData = { id: string; type: 'artifact' | 'cucumber-json' };

type BuildApiInputData = {
  project: string;
  version?: string;
  commitSha?: string;
  buildName?: string;
  log?: string;
  tests?: Array<{
    testedItem: string;
    result: 'PASS' | 'FAIL';
    title: string;
    log?: string;
  }>;
  artifacts?: Array<ArtifactData>;
};

function hasProperty<T, K extends string>(
  o: T,
  k: K
): o is T & Record<K, unknown> {
  return typeof o === 'object' && k in o;
}

async function uploadBuildArtifact(
  input: Pick<ActionInput, 'ketryxUrl' | 'project' | 'apiKey'>,
  filePath: string,
  contentType = 'application/json'
): Promise<string> {
  const url = new URL('/api/hooks/build-artifact', input.ketryxUrl);
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
    throw new Error(`Error uploading build artifact to ${urlString}`);
  }

  const responseData = await response.json();
  if (hasProperty(responseData, 'id') && typeof responseData.id === 'string') {
    return responseData.id;
  }

  throw new Error(`Unexpected response data from ${urlString}`);
}

async function uploadBuild(
  input: ActionInput,
  artifacts: ArtifactData[]
): Promise<{ ok: boolean; id?: string | null }> {
  const data: BuildApiInputData = {
    project: input.project,
    version: input.version,
    buildName: input.buildName,
    commitSha: input.commitSha,
    log: input.log,
    artifacts,
  };
  const url = new URL('/api/hooks/build', input.ketryxUrl);
  const urlString = url.toString();

  core.debug(`Sending request to ${urlString}`);
  const response = await fetch(urlString, {
    body: JSON.stringify(data),
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
  });
  if (response.status !== 200) {
    return { ok: false };
  }
  const responseData = await response.json();
  const ok =
    hasProperty(responseData, 'ok') &&
    typeof responseData.ok === 'boolean' &&
    responseData.ok;
  const id =
    hasProperty(responseData, 'id') && typeof responseData.id === 'string'
      ? responseData.id
      : null;
  return { ok, id };
}

async function run(): Promise<void> {
  try {
    const input = readActionInput();

    // debug is only output if the secret `ACTIONS_STEP_DEBUG` is set to true.
    core.debug(`Input: ${JSON.stringify(input)}`);

    const artifacts: ArtifactData[] = [];
    if (input.testCucumberPath) {
      const fileId = await uploadBuildArtifact(input, input.testCucumberPath);
      artifacts.push({ id: fileId, type: 'cucumber-json' });
    }

    const buildData = await uploadBuild(input, artifacts);

    if (buildData.ok) {
      core.info(`Sent build data to Ketryx: ${buildData.id}`);
    } else {
      core.setFailed('Failed to send build data to Ketryx');
    }

    core.setOutput('ok', buildData.ok);
    core.setOutput('id', buildData.id);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
