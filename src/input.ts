import * as core from '@actions/core';

export type ActionInput = {
  ketryxUrl: string;
  apiKey: string;
  project: string;
  version?: string;
  commitSha?: string;
  buildName?: string;
  log?: string;
  artifactPath: string[];
  testCucumberPath: string[];
  testJunitPath: string[];
  checkDependenciesStatus: boolean;
  checkReleaseStatus: boolean;
};

export function readActionInput(): ActionInput {
  const ketryxUrl = core.getInput('ketryx-url') || 'https://app.ketryx.com';

  const project = core.getInput('project');
  if (!project) {
    throw new Error('Missing input project');
  }

  const apiKey = core.getInput('api-key');
  if (!apiKey) {
    throw new Error('Missing input api-key');
  }

  const version = core.getInput('version');
  const commitSha = core.getInput('commit-sha') || process.env.GITHUB_SHA;
  const buildName = core.getInput('build-name');

  const artifactPath = core.getMultilineInput('artifact-path');
  const testCucumberPath = core.getMultilineInput('test-cucumber-path');
  const testJunitPath = core.getMultilineInput('test-junit-path');

  const log = core.getInput('log');

  const checkDependenciesStatus = core.getBooleanInput(
    'check-dependencies-status'
  );
  const checkReleaseStatus = core.getBooleanInput('check-release-status');

  return {
    ketryxUrl,
    project,
    version,
    commitSha,
    apiKey,
    log,
    artifactPath,
    testCucumberPath,
    testJunitPath,
    buildName,
    checkDependenciesStatus,
    checkReleaseStatus,
  };
}
