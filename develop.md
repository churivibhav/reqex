# Developer guide

How to work on reqex locally and publish releases to npm.

## Prerequisites

- **Node.js >= 20**
- **npm** (ships with Node)
- A terminal that supports Rezi (Kitty recommended on Linux; macOS and Windows also supported)
- **glibc** Linux, macOS, or Windows — Alpine/musl is not supported (Rezi native binaries)

## Clone and install

```bash
git clone https://github.com/churivibhav/reqex.git
cd reqex
npm install
```

## Project layout

| Path | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry point |
| `src/ui/` | Rezi TUI views |
| `src/state/` | App state and command bus |
| `src/engine/` | httpyac integration (parse, send, regions) |
| `src/workspace/` | File tree discovery |
| `src/keymap/` | Keybinding dispatch |
| `src/config/` | User/project keybinding config |
| `test/` | Node test runner tests |
| `dist/` | Build output (gitignored; created by `npm run build`) |

## Daily development

### Run with hot reload

```bash
npm run dev
```

Runs `src/cli.ts` via `tsx watch`. Pass a workspace path as you would the built CLI:

```bash
npm run dev -- ./path/to/http/files
```

### Run the built binary

After a build:

```bash
npm run build
npm start
# or
node dist/cli.js
```

### Type-check

```bash
npm run check
```

## Tests

```bash
npm test
```

Tests live under `test/` and use Node's built-in test runner (`tsx --test`). CI runs the same command on every push/PR to `main`.

Before opening a PR, run:

```bash
npm test
npm run check
npm run build
```

## Build

Production bundle is produced by [tsup](tsup.config.ts):

```bash
npm run build
```

Output goes to `dist/cli.js` (ESM, Node 20 target). Dependencies (`httpyac`, `@rezi-ui/*`) are **not** bundled — they are installed from npm when users install the package.

### Inspect what would be published

```bash
npm run build
npm pack --dry-run
```

The tarball should contain only `dist/`, `README.md`, `LICENSE`, and `package.json` (see `"files"` in `package.json`).

## CI

GitHub Actions workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on push and pull requests to `main`:

1. `npm ci`
2. `npm test`
3. `npm run build`

Fix any failing step before merging.

## Publishing to npm

Package name: **`@churivibhav/reqex`**

Users install with:

```bash
npm install -g @churivibhav/reqex
```

The CLI command remains `reqex`.

### One-time setup (npm trusted publisher)

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) — no long-lived `NPM_TOKEN` in GitHub Secrets.

Configure once on [npmjs.com](https://www.npmjs.com/) for **`@churivibhav/reqex`**:

1. Log in as **churivibhav** and enable **two-factor authentication**.
2. Open the package → **Settings** → **Trusted Publisher** → **GitHub Actions**.
3. Set:
   - **Organization or user**: `churivibhav`
   - **Repository**: `reqex`
   - **Workflow filename**: `publish.yml` (exact filename, including `.yml`)
   - **Environment** (optional): leave blank unless you add a GitHub Environment and match it here
4. Save. npm does not validate these fields until the first publish — double-check spelling and case.

The workflow [`.github/workflows/publish.yml`](.github/workflows/publish.yml) must:

- Run on **GitHub-hosted** runners (`ubuntu-latest`)
- Set `permissions.id-token: write` (for OIDC)
- **Not** set `NODE_AUTH_TOKEN` on the publish step (that would bypass OIDC)

Requires **Node.js 24+** in the publish job (npm CLI ≥ 11.5.1). Provenance attestations are generated automatically when publishing via trusted publishing.

Optional hardening after the first successful OIDC publish: package **Settings → Publishing access → Require two-factor authentication and disallow tokens**.

### Release checklist

Publishing is **tag-triggered**. The git tag must match `version` in `package.json`.

1. Merge your changes to `main` and confirm CI is green.
2. Bump `version` in `package.json` (semver: `0.1.0` → `0.1.1`, etc.).
3. Commit the version bump (e.g. `chore: release v0.1.1`).
4. Create and push a tag whose name is `v` + that version:

   ```bash
   git tag v0.1.1
   git push origin main
   git push origin v0.1.1
   ```

5. Watch the **Publish** workflow in GitHub Actions ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)).

The workflow will:

- Verify tag `vX.Y.Z` matches `package.json` `X.Y.Z`
- Run tests and build
- Authenticate via OIDC and run `npm publish --access public`

### Verify a release

```bash
npm view @churivibhav/reqex version
npm install -g @churivibhav/reqex
reqex
```

### Manual publish (optional)

Normally you should use the GitHub Actions workflow. For emergencies, from a clean tree with `dist/` built:

```bash
npm login
npm test && npm run build
npm publish --access public
```

`prepublishOnly` runs tests and build automatically before publish.

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| Publish workflow fails on version mismatch | Tag must be exactly `v` + `package.json` version (e.g. tag `v0.1.0` ↔ `"version": "0.1.0"`) |
| `npm publish` ENEEDAUTH / Unable to authenticate | Trusted publisher fields must match exactly: owner `churivibhav`, repo `reqex`, workflow `publish.yml`; workflow needs `id-token: write`; use GitHub-hosted runners only |
| Publish uses token auth instead of OIDC | Do not set `NODE_AUTH_TOKEN` on the publish step; remove any leftover `NPM_TOKEN` secret if you added one earlier |
| Scoped package installs as private | `publishConfig.access` must be `"public"` (already set) |
| Rezi / TUI errors on Alpine | Unsupported platform; use glibc Linux, macOS, or Windows |
| `dist/` missing locally | Run `npm run build`; `dist/` is gitignored and built in CI before publish |

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
