<div align="center">

# 📦 Dependency Version Checker

### See outdated dependencies, check them for CVEs, and update with confidence — across npm, Python, Rust & PHP.

![Open VSX Version](https://img.shields.io/open-vsx/v/tahayasinbike/dep-version-checker?color=2ea043&label=Open%20VSX&style=for-the-badge)
![Open VSX Downloads](https://img.shields.io/open-vsx/dt/tahayasinbike/dep-version-checker?color=8b7bd8&style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-4d8de0?style=for-the-badge)

![Dependency Version Checker in action](https://github.com/tahayasinbike/dep-version-checker/raw/HEAD/resources/demo.gif)

</div>

## Features

- **🎯 Accurate updates** — uses the registry's official `latest` tag and classifies each update as `major` / `minor` / `patch`; hides junk and pre-release versions by default.
- **☑️ Bulk or single** — tick packages, pick any target version (all versions listed, incl. downgrades & deprecated), update in one click.
- **🔐 Security (CVE) checks** — flags installed packages with known vulnerabilities and warns before updating *into* a vulnerable version, with CVE id, severity and the first fixed version (powered by [OSV.dev](https://osv.dev)).
- **🛡️ Peer-dependency safety** — detects incompatible bulk updates before they happen and offers a one-click auto-fix (no more `ERESOLVE`).
- **📌 Pinning with notes** — lock sensitive packages, document *why*, and share both with your team via git (`.vscode/dep-version-checker.json`).
- **🔗 Quick navigation** — open any package's registry page, or jump to its line in the manifest.
- **🔧 Zero-config** — auto-detects npm / pnpm / yarn / bun, preserves version range prefixes, and re-scans automatically after install.

Two surfaces: a rich **side panel** (Activity Bar) and inline **CodeLens** right on your manifest.

## Supported ecosystems

| Ecosystem | Manifest | Registry |
|:--|:--|:--|
| **npm** | `package.json` | npmjs.org |
| **Python** | `requirements.txt`, `pyproject.toml` | pypi.org |
| **Rust** | `Cargo.toml` | crates.io |
| **PHP** | `composer.json` | packagist.org |

## Settings

| Setting | Default | Description |
|:--|:--|:--|
| `depChecker.includePrerelease` | `false` | Also consider alpha/beta/rc versions |
| `depChecker.runInstallAfterUpdate` | `true` | Run the install command after an update |
| `depChecker.npmPeerConflictStrategy` | `default` | `legacy-peer-deps` / `force` for npm peer conflicts |
| `depChecker.requestTimeoutMs` | `8000` | Registry request timeout (ms) |

## Privacy

Requests go only to public package registries (npmjs, PyPI, crates.io, Packagist) and [OSV.dev](https://osv.dev) for advisories. Your code and credentials are never sent anywhere.

<div align="center">

**MIT License**

</div>
