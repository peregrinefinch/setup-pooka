# setup-pooka

Install an exact Pooka compiler release in GitHub Actions. Erlang/OTP must already be on PATH; Gleam is not required. The action supports Linux and macOS runners, including ARM runners, using the same BEAM escript.

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
      - uses: pooka-lang/setup-pooka@v1
        with:
          pooka-version: "0.1.0"
      - run: pooka deps download
      - run: pooka test
      - run: pooka format --check
```

`pooka-version` is required. Use an exact version such as `0.1.0`, `v0.1.0`, or `0.2.0-rc.1`; ranges and `latest` are deliberately unsupported. The `pooka-version` output contains the installed version without the leading `v`.

The action downloads `pooka` and `pooka.sha256` from the matching `v<version>` release in [pooka-lang/pooka](https://github.com/pooka-lang/pooka). It checks SHA-256 before executing the compiler, checks `pooka --version`, and only then adds its directory to PATH. Missing releases, checksum errors and incompatible OTP versions fail the step. The checksum detects damaged or mismatched downloads; it is obtained from the same release and is not an independent signature.

## Publishing the first version

Publish this directory as `pooka-lang/setup-pooka` and tag its reviewed initial commit `v1.0.0` and `v1`. Generated projects use the `v1` tag. A local directory alone cannot be resolved by GitHub's `uses:` syntax.

Publish the compiler as release `v0.1.0` in `pooka-lang/pooka`, with these assets:

- `pooka`: the executable escript, without an extension, built using Erlang/OTP 29.
- `pooka.sha256`: its SHA-256 digest followed by two spaces and `pooka`.

For an existing compiler build, prepare the checksum in its build directory:

```sh
cd pooka/build
shasum -a 256 pooka > pooka.sha256
```

Upload both files together. Use OTP 29 in consuming workflows for the initial compiler release. Releases built with a newer OTP may require that newer runtime. Neither repository, tags nor release assets are published automatically by this project.

## Development

Node.js 24 is required. There are no npm dependencies or generated bundles.

```sh
npm test
```

Tests mock release downloads and cover exact versions, checksum integrity, installation on Linux/macOS, failed downloads, compiler version mismatches, unsupported platforms and runtime failures. CI runs the suite on Linux and macOS. Windows support can be added after validating the compiler and executable launcher there.
