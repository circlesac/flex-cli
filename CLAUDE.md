# flex-cli

CLI for Flex HR (flex.team). Extracts Comet browser cookies to authenticate with the Flex API.

## Development

```bash
bun install          # install dependencies
bun run src/index.ts # run flexhr CLI
```

## Architecture

- **Auth**: Extracts cookies from Comet browser (Chromium-based), decrypts AES-128-CBC encrypted cookies using macOS Keychain password
- **API**: Uses flex.team REST API with extracted cookies (JSESSIONID, AID JWT, DEVICE_ID)
- **Storage**: Credentials stored at ~/.config/flex/credentials.json

## Conventions

- Commands use `citty` `defineCommand` with `commonArgs` from `src/lib/args.ts`
- Use `loadCredentials()` / `requireCredentials()` for auth
- Use `handleError(error)` in catch blocks
- Use `printOutput` / `getOutputFormat` for `--json` / `--plain` support
- Only dependency is `citty` — uses Bun built-in `bun:sqlite` and `node:crypto`
