# Ketryx GitHub Action

This GitHub Action reports builds and test results to [Ketryx](https://www.ketryx.com/) via the [build API](https://docs.ketryx.com/api/build-api).

## Usage

The examples below show some common use cases.

Also refer to the [documentation on workflow YAML syntax](https://help.github.com/en/articles/workflow-syntax-for-github-actions), and see [action.yml](action.yml) for full details.

### Upload test results and artifacts

```yaml
- name: Report build to Ketryx
  uses: Ketryx/ketryx-github-action
  with:
    project: ${{ secrets.KETRYX_PROJECT }}
    api-key: ${{ secrets.KETRYX_API_KEY }}
    artifact-path: |
      build/**/*.css
      build/**/*.js
      build/**/*.json
    test-cucumber-path: test-results/report.json
    test-junit-path: test-results/*.xml
```

Read [this documentation](https://docs.ketryx.com/manuals/man-06-test-management#id-3.4.-associating-automated-tests-with-configuration-items) for details on how to associate Cucumber and JUnit reports with Ketryx configuration items.

### Upload SPDX JSON files

```yaml
- name: Report build to Ketryx
  uses: Ketryx/ketryx-github-action
  with:
    project: ${{ secrets.KETRYX_PROJECT }}
    api-key: ${{ secrets.KETRYX_API_KEY }}
    spdx-json-path: |
      build/**/*.spdx.json
```

### Upload individual test results

```yaml
- name: Report build to Ketryx
  uses: Ketryx/ketryx-github-action
  with:
    project: ${{ secrets.KETRYX_PROJECT }}
    api-key: ${{ secrets.KETRYX_API_KEY }}
    tests: |
      - testedItem: SAMD-45
        result: pass
        title: My automated test
        log: Log output from executing this test
        artifactPaths:
          - build/**/*.log
```

### Check approval status of dependencies

```yaml
- name: Check dependency approval status
  uses: Ketryx/ketryx-github-action
  with:
    project: ${{ secrets.KETRYX_PROJECT }}
    api-key: ${{ secrets.KETRYX_API_KEY }}
    check-dependencies-status: true
```

### Check status of release

```yaml
- name: Check dependency approval status
  uses: Ketryx/ketryx-github-action
  with:
    project: ${{ secrets.KETRYX_PROJECT }}
    api-key: ${{ secrets.KETRYX_API_KEY }}
    check-release-status: true
```

## Configuration

This action expects the following parameters.

Sensitive information, especially `api-key`, should be [set as encrypted secrets](https://help.github.com/en/articles/virtual-environments-for-github-actions#creating-and-using-secrets-encrypted-variables) (as can be seen in the examples above); otherwise, they'll be public to anyone browsing your repository's source code and CI logs.

By default, a build will be associated with all project versions whose _release ref pattern_ (as configured in the Ketryx project settings) matches the current commit (based on the environment variable `GITHUB_SHA` provided by GitHub); e.g., for the default release ref pattern of `refs/tags/v#`, if you have a tag `refs/tags/v1.0` and a version named "1.0", that tag is associated with the version, and hence builds executed on that tag are associated with the version as well. For more granular control, either `version` or `commit-sha` can be set.

> [!NOTE]
> When both `version` and `commit-sha` are set, `version` takes precedence and `commit-sha` is ignored.

| Parameter                   | Description                                                                                                                                            | Required | Example                                    |
|-----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|----------|--------------------------------------------|
| `project`                   | Ketryx project ID                                                                                                                                      | **Yes**  | `KXPRJ49GQYFQ5RR9KRTPWTRTC39YZ9W`          |
| `api-key`                   | Ketryx API key                                                                                                                                         | **Yes**  | `KXTK_...`                                 |
| `ketryx-url`                | Ketryx server URL (if not set, will default to `https://app.ketryx.com`)                                                                               | No       | `https://app.ketryx.com`                   |
| `version`                   | Ketryx version name or ID (if not set, the build will be associated with a version based on the commit SHA)                                            | No       | `KXVSN352CZED7078FC8DN23YYZVM59D`          |
| `commit-sha`                | Commit SHA (if not set, will use the environment variable `GITHUB_SHA` provided by GitHub Actions)                                                     | No       | `ad4db8ac1e70bd41aa8bcee6f00a3a1e36bb0e01` |
| `build-name`                | Build name to disambiguate several parallel builds                                                                                                     | No       | `ci-integration-tests`                     |
| `log`                       | Log output to store with the build                                                                                                                     | No       |                                            |
| `artifact-path`             | Paths (newline-separated [glob](https://github.com/isaacs/node-glob#glob-primer) patterns) of build artifact files                                     | No       | `build/out-*.*`                            |
| `tests`                     | YAML list of individual test results. Each test result must contain the keys `testedItem` and `result`                                                 | No       | <pre><code class="language-yaml">- testedItem: SAMD-45&#10;  result: pass&#10;  title: My automated test&#10;  log: Log output from executing this test&#10;  artifactPaths:&#10;    - build/**/*.log&#10;</code></pre> |
| `test-cucumber-path`        | Paths (newline-separated glob patterns) of Cucumber JSON files containing test results                                                                 | No       | `test-results/report.json`                 |
| `test-junit-path`           | Paths (newline-separated glob patterns) of JUnit XML files containing test results                                                                     | No       | `test-results/junit.xml`                   |
| `spdx-json-path`            | Paths (newline-separated glob patterns) of SPDX JSON files                                                                                             | No       | `build/**/*.spdx.json`                     |
| `check-dependencies-status` | Checks the status of dependencies, and fails the build if not all dependencies in the current commit are accepted and controlled                       | No       | `true`                                     |
| `check-item-association`    | Checks that the pull request is associated with an item in its title or description                                                                    | No       | `true`                                     |
| `check-release-status`      | Checks the status of the given version or the version(s) corresponding to the current commit, and fails the build if the versions are not all released | No       | `true`                                     |

## Development

This action is based on the [typescript-action](https://github.com/actions/typescript-action) template.

Relevant documentation:

* [metadata syntax](https://help.github.com/en/articles/metadata-syntax-for-github-actions)
* [toolkit documentation](https://github.com/actions/toolkit/blob/master/README.md#packages)
* [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)

Install the dependencies:

```console
$ npm install
```

Build the typescript and package it for distribution:

```console
$ npm run build && npm run package
```

Actions are run from GitHub repos, so the `dist` folder should be checked in.
