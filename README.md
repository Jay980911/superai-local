# SuperAI Local

Local project bridge & live preview CLI for the [SuperAI](https://github.com/Jay980911/superai-local) web agent. The hosted SuperAI agent runs in a container and cannot reach your machine; this CLI runs on your computer, exposes a local HTTP server on `localhost:7000`, and lets the browser front-end proxy file and command operations to your real local project through the hosted `/api/local/tool` channel.

## What it does

- Serves a local workbench UI (file tree + live preview) at `http://localhost:7000`.
- Exposes `GET /api/ping`, `POST /api/handshake`, `GET /api/tree`, `GET /api/file`, `POST /api/tool` (the bridge the agent calls).
- `POST /api/tool` dispatches four whitelisted operations the agent uses:
  - `list_files` — list a project directory (optional subdirectory)
  - `read_file` — read a UTF-8 file
  - `write_file` — write a UTF-8 file (size-capped, path-confined)
  - `run_command` — run a whitelisted command (npm/npx/node/yarn/pnpm/git + read-only diagnostics)
- Registers the `superai-local://` URL protocol so the web page can launch it with one click.

## Install (end users)

Download `SuperAI-Local-Setup.exe` from the [latest release](../../releases), run it, then click **连接本地电脑** in the SuperAI web page. The installer is code-signed through [SignPath Foundation](https://signpath.org) (free OSS signing), so Windows SmartScreen / Smart App Control accept it.

## Develop

```bash
npm install
npm start                    # runs on http://localhost:7000
```

Point it at your SuperAI server with env or CLI flags:

```bash
SUPERAI_SERVER=https://your-superai.example npm start
# or
node bin/cli.js --port 7000 --token <jwt> --server https://your-superai.example /path/to/project
```

## Build

Windows binaries are produced in CI:

```bash
npm run build:win           # -> dist/superai-local.exe (Node + CLI bundled via @yao-pkg/pkg)
npm run installer:win       # -> dist/SuperAI-Local-Setup.exe (Inno Setup, requires Inno Setup installed)
```

## Security

- All file operations are path-confined to the chosen work directory (`src/security.js`).
- `run_command` only runs commands whose first token is in a fixed whitelist; npm install auto-uses the China mirror.
- No file contents or credentials are persisted by the hosted side; this CLI is the only component that touches your disk.

## License

MIT. Windows binaries are signed via the [SignPath Foundation](https://signpath.org) free OSS program; the certificate reads "Open Source Developer, SignPath Foundation".
