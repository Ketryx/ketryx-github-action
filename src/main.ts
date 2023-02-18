import * as core from '@actions/core';
import glob from 'glob-promise';
import { readActionInput } from './input';
import { ArtifactData, uploadBuild, uploadBuildArtifact } from './upload';

async function run(): Promise<void> {
  try {
    const input = readActionInput();

    // debug is only output if the secret `ACTIONS_STEP_DEBUG` is set to true.
    core.debug(`Input: ${JSON.stringify(input)}`);

    const artifacts: ArtifactData[] = [];
    for (const pattern of input.artifactPath) {
      for (const filePath of await glob(pattern)) {
        const fileId = await uploadBuildArtifact(
          input,
          filePath,
          'application/octet-stream'
        );
        artifacts.push({ id: fileId, type: 'artifact' });
      }
    }
    for (const pattern of input.testCucumberPath) {
      for (const filePath of await glob(pattern)) {
        const fileId = await uploadBuildArtifact(input, filePath);
        artifacts.push({ id: fileId, type: 'cucumber-json' });
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
      }
    }

    const buildData = await uploadBuild(input, artifacts);

    if (buildData.ok) {
      core.info(`Sent build data to Ketryx: ${buildData.buildId}`);
    } else {
      core.setFailed(`Failed to send build data to Ketryx: ${buildData.error}`);
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
