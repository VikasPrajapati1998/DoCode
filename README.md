# DoCode

DoCode is a free, open-source code editor built from [Code - OSS](https://github.com/microsoft/vscode)
(the MIT-licensed core of Visual Studio Code). There are no license tiers or paid features.

- Extensions come from the open [Open VSX](https://open-vsx.org) registry.
- No Microsoft telemetry or proprietary services.
- Installers for Windows, macOS and Linux.

## Install

Download from the repository's **Releases** page:

| Platform | File |
|---|---|
| Windows (per-user) | `DoCode-UserSetup-x64.exe` |
| Windows (all users) | `DoCode-Setup-x64.exe` |
| Windows (portable) | `DoCode-win32-x64.zip` |
| macOS Apple Silicon / Intel | `DoCode-darwin-arm64.dmg` / `DoCode-darwin-x64.dmg` |
| Linux Debian/Ubuntu | `DoCode-linux-x64.deb` |
| Linux Fedora/RHEL | `DoCode-linux-x64.rpm` |
| Linux (any) | `DoCode-linux-x64.tar.gz` |

Installers are not code-signed yet, so Windows SmartScreen and macOS Gatekeeper will warn on first run
(macOS: right-click the app, then Open).

## Build and release

See [.claude/SETUP.md](.claude/SETUP.md). Pushing a tag such as `v1.0.0` runs
`.github/workflows/release.yml`, which builds all installers and publishes a GitHub Release.

## Licensing

DoCode is MIT licensed (see `LICENSE` and `LICENSE.txt`). It is based on Code - OSS,
Copyright (c) Microsoft Corporation. DoCode is not affiliated with or endorsed by Microsoft.
