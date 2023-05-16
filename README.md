# Ketryx GitHub Action

This GitHub Action reports builds and test results to [Ketryx](https://www.ketryx.com/).

## Usage

See also: [action.yml](action.yml)

### Upload test results and artifacts

```yaml
- name: Report build to Ketryx
  uses: Ketryx/ketryx-github-action
  with:
    ketryx-url: ${{ secrets.KETRYX_URL }}
    project: ${{ secrets.KETRYX_PROJECT }}
    api-key: ${{ secrets.KETRYX_API_KEY }}
    artifact-path: |
      build/**/*.css
      build/**/*.js
      build/**/*.json
    test-cucumber-path: test-results/report.json
    test-junit-path: test-results/*.xml
```

### Check approval status of dependencies

```yaml
- name: Check dependency approval status
  uses: Ketryx/ketryx-github-action
  with:
    ketryx-url: ${{ secrets.KETRYX_URL }}
    project: ${{ secrets.KETRYX_PROJECT }}
    api-key: ${{ secrets.KETRYX_API_KEY }}
    check-dependencies-status: true
```

### Check status of release

```yaml
- name: Check dependency approval status
  uses: Ketryx/ketryx-github-action
  with:
    ketryx-url: ${{ secrets.KETRYX_URL }}
    project: ${{ secrets.KETRYX_PROJECT }}
    api-key: ${{ secrets.KETRYX_API_KEY }}
    check-release-status: true
```

## Development

This action is based on the [typescript-action](https://github.com/actions/typescript-action) template.

Relevant documentation:

* [metadata syntax](https://help.github.com/en/articles/metadata-syntax-for-github-actions)
* [toolkit documentation](https://github.com/actions/toolkit/blob/master/README.md#packages)
* [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)

Install the dependencies:
```bash
$ npm install
```

Build the typescript and package it for distribution:
```bash
$ npm run build && npm run package
```

Actions are run from GitHub repos, so the `dist` folder should be checked in.
