# Changelog

## 0.1.1

- Add a **note** to pinned packages via ⓘ: document why a version is pinned and share it with your team through git (`.vscode/dep-version-checker.json` → `notes`).
- Status indicators (✅ ❗ 🟢 🔵) moved to large, clearly visible markers at the end of the line.
- Quick ↗ link in the panel and CodeLens to open a package's registry page (npm/PyPI/crates.io/Packagist).
- Scanning indicator replaced with a proper circular spinner.
- Activity Bar icon redesigned as an outline cube with an upgrade arrow.
- README fully in English.

## 0.1.0

Initial release.

- Dependency version checking for npm, Python (pip/poetry), Rust (Cargo), and PHP (Composer) projects.
- major / minor / patch classification; uses the registry's `latest` tag and hides junk/pre-release versions.
- Activity Bar side panel: checkbox + version dropdown (all versions, with down/deprecated labels) + bulk/single update + search.
- Inline CodeLens: update / pick version / pin right on the manifest line.
- Installed-version resolution respects the manifest range; automatic re-scan when the lock file changes.
- Package manager auto-detection (npm/pnpm/yarn/bun) and an npm peer-conflict strategy setting.
- Version pinning; shared across the team via `.vscode/dep-version-checker.json`.
- Peer-dependency conflict check before bulk updates, with an auto-fix suggestion.
