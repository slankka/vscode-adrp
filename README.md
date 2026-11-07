# ADR Proposals

Browse architecture decision records and proposals in a VS Code sidebar. Select an entry to open its Markdown file at the proposal heading. The extension supports proposal IDs such as `DBIP-001`, `ADR-001`, and `RFC-001`.

The extension UI is available in English and Simplified Chinese. The interface follows the VS Code display language.

## Features

- Scan proposal files matching `<prefix>-*.md` and group them by status.
- Quick-open proposals by ID or title.
- Create a proposal with the next available ID and a Markdown scaffold.
- Validate proposal headings, metadata, statuses, empty sections, evidence, and review dates.
- Preview references and backlinks in proposal tooltips.
- Generate a relationship report at `develop/plans/OVERVIEW.md`.
- Use Markdown snippets: `adrp-meta`, `adrp-evidence`, and `adrp-skeleton`.
- Open, refresh, or create proposals from the sidebar and Explorer context menus.

## Configuration

Repository conventions belong in the workspace `.vscode/settings.json` file:

```json
{
  "adrp.idPrefix": "DBIP",
  "adrp.titlePrefix": ""
}
```

| Setting | Default | Description |
|---|---|---|
| `adrp.idPrefix` | `DBIP` | ID prefix used for file matching, parsing, numbering, and validation. |
| `adrp.titlePrefix` | `""` | Dynamic view-title text. Empty follows `adrp.idPrefix`. |
| `adrp.include` | `[]` | Workspace-relative file globs. Empty uses `**/<idPrefix>-*.md`. |
| `adrp.exclude` | History, output, archived, node_modules | Workspace-relative globs excluded from scanning. |
| `adrp.groupByStatus` | `true` | Group proposals by status. |
| `adrp.showStatusInDescription` | `true` | Show status alongside proposal titles. |
| `adrp.statusAliases` | `{}` | Map team-specific status values to Draft, Ready, Implemented, or Archived. |
| `adrp.lintEnabled` | `true` | Validate open proposal files. |
| `adrp.plansDir` | `develop/plans` | Directory used by proposal and index commands. |

For example, set `adrp.idPrefix` to `ADR` to use files such as `ADR-001-example.md`. Set `adrp.include` to scan multiple ID prefixes. The parser uses only the configured `adrp.idPrefix`.

## Commands

- `ADR Proposals: Quick Open Proposal`
- `ADR Proposals: Refresh Proposals`
- `ADR Proposals: Open Proposal Index`
- `ADR Proposals: New Proposal`
- `ADR Proposals: Generate Relationship Overview`

## Development

```bash
cd tools/vscode-adrp
npm install
npm test
npm run build
```

Press `F5` to launch an Extension Development Host. To create and install a VSIX locally:

```bash
npx @vscode/vsce package
code --install-extension adrp-proposals-0.4.0.vsix --force
```

Run `npm run test:integration` to exercise the extension in a real VS Code instance. Set `VSCODE_EXECUTABLE_PATH` to select a different VS Code executable.

The full Chinese documentation is included in `README.zh-cn.md`.
