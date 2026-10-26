# DoCode installers

```
installer/
├── windows/   DoCode-UserSetup-x64.exe, DoCode-Setup-x64.exe, DoCode-win32-x64.zip
├── macos/     DoCode-darwin-arm64.dmg/.zip, DoCode-darwin-x64.dmg/.zip
└── linux/     DoCode-linux-x64.deb/.rpm/.tar.gz
```

The binaries are not committed to git (each is 100 MB or more). They are produced by:

- **Windows (local):** run `installer\build-windows.cmd`.
- **All platforms (CI):** push a `v*` tag or run the *Release installers* workflow. The `bundle` job
  builds this same folder layout and uploads it as the `installer` artifact and as
  `DoCode-installers.zip` on the GitHub Release.

macOS and Linux installers can only be built on those operating systems, so use CI for them.
