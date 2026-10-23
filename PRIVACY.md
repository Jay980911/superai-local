# Privacy Policy — SuperAI Local

**Last updated: 2026-10-23**

SuperAI Local is a local bridge that lets the hosted SuperAI web AI agent operate on files and run whitelisted commands on **your** computer. This policy describes what data the software handles and where it goes.

## What data is processed

When you connect SuperAI Local to a SuperAI server, the software may read file contents from the project directory you choose, and capture the output of commands you (or the agent) run, and transmit that data over HTTPS to the **SuperAI server you explicitly configure** (the `--server` argument or `SUPERAI_SERVER` environment variable). That server is the only recipient of project data.

The software also:
- Serves a local workbench UI on `http://localhost:7000` (loopback only).
- Registers the `superai-local://` URL protocol so the web page can launch the CLI.

## What we do NOT do

SuperAI Local **does not**:
- Send your data to any party other than the SuperAI server you configured.
- Collect telemetry, analytics, or usage statistics.
- Phone home to the SuperAI Local maintainers.
- Bundle any third-party tracker, ad SDK, or analytics library.

## Local storage

SuperAI Local stores no persistent logs of file contents or command output on disk. Runtime state lives only in process memory for the duration of a session.

## Your control

You choose the work directory before any file is read. You can disconnect or uninstall at any time; uninstalling removes all installed files (the work directory, which is yours, is never deleted by the uninstaller).

## Third-party components

The packaged binary embeds the Node.js runtime (signed by the Node.js Foundation / OpenJS Foundation). Windows builds are code-signed by the [SignPath Foundation](https://signpath.org) free OSS program; the certificate reads "Open Source Developer, SignPath Foundation".

## Contact

Open an issue at https://github.com/Jay980911/superai-local/issues for privacy questions.
