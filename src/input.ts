import * as core from '@actions/core';
import YAML from 'yaml';

type TestsInput = Array<{
  testedItem: string;
  result: 'PASS' | 'FAIL';
  title: string;
  log?: string;
  artifactPaths?: Array<string>;
}>;

export type ActionInput = {
  ketryxUrl: string;
  apiKey: string;
  project: string;
  version?: string;
  commitSha?: string;
  changeRequestNumber?: number | null;
  buildName?: string;
  log?: string;
  artifactPath: string[];
  testCucumberPath: string[];
  testJunitPath: string[];
  tests: TestsInput;
  spdxJsonPath: string[];
  checkDependenciesStatus: boolean;
  checkChangeRequestItemAssociation: boolean;
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

  // According to https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables
  // GITHUB_REF_NAME is of the form <pr_number>/merge,
  // so we can use this to extract the PR number.
  const refName = process.env.GITHUB_REF_NAME;
  const changeRequestNumberStr =
    refName && refName.endsWith('/merge')
      ? refName.substring(0, refName.length - '/merge'.length)
      : null;
  const changeRequestNumber =
    (changeRequestNumberStr && Number.parseInt(changeRequestNumberStr)) || null;
  core.debug(
    `Determined PR number ${changeRequestNumber} based on ref name ${refName}`
  );

  const artifactPath = core.getMultilineInput('artifact-path');
  const testCucumberPath = core.getMultilineInput('test-cucumber-path');
  const testJunitPath = core.getMultilineInput('test-junit-path');
  const tests = YAML.parse(core.getInput('tests'));
  const spdxJsonPath = core.getMultilineInput('spdx-json-path');

  const log = core.getInput('log');

  const checkDependenciesStatus = core.getBooleanInput(
    'check-dependencies-status'
  );
  const checkChangeRequestItemAssociation = core.getBooleanInput(
    'check-item-association'
  );
  const checkReleaseStatus = core.getBooleanInput('check-release-status');

  return {
    ketryxUrl,
    project,
    version,

    // If an explicit `version` is specified, do not consider the `commitSha` parameter.
    // The build should be associated with a Ketryx project version just based on the version ID
    // in this case.
    commitSha: version ? undefined : commitSha,

    apiKey,
    changeRequestNumber,
    log,
    artifactPath,
    testCucumberPath,
    testJunitPath,
    tests,
    spdxJsonPath,
    buildName,
    checkDependenciesStatus,
    checkChangeRequestItemAssociation,
    checkReleaseStatus,
  };
}
