# reqex

Terminal HTTP client for `.http` / `.rest` files — Postman-like workflow in the TUI.

- **UI**: [Rezi](https://rezitui.dev) (`@rezi-ui`) three-pane layout (files | editor | response)
- **Engine**: [httpyac](https://httpyac.github.io/) — full `.http` compatibility
- **Target**: Kitty / glibc Linux, macOS, Windows (Rezi native binaries)

## Install

```bash
npm install -g @churivibhav/reqex
```

## Usage

```bash
reqex                 # open cwd
reqex ./api           # open folder
```

### Keybindings (default VS Code preset)

| Key | Action |
|-----|--------|
| `F5` | Send request under cursor |
| `Ctrl+Enter` / `Alt+Enter` | Send (Kitty keyboard protocol) |
| `Ctrl+X` | Cancel in-flight request |
| `Tab` / `Shift+Tab` | Cycle panes |
| `Ctrl+1/2/3` | Jump to Files / Editor / Response |
| `Ctrl+S` | Save file |
| `Ctrl+E` | Environment switcher |
| `Ctrl+Shift+P` / `F2` | Command palette |
| `F1` / `?` | Quick help |
| `Ctrl+/` | Full keybindings list |
| `F11` / `z` | Zoom pane |
| `Ctrl+Q` | Quit |

Configurable bindings: `~/.config/reqex/keybindings.json` (or `%APPDATA%\\reqex` on Windows). Project overrides in `.reqex/keybindings.json`. Set `REQEX_CONFIG_DIR` to override the config root.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

## Platform notes

- Requires **Node.js >= 20**
- Rezi uses prebuilt native binaries (glibc Linux x64/arm64, macOS, Windows). **Alpine/musl is not supported.**

## License

GPL-3.0-or-later
