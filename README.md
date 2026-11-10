# docusaurus-plugin-suggest-edits

Let readers suggest edits to your Docusaurus docs from the page itself. They edit, review a diff and submit, and the change arrives as a pull request on **GitHub** or **Azure DevOps**. Readers don't need a Git account or access to your repository.

**→ [Full documentation](packages/docusaurus-plugin-suggest-edits/README.md)**

## What's in this repo

| Folder | Contents |
|---|---|
| [`packages/docusaurus-plugin-suggest-edits`](packages/docusaurus-plugin-suggest-edits) | The plugin, published to npm |
| [`example`](example) | A small Docusaurus site using the plugin, with an Azure Static Web Apps function |

## Working on the plugin

```bash
npm install            # installs the plugin and the example site together
npm test               # runs the plugin's tests
npm run build:example  # builds the example site
```

To try the editor locally, see the example site's [README](example/README.md).

## Licence

[MIT](LICENSE)
