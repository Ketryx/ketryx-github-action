import * as core from '@actions/core';
import glob from 'glob-promise';
import { readActionInput } from './input';
import {
  ArtifactData,
  TestArtifactData,
  TestData,
  uploadBuild,
  uploadBuildArtifact,
} from './upload';

const BINARY_CONTENT_TYPE = 'application/octet-stream';

async function run(): Promise<void> {
  try {
    const input = readActionInput();

    // debug is only output if the secret `ACTIONS_STEP_DEBUG` is set to true.
    core.debug(`Input: ${JSON.stringify(input)}`);

    // List of all artifacts to associate with the build.
    const artifacts: ArtifactData[] = [];

    // Mapping from file paths to uploaded file IDs.
    const uploadedArtifactId: Map<string, string> = new Map();

    for (const pattern of input.testCucumberPath) {
      for (const filePath of await glob(pattern)) {
        const fileId = await uploadBuildArtifact(input, filePath);
        artifacts.push({ id: fileId, type: 'cucumber-json' });
        uploadedArtifactId.set(filePath, fileId);
      }
    }
    for (const pattern of input.testJunitPath) {
      for (const filePath of await glob(pattern)) {
        const fileId = await uploadBuildArtifact(
          input,
          filePath,
          'application/xml'
        );
        artifacts.push({ id: fileId, type: 'junit-xml' });
        uploadedArtifactId.set(filePath, fileId);
      }
    }
    for (const pattern of input.spdxJsonPath) {
      for (const filePath of await glob(pattern)) {
        const fileId = await uploadBuildArtifact(input, filePath);
        artifacts.push({ id: fileId, type: 'spdx-json' });
        uploadedArtifactId.set(filePath, fileId);
      }
    }
    for (const pattern of input.artifactPath) {
      const { path, contentType = BINARY_CONTENT_TYPE } =
        typeof pattern === 'string' ? { path: pattern } : pattern;
      for (const filePath of await glob(path)) {
        if (!uploadedArtifactId.has(filePath)) {
          const fileId = await uploadBuildArtifact(
            input,
            filePath,
            contentType
          );
          artifacts.push({ id: fileId, type: 'artifact' });
          uploadedArtifactId.set(filePath, fileId);
        }
      }
    }

    const tests: TestData[] = [];
    for (const test of input.tests) {
      const testArtifacts: TestArtifactData[] = [];
      for (const pattern of test.artifactPaths || []) {
        const { path, contentType = BINARY_CONTENT_TYPE } =
          typeof pattern === 'string' ? { path: pattern } : pattern;
        for (const filePath of await glob(path)) {
          let fileId: string | undefined = uploadedArtifactId.get(filePath);
          if (fileId === undefined) {
            fileId = await uploadBuildArtifact(input, filePath, contentType);
            uploadedArtifactId.set(filePath, fileId);
          }

          testArtifacts.push({ id: fileId });
        }
      }
      tests.push({
        testedItem: test.testedItem,
        result: test.result,
        title: test.title,
        log: test.log,
        artifacts: testArtifacts,
      });
    }

    const buildData = await uploadBuild(input, artifacts, tests);

    if (buildData.ok) {
      core.info(`Reported build to Ketryx: ${buildData.buildId}`);

      const buildUrl = `${input.ketryxUrl}/projects/${buildData.projectId}/builds/${buildData.buildId}`;
      core.info(`Build URL: ${buildUrl}`);
      core.setOutput('build-url', buildUrl);
    } else {
      core.setFailed(`Failure reporting build to Ketryx: ${buildData.error}`);
    }

    core.setOutput('ok', buildData.ok);
    core.setOutput('error', buildData.error);
    core.setOutput('build-id', buildData.buildId);
  } catch (error) {
    core.debug(`Encountered error ${error}`);
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
