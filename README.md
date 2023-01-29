# Ketryx GitHub Action

This GitHub Action sends build results to Ketryx.

## Usage

See [action.yml](action.yml)

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

## Development

This action is based on the [typescript-action](https://github.com/actions/typescript-action) template.

Relevant documentation:

* [metadata syntax](https://help.github.com/en/articles/metadata-syntax-for-github-actions)
* [toolkit documentation](https://github.com/actions/toolkit/blob/master/README.md#packages)

Install the dependencies:
```bash
$ npm install
```

Build the typescript and package it for distribution:
```bash
$ npm run build && npm run package
```

Run the tests :heavy_check_mark:  
```bash
$ npm test

 PASS  ./index.test.js
  ✓ throws invalid number (3ms)
  ✓ wait 500 ms (504ms)
  ✓ test runs (95ms)

...
```

Actions are run from GitHub repos, so we will checkin the packed dist folder. 

Run [ncc](https://github.com/zeit/ncc) and push the results:
```bash
$ npm run package
$ git add dist
$ git commit -a -m "prod dependencies"
$ git push origin releases/v1
```

Note: We recommend using the `--license` option for ncc, which will create a license file for all of the production node modules used in your project.

Your action is now published! :rocket: 

See the [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)

See the [actions tab](https://github.com/actions/typescript-action/actions) for runs of this action! :rocket:

After testing you can [create a v1 tag](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md) to reference the stable and latest V1 action.
