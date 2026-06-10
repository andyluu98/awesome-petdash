# awesome-petdash

A tiny **desktop pet** that lives on your screen, keeps you company, and **monitors your AI coding agents** in real time — now with a built-in **Claude Code quota meter** right on the pet.

> **Fork notice.** This project is a fork of **[OpenPets](https://github.com/alvinunreal/openpets)** (by alvinunreal / Boring Dystopia Development), licensed under MIT. The original copyright is retained — see [LICENSE](LICENSE) and [NOTICE](NOTICE). This repo adds the quota meter and extra agent integrations on top.

---

## What this fork adds

### 🔋 Claude Code quota on your pet
A small label that sits with your pet and shows your **Claude Code subscription usage**:

```
84% · reset 11m
12% · reset Thu 13h45m
```

- **Line 1 = 5-hour window**, **line 2 = 7-day window**
- Shows **% used** and a **countdown to reset** (a weekday like `Thu` appears when the reset falls on another day)
- Three display modes — pick in **Control Center → settings → "Claude quota display"**:
  - **Label** — always-on label by the pet
  - **Speech** — the pet says your quota now and then
  - **Mood** — the pet's mood reflects how much quota is left
- Reads Anthropic's official OAuth usage endpoint. **Rate-limit safe**: the API is polled at most every 5 minutes (with backoff), while the countdown ticks every minute locally — no extra requests, and it never burns your quota (it's a usage *check*, not a model call).

### 🤖 More agent integrations
One-click MCP setup in **Control Center → Integrations** for:

| Agent | Config written |
|-------|----------------|
| Claude Code | `~/.claude` (hooks + MCP) |
| Cursor | `~/.cursor/mcp.json` |
| OpenCode | `~/.opencode/opencode.jsonc` |
| **OpenAI Codex** *(new)* | `~/.codex/config.toml` |
| **Google Antigravity** *(new)* | `~/.gemini/config/mcp_config.json` |

> Note: the quota meter is **Claude Code–specific** (it uses Anthropic's usage API). Codex and Antigravity are integrated so the pet can **react to their activity** via MCP.

---

## Install (Windows)

Download and run one of:

- **`OpenPets-*-win-x64-setup.exe`** — installer
- **`OpenPets-*-win-x64-portable.exe`** — run without installing

On first launch a pet appears. To show the quota meter, open the **Control Center** (right-click the pet → *Open Control Center*) → **settings** → set **Claude quota display** to *Label* (or Speech / Mood).

To connect a coding agent, go to **Integrations**, pick your agent (Claude / Cursor / OpenCode / Codex / Antigravity) and click **Install**.

Other QoL options already built in: **open at login** (auto-launch) and your quota display mode is remembered between restarts.

---

## Build from source

Requires Node 18+ (tested on 25) and pnpm.

```bash
pnpm install
pnpm --filter @open-pets/desktop build      # build main + renderer
pnpm --filter @open-pets/desktop package     # produce installers in apps/desktop/dist-electron
```

Run in dev:

```bash
cd apps/desktop
pnpm exec electron .
```

---

## Project layout

```
apps/desktop          Electron app (main process + React Control Center)
  src/claude-quota.ts        quota fetcher (Anthropic OAuth usage + cache fallback)
  src/default-pet-controller.ts  quota polling + display modes
  src/pet-window.ts          pet rendering + quota label
packages/claude|cursor|opencode|codex|antigravity   per-agent MCP setup
packages/mcp          shared MCP server the pet listens on
```

---

## Credits & license

- Original project: **[OpenPets](https://github.com/alvinunreal/openpets)** by alvinunreal (Boring Dystopia Development) — MIT.
- This fork: additional features by the awesome-petdash contributors — MIT.

Licensed under the **MIT License**. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
