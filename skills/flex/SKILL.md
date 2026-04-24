---
name: flexhr
description: CLI for Flex HR (flex.team) — manage authentication, look up users, browse org structure, upload files, list/get/submit approval documents
---

# flexhr CLI

CLI for interacting with Flex HR (flex.team). Authenticates by extracting cookies from the macOS default browser (auto-detected via LaunchServices; falls back to any installed Chromium browser — Chrome, Comet, Arc, Edge, Brave, Chromium).

## Installation

```bash
brew install circlesac/tap/flex-cli    # Homebrew
npm install -g @circlesac/flex         # npm
curl -fsSL https://github.com/circlesac/flex-cli/releases/latest/download/install.sh | sh  # direct
```

## Commands

### Authentication

```bash
flexhr auth login                       # Extract cookies from the default browser and save credentials
flexhr auth login --browser chrome      # Force a specific browser (chrome, comet, arc, edge, brave, chromium)
flexhr auth status                      # Show current authentication status
flexhr auth logout                      # Remove stored credentials
```

Credentials are stored at `~/.config/flex/credentials.json`. The AID JWT is a session token that expires; re-run `auth login` after logging back in to flex.team in the browser.

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

### File Upload

```bash
flexhr upload <file>                    # pre-signed S3 upload → verify → content-file convert → prints final URL
flexhr upload <file> --no-convert       # stop at temporary fileKey (raw use cases)
flexhr upload <file> --mime image/png   # override auto-detected MIME
flexhr upload <file> --source <type>    # override sourceType (default: WORKFLOW_IN_EDITOR_FILE)
```

The final `url` (e.g. `https://flex.team/api/v2/file/files/<key>`) can be embedded directly into an approval-document `content` HTML as `<img src="...">`.

### Approval Documents

```bash
flexhr docs list                                # List approval documents (default status: IN_PROGRESS)
flexhr docs list --status DONE                  # Filter by status
flexhr docs list --template <templateKey>       # Filter by template
flexhr docs list --keyword "체력"               # Search by keyword
flexhr docs get <documentKey>                   # Get a specific document
flexhr docs templates                           # List document templates
flexhr docs submit --payload <file.json>        # Submit an approval document from a payload JSON
flexhr docs submit --payload <file.json> --dry-run   # Create draft only, don't submit
flexhr docs drafts                              # List current user's draft (temp-saved) documents
flexhr docs delete <documentKey>                # Delete a draft documentKey (cleanup)
```

#### `docs submit` payload format

```json
{
  "document": {
    "templateKey": "...",
    "title": "...",
    "content": "...(HTML; image URLs from prior docs can be reused here)...",
    "inputs": [
      { "inputFieldIdHash": "...", "value": "..." }
    ],
    "attachments": []
  },
  "approvalProcess": {
    "lines": [
      { "step": 0, "actors": [{ "resolveTarget": { "type": "USER", "value": "<userIdHash>" } }] }
    ],
    "referrers": [],
    "option": { "approvalStepEditEnabled": false }
  }
}
```

The CLI auto-populates `approvalProcess.matchingData` by calling `resolve-policy`, generates a new `documentKey`, creates the draft, and submits. To look up `inputFieldIdHash` values and the template key, use `docs get <existing-documentKey>` on a prior document written from the same template.

## Common Flags

All commands support:
- `--json` — JSON output
- `--plain` — Plain text output (tab-separated, for piping)
