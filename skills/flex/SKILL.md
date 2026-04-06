---
name: flex
description: CLI for Flex HR (flex.team) — manage authentication, look up users, browse org structure, and handle approval documents
---

# flex CLI

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
flex auth login       # Extract cookies from Comet browser and save credentials
flex auth status      # Show current authentication status
flex auth logout      # Remove stored credentials
```

Credentials are stored at `~/.config/flex/credentials.json`.

### Current User

```bash
flex me               # Show current user info (name, company, IDs)
flex me --json        # JSON output
```

### User Lookup

```bash
flex user <query>             # Look up user by email or name
flex user john@example.com    # Exact email match
flex user "John Doe"          # Name match
flex user john                # Partial match (email prefix or name substring)
flex user <query> --json      # JSON output
```

### Users

```bash
flex users list               # List all users
flex users list --json        # JSON output
flex users search <query>     # Search users by name or email
```

### Organization

```bash
flex org                      # Show org tree grouped by department
flex org --flat               # Flat department list instead of tree
flex org --members            # Show individual member names under each department
flex org --json               # JSON output
```

### Approval Documents

```bash
flex docs list                # List approval documents
flex docs get <id>            # Get a specific document
flex docs templates           # List document templates
```

## Common Flags

All commands support:
- `--json` — JSON output
- `--plain` — Plain text output (tab-separated, for piping)
