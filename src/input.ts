import * as core from '@actions/core';

export type ActionInput = {
  ketryxUrl: string;
  apiKey: string;
  project: string;
  version?: string;
  commitSha?: string;
  buildName?: string;
  log?: string;
  testCucumberPath?: string;
};

export function readActionInput(): ActionInput {
  const ketryxUrl = core.getInput('ketryxUrl') || 'https://app.ketryx.com';

  const project = core.getInput('project');
  if (!project) {
    throw new Error('Missing input project');
  }

  const apiKey = core.getInput('apiKey');
  if (!apiKey) {
    throw new Error('Missing input apiKey');
  }

  const version = core.getInput('version');
  const commitSha = core.getInput('commitSha') || process.env.GITHUB_SHA;
  const buildName = core.getInput('buildName');

  const testCucumberPath = core.getInput('testCucumberPath');

  const log = core.getInput('log');

  return {
    ketryxUrl,
    project,
    version,
    commitSha,
    apiKey,
    log,
    testCucumberPath,
    buildName,
  };
}
