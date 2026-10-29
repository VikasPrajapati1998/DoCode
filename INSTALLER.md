# DoCode Installers

Final installers live in `installer/`:

```
installer/
├── windows/   DoCode-UserSetup-x64.exe, DoCode-Setup-x64.exe, DoCode-win32-x64.zip
├── macos/     DoCode-darwin-arm64.dmg/.zip, DoCode-darwin-x64.dmg/.zip
└── linux/     DoCode-linux-x64.deb/.rpm/.tar.gz
```

Binaries are gitignored (too large for git). Windows can be built locally; macOS and Linux must be built on
those systems, which the GitHub workflow does for you.

## Prerequisites (one time, Windows)

- Node.js matching `.nvmrc`, Python 3.11 or 3.12 plus `pip install setuptools`
- Visual Studio 2022 Build Tools: "Desktop development with C++", ATL, MFC, and the
  **Spectre-mitigated libs** (x64/x86 and ARM64)

```cmd
cd /d D:\Applications\DoCode
npm ci
```

## Quick commands

| Run on | Command | Output |
|---|---|---|
| Windows | `npm run dist:win` | `installer\windows\` |
| macOS | `npm run dist:mac` | `installer/macos/` |
| Linux | `npm run dist:linux` | `installer/linux/` |

Each command builds only for the OS it runs on. Use GitHub Actions (section 2) to get all three at once.

## 1. Build the Windows installers (local)

```cmd
cd /d D:\Applications\DoCode
npm run dist:win
```

(`npm run dist:win` runs `installer\build-windows.cmd`.)

Output: `installer\windows\DoCode-UserSetup-x64.exe` (no admin) and `installer\windows\DoCode-Setup-x64.exe` (all users).
Takes 30-60 minutes.

The same thing step by step:

```cmd
npm run gulp core-ci
npm run gulp docode-win32-x64-min-ci
npm run gulp docode-win32-x64-inno-updater
npm run gulp docode-win32-x64-user-setup
npm run gulp docode-win32-x64-system-setup
```

Raw outputs are `.build\win32-x64\user-setup\DoCodeSetup.exe` and `.build\win32-x64\system-setup\DoCodeSetup.exe`;
the unpacked app is in `..\DoCode-win32-x64`.

## 2. Build all platforms (GitHub Actions)

Push the repository to GitHub, then either:

- **Test run (no release):** GitHub, **Actions**, **Release installers**, **Run workflow**. Download the
  `installer` artifact when it finishes.
- **Release:**

```cmd
git tag v0.1.0
git push origin v0.1.0
```

The workflow (`.github/workflows/release.yml`) builds Windows, Linux and macOS (arm64 and x64), arranges the
files into `installer/windows|macos|linux`, and attaches them plus `DoCode-installers.zip` to the GitHub Release.

## 3. Build macOS / Linux manually (on that OS only)

Linux (needs `libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev fakeroot rpm dpkg-dev`):

```bash
npm ci
npm run gulp core-ci
npm run gulp docode-linux-x64-min-ci
npm run gulp docode-linux-x64-prepare-deb
npm run gulp docode-linux-x64-build-deb
npm run gulp docode-linux-x64-prepare-rpm
npm run gulp docode-linux-x64-build-rpm
tar -czf DoCode-linux-x64.tar.gz -C .. DoCode-linux-x64
```

macOS (use `arm64` or `x64` to match the machine):

```bash
npm ci
npm run gulp core-ci
npm run gulp docode-darwin-arm64-min-ci
hdiutil create -volname "DoCode" -srcfolder ../DoCode-darwin-arm64/DoCode.app -ov -format UDZO DoCode-darwin-arm64.dmg
```

## 4. Installing DoCode (for users)

| OS | Command / action |
|---|---|
| Windows | Double-click `DoCode-UserSetup-x64.exe` (or `DoCode-Setup-x64.exe` for all users) |
| macOS | Open the `.dmg`, drag **DoCode** to Applications; first launch: right-click, **Open** |
| Debian/Ubuntu | `sudo apt install ./DoCode-linux-x64.deb` |
| Fedora/RHEL | `sudo rpm -i DoCode-linux-x64.rpm` (or `sudo dnf install ./DoCode-linux-x64.rpm`) |
| Any Linux | `tar -xzf DoCode-linux-x64.tar.gz` then run `DoCode-linux-x64/docode` |

The installers are unsigned, so Windows SmartScreen ("More info", "Run anyway") and macOS Gatekeeper will warn on
first run.
