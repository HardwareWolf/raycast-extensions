# Quick References

Raycast extension for searching [Fechin/reference](https://github.com/Fechin/reference) cheat sheets, sections, and commands. It downloads the dataset on first launch, caches it locally, supports in-reference search, and provides command-aware copy actions.

## Features

- **First-run download**: Fetches the upstream dataset on first launch and reuses a local cache afterwards
- **Reference search**: Search across titles, tags, headings, summaries, and snippets
- **Global command search**: Search commands, code blocks, and section matches across the full dataset
- **In-reference search**: Open any reference and search inside it by section or command
- **Command-aware copy**: Copy commands with or without shell prompts
- **Favorites and recents**: Keep important references close at hand
- **Manual refresh**: Rebuild the dataset from GitHub whenever you want

## Commands

- **Search References**: Browse references and open a searchable section browser
- **Search Commands**: Search commands, snippets, and section matches across all references
- **Update References**: Download and rebuild the latest dataset from GitHub

## Keyboard Shortcuts

- `⌘F`: Toggle favorite
- `⌘⇧U`: Update references from action panels
- Standard Raycast copy/open actions remain available in the action panel

## Permissions

- `network`: Used to download fresh reference data from GitHub
- `filesystem`: Used to store the cached dataset locally after the first download

## Development

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

## License

MIT
