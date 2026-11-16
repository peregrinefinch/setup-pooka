# setup-pooka

Install a [Pooka](https://github.com/pooka-lang/pooka) compiler release in GitHub Actions. Works on Linux, macOS and Windows runners, including ARM. Erlang/OTP must already be installed.

```yaml
name: test
on: [push, pull_request]
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: erlef/setup-beam@v1
        with:
          otp-version: "29"
          rebar3-version: "3"
      - uses: peregrinefinch/setup-pooka@v1
        with:
          pooka-version: ">=0.3.2"
      - run: pooka deps download
      - run: pooka test
      - run: pooka format --check
```

Projects created with `pooka new` already include this workflow.

## Inputs

| Input | Description |
| --- | --- |
| `pooka-version` | Required. An exact version (`0.3.2`), a SemVer range (`>=0.3.2`, `^0.3.2`, `>=0.3.2 <0.4.0`), or `latest`. |
| `github-token` | Token for GitHub release-list requests. Defaults to the workflow token; read-only contents permission is enough. |
| `compiler-repository` | The GitHub repository to download the release from. Defaults to `pooka-lang/pooka`. |

## Outputs

| Output | Description |
| --- | --- |
| `pooka-version` | The installed version, without the leading `v` |

The action downloads `pooka` and `pooka.sha256` from the matching [release](https://github.com/pooka-lang/pooka/releases), verifies the checksum and the compiler's version, then adds it to `PATH`. A missing release, a checksum mismatch or an incompatible OTP version fails the step.

Ranges select the highest matching published stable release, across all release pages. Drafts and prereleases are excluded. Use an exact pin for a prerelease or a reproducible compiler version. `>0.3.1` excludes `0.3.1`; `>=0.3.1` includes it.

Windows installs a `pooka.cmd` launcher that runs the same verified escript through Erlang.

## Development

Requires Node.js 24. Version matching uses npm’s `semver` implementation. The committed action bundle includes it; users of the action do not need to install npm dependencies.

```sh
npm ci
npm test
npm run build
```

## Licence

setup-pooka is licensed under the [Apache License, Version 2.0](LICENSE).
