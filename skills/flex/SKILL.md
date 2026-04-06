---
name: flexhr
description: CLI for Flex HR (flex.team) — manage authentication, look up users, browse org structure, and handle approval documents
---

# flexhr CLI

CLI for interacting with Flex HR (flex.team). Authenticates by extracting cookies from Comet browser (Chromium-based) via macOS Keychain.

## Installation

```bash
brew install circlesac/tap/flex-cli    # Homebrew
npm install -g @circlesac/flex         # npm
curl -fsSL https://github.com/circlesac/flex-cli/releases/latest/download/install.sh | sh  # direct
```

## Commands

### Authentication

```bash
flexhr auth login       # Extract cookies from Comet browser and save credentials
flexhr auth status      # Show current authentication status
flexhr auth logout      # Remove stored credentials
```

Credentials are stored at `~/.config/flex/credentials.json`.

### Current User

```bash
flexhr me               # Show current user info (name, company, IDs)
flexhr me --json        # JSON output
```

### User Lookup

```bash
flexhr user <query>             # Look up user by email or name
flexhr user john@example.com    # Exact email match
flexhr user "John Doe"          # Name match
flexhr user john                # Partial match (email prefix or name substring)
flexhr user <query> --json      # JSON output
```

### Users

```bash
flexhr users list               # List all users
flexhr users list --json        # JSON output
flexhr users search <query>     # Search users by name or email
```

### Organization

```bash
flexhr org                      # Show org tree grouped by department
flexhr org --flat               # Flat department list instead of tree
flexhr org --members            # Show individual member names under each department
flexhr org --json               # JSON output
```

### Approval Documents

```bash
flexhr docs list                # List approval documents
flexhr docs get <id>            # Get a specific document
flexhr docs templates           # List document templates
```

## Common Flags

All commands support:
- `--json` — JSON output
- `--plain` — Plain text output (tab-separated, for piping)
