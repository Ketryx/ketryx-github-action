import * as core from '@actions/core';
import { readActionInput } from './input';
import { ArtifactData, uploadBuild, uploadBuildArtifact } from './upload';

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
