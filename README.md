# setup-pooka

Install a [Pooka](https://github.com/pooka-lang/pooka) compiler release in GitHub Actions. Works on Linux and macOS runners, including ARM. Erlang/OTP must already be installed.

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
          pooka-version: "0.1.0"
      - run: pooka deps download
      - run: pooka test
      - run: pooka format --check
```

Projects created with `pooka new` already include this workflow.

## Inputs

| Input | Description |
| --- | --- |
| `pooka-version` | Required. An exact version, such as `0.1.0` or `v0.1.0`. Ranges and `latest` are not supported. |
| `compiler-repository` | The GitHub repository to download the release from. Defaults to `pooka-lang/pooka`. |

## Outputs

| Output | Description |
| --- | --- |
| `pooka-version` | The installed version, without the leading `v` |

The action downloads `pooka` and `pooka.sha256` from the matching [release](https://github.com/pooka-lang/pooka/releases), verifies the checksum and the compiler's version, then adds it to `PATH`. A missing release, a checksum mismatch or an incompatible OTP version fails the step.

## Development

Requires Node.js 24. There are no npm dependencies.

```sh
npm test
```

## Licence

setup-pooka is licensed under the [Apache License, Version 2.0](LICENSE).
