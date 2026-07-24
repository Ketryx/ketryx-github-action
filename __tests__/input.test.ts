import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { readActionInput } from '../src/input';
import { cleanActionEnv, setInput, setRequiredInputs } from './helpers';

let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = cleanActionEnv();
  setRequiredInputs();
});

afterEach(() => {
  restoreEnv();
});

describe('required inputs', () => {
  test('throws if project is missing', () => {
    setInput('project', '');
    expect(() => readActionInput()).toThrow('Missing input project');
  });

  test('throws if api-key is missing', () => {
    setInput('api-key', '');
    expect(() => readActionInput()).toThrow('Missing input api-key');
  });
});

describe('defaults', () => {
  test('uses default Ketryx URL and empty path lists', () => {
    const input = readActionInput();
    expect(input.ketryxUrl).toBe('https://app.ketryx.com');
    expect(input.project).toBe('test-project');
    expect(input.apiKey).toBe('test-api-key');
    expect(input.artifactPath).toEqual([]);
    expect(input.testCucumberPath).toEqual([]);
    expect(input.testJunitPath).toEqual([]);
    expect(input.cycloneDxJsonPath).toEqual([]);
    expect(input.spdxJsonPath).toEqual([]);
    expect(input.tests).toEqual([]);
    expect(input.checkDependenciesStatus).toBe(false);
    expect(input.checkChangeRequestItemAssociation).toBe(false);
    expect(input.checkReleaseStatus).toBe(false);
  });
});

describe('version and commit SHA', () => {
  test('uses GITHUB_SHA when commit-sha is not set', () => {
    process.env.GITHUB_SHA = 'abc123';
    const input = readActionInput();
    expect(input.commitSha).toBe('abc123');
  });

  test('prefers explicit commit-sha over GITHUB_SHA', () => {
    process.env.GITHUB_SHA = 'abc123';
    setInput('commit-sha', 'def456');
    const input = readActionInput();
    expect(input.commitSha).toBe('def456');
  });

  test('ignores commit SHA if an explicit version is given', () => {
    process.env.GITHUB_SHA = 'abc123';
    setInput('version', 'v1.2.3');
    const input = readActionInput();
    expect(input.version).toBe('v1.2.3');
    expect(input.commitSha).toBeUndefined();
  });
});

describe('change request number', () => {
  test('parses PR number from GITHUB_REF_NAME', () => {
    process.env.GITHUB_REF_NAME = '42/merge';
    const input = readActionInput();
    expect(input.changeRequestNumber).toBe(42);
  });

  test('is null for branch ref names', () => {
    process.env.GITHUB_REF_NAME = 'main';
    const input = readActionInput();
    expect(input.changeRequestNumber).toBeNull();
  });

  test('is null when GITHUB_REF_NAME is not set', () => {
    const input = readActionInput();
    expect(input.changeRequestNumber).toBeNull();
  });
});

describe('multiline path inputs', () => {
  test('splits newline-separated glob patterns', () => {
    setInput('artifact-path', 'build/out-*.zip\nbuild/report.pdf');
    setInput('test-junit-path', 'reports/junit-*.xml');
    const input = readActionInput();
    expect(input.artifactPath).toEqual(['build/out-*.zip', 'build/report.pdf']);
    expect(input.testJunitPath).toEqual(['reports/junit-*.xml']);
  });
});

describe('tests input', () => {
  test('parses a YAML list of test results', () => {
    setInput(
      'tests',
      [
        '- testedItem: SAMD-42',
        '  result: pass',
        '  title: Test A',
        '- testedItem: SAMD-43',
        '  result: fail',
        '  title: Test B',
        '  artifactPaths:',
        '    - screenshots/*.png',
      ].join('\n')
    );
    const input = readActionInput();
    expect(input.tests).toEqual([
      { testedItem: 'SAMD-42', result: 'pass', title: 'Test A' },
      {
        testedItem: 'SAMD-43',
        result: 'fail',
        title: 'Test B',
        artifactPaths: ['screenshots/*.png'],
      },
    ]);
  });

  test('throws a descriptive error on invalid YAML', () => {
    setInput('tests', '{invalid: yaml: here');
    expect(() => readActionInput()).toThrow('Failed to parse input tests');
  });
});

describe('request timeout', () => {
  test('defaults to 35 minutes', () => {
    const input = readActionInput();
    expect(input.requestTimeoutSeconds).toBe(35 * 60);
  });

  test('parses an explicit value', () => {
    setInput('request-timeout-seconds', '600');
    const input = readActionInput();
    expect(input.requestTimeoutSeconds).toBe(600);
  });

  test.each(['abc', '0', '-5'])('throws on invalid value %s', (value) => {
    setInput('request-timeout-seconds', value);
    expect(() => readActionInput()).toThrow(
      'Invalid input request-timeout-seconds'
    );
  });
});

describe('check flags', () => {
  test('parses boolean check inputs', () => {
    setInput('check-dependencies-status', 'true');
    setInput('check-item-association', 'true');
    setInput('check-release-status', 'true');
    const input = readActionInput();
    expect(input.checkDependenciesStatus).toBe(true);
    expect(input.checkChangeRequestItemAssociation).toBe(true);
    expect(input.checkReleaseStatus).toBe(true);
  });
});
