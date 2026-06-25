# reqex

**reqex** is a terminal HTTP client for `.http` and `.rest` files. Open a folder of requests, edit them in place, send them, and read the response — all in one screen. Think Postman, but in your terminal.

It uses [httpyac](https://httpyac.github.io/) under the hood, so your existing REST Client / httpyac files work as-is. The UI is built with [Rezi](https://rezitui.dev).

## Install

You need **Node.js 20 or later**.

```bash
npm install -g @churivibhav/reqex
```

## Quick start

1. Put your HTTP files in a folder (`.http`, `.rest`, or environment files like `.env` / `.env.json`).
2. Open that folder with reqex:

```bash
reqex                 # open the current directory
reqex ./api           # open a specific folder
```

3. Select a file in the **Files** pane on the left.
4. Place your cursor on a request block and press **F5** to send it.
5. Read the response in the **Response** pane on the right.

That’s the core loop: browse → edit → send → inspect.

## The interface

reqex opens a three-pane layout:

| Pane | What it does |
|------|----------------|
| **Files** | Browse `.http`, `.rest`, and environment files in your workspace |
| **Editor** | Edit the selected file with HTTP syntax highlighting |
| **Response** | Status, headers, body, variables, and test results for the last request |

Use **Tab** / **Shift+Tab** to move between panes, or **Ctrl+1**, **Ctrl+2**, **Ctrl+3** to jump directly. Press **F11** or **z** to zoom the focused pane.

Press **F1** or **?** anytime for in-app quick help. Press **Ctrl+/** for the full keybinding list.

## HTTP files

reqex understands the standard `.http` / `.rest` format. A minimal example:

```http
@baseUrl = https://api.example.com

### List items
GET {{baseUrl}}/items
Accept: application/json

### Create item
POST {{baseUrl}}/items
Content-Type: application/json

{
  "name": "example"
}
```

Each request is separated by a line starting with `###`. Variables like `{{baseUrl}}` are resolved when you send.

Because reqex uses httpyac, you also get:

- **Variables** — file-level `@name = value` and environment files
- **Environments** — switch between dev/staging/prod with **Ctrl+E**
- **Chained requests** — reference a previous response with `@name` and `# @ref name`
- **Tests** — assertions with `??` lines after a request

For the full file format, see the [httpyac documentation](https://httpyac.github.io/guide/request.html).

## Sending requests

- Put the cursor anywhere inside a request block and press **F5** (or **Ctrl+Enter** / **Alt+Enter** on terminals that support it).
- To stop a slow request, press **Ctrl+X**.
- Unsaved edits are marked in the file tree — press **Ctrl+S** to save before sending if you want the file on disk updated.

## Response pane

After a request completes, the response pane shows several tabs:

| Tab | Shows |
|-----|--------|
| **Pretty** | Formatted JSON when applicable |
| **Raw** | Response body as received |
| **Headers** | Response headers |
| **Variables** | Variables set by the request |
| **Tests** | Test assertion results |

Use **Ctrl+Tab** / **Ctrl+Shift+Tab** to cycle tabs, or click a tab header. Copy the visible tab with **Ctrl+Shift+C**.

## Environments

If your project defines httpyac environments (for example in `.env` or `.env.json` files), switch between them with **Ctrl+E**. Use the arrow keys to highlight an environment and **Enter** to apply it. Choose **(none)** to clear the active environment.

## Command palette

Press **F2** or **Ctrl+Shift+P** to open the command palette. From there you can send requests, save files, switch environments, toggle the sidebar, and more — without memorizing every shortcut.

## Configuration

### Keybindings

Default shortcuts follow a VS Code–style preset. Override them in:

- **User config:** `~/.config/reqex/keybindings.json` (Linux), `~/Library/Application Support/reqex/keybindings.json` (macOS), or `%APPDATA%\reqex\keybindings.json` (Windows)
- **Project config:** `.reqex/keybindings.json` in your workspace (overrides user settings)

Set `REQEX_CONFIG_DIR` to use a different config directory.

Example — remap send to **Ctrl+Return** only and use the vim pane preset:

```json
{
  "preset": "vim",
  "bindings": {
    "ctrl+return": "request.send"
  }
}
```

Changes are picked up automatically while reqex is running.

### Common shortcuts

| Key | Action |
|-----|--------|
| `F5` | Send request under cursor |
| `Ctrl+Enter` / `Alt+Enter` | Send request |
| `Ctrl+X` | Cancel in-flight request |
| `Ctrl+S` | Save file |
| `Ctrl+E` | Environment switcher |
| `Ctrl+B` | Toggle file sidebar |
| `Ctrl+P` | Quick open files |
| `Ctrl+Shift+P` / `F2` | Command palette |
| `Ctrl+Shift+C` | Copy response tab |
| `Ctrl+F` | Search in response |
| `Tab` / `Shift+Tab` | Cycle panes |
| `Ctrl+1/2/3` | Jump to Files / Editor / Response |
| `F1` / `?` | Quick help |
| `Ctrl+/` | Full keybindings list |
| `F11` / `z` | Zoom pane |
| `Ctrl+Q` | Quit |

## Requirements

- **Node.js >= 20**
- A modern terminal. **Kitty** is recommended on Linux for the best keyboard support.
- **glibc** Linux (x64 or arm64), macOS, or Windows.

Alpine Linux and other **musl**-based systems are not supported (Rezi ships native binaries built for glibc).

## Contributing

See [develop.md](develop.md) for local setup, tests, and publishing.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
