# docusaurus-plugin-suggest-edits

Let readers suggest edits to your Docusaurus docs from the page itself. They edit the Markdown, review a diff and submit. The change arrives with your team as a pull request, ready to review.

Readers don't need a Git account, access to your repository or any Markdown knowledge.

> **Status: early (0.x).** Used in production-like testing on Azure Static Web Apps with GitHub and Azure DevOps. Expect some changes before 1.0.

---

## Why

Docusaurus's built-in "Edit this page" link sends readers to your Git host. That works for open-source projects on GitHub, where contributors have accounts and the repository is public. It doesn't work when:

- the repository is private, so readers hit a sign-in or access-denied page
- readers don't have, and shouldn't need, a Git account
- readers aren't developers and don't know how to branch, commit or open a pull request

The usual fallback is a shared mailbox, where suggestions lose their tracking and their review trail.

## How it works

```
Reader selects "Suggest an edit"
  → an editor opens with the page's Markdown
  → reader edits, reviews the diff, adds an optional note and submits
  → your server checks the request (sign-in, rate limits, allowed pages, prose-only changes)
  → it opens a pull request using a service account
  → your team reviews it like any other PR; your CI runs as normal
```

The plugin has two halves:

| Part | Runs | Does |
|---|---|---|
| **Plugin** | At build time and in the browser | Publishes each page's source with the site, and adds the editor to doc pages |
| **Server** | In a serverless function or any Node server | Validates suggestions and opens pull requests through an adapter |

## Features

- In-page editor with a line and word-level diff before submitting
- Pull requests opened by a service account, so readers need no repository access
- Adapters for **GitHub** and **Azure DevOps**
- Branches start from the exact commit the site was built from, so a suggestion never overwrites newer changes. Conflicts show up in review
- **Prose-only guard**: readers can change text, but not frontmatter, imports, components or `{…}` expressions
- Optional sign-in through Azure Static Web Apps, with the submitter recorded on the pull request
- Rate limits per submitter and overall
- Drafts allow users to access a sign-in page while temporarily abandoning their edit
- Excluded pages show no button at all

## Requirements

- Docusaurus 3
- Node.js 20 or later
- A GitHub or Azure DevOps repository containing the site
- Somewhere to run the server: Azure Static Web Apps (recommended), or any Node.js host

---

## 1. Install

```bash
npm install docusaurus-plugin-suggest-edits
```

## 2. Configure the plugin

In `docusaurus.config.ts`:

```ts
export default {
  presets: [
    [
      'classic',
      {
        docs: {
          // Docusaurus only renders the edit button when a page has an editUrl.
          // The plugin replaces the button, so this value is never used.
          editUrl: () => '#suggest-edit',
        },
      },
    ],
  ],

  plugins: [
    [
      'docusaurus-plugin-suggest-edits',
      {
        endpoint: '/api/suggest-edit',
        exclude: ['glossary.mdx', 'changelog'],
      },
    ],
  ],
};
```

### Options

| Option | Default | Description |
|---|---|---|
| `endpoint` | *(required)* | Where the browser sends suggestions. Use a relative path (`/api/suggest-edit`) when the server shares the site's address, as with Static Web Apps |
| `docsDir` | `'docs'` | The docs folder, relative to the site |
| `exclude` | `[]` | Pages that can't be edited. Each entry is a file (`'glossary.mdx'`) or a folder (`'changelog'`), relative to `docsDir` |
| `label` | `'Suggest an edit'` | Button text |
| `loginUrl` | `null` | Sign-in page to link to when the server requires sign-in, for example `'/.auth/login/github'` |

When you run `docusaurus build`, the plugin writes `build/_suggest/`: a copy of each editable page's source, and a `manifest.json` recording the commit the site was built from.

> **Build from a clean commit that has been pushed.** Suggestions branch from the commit in the manifest, so your Git host must already have it. The manifest includes an `uncommittedChanges` flag to help you spot a build made from unsaved work.

> **The editor only works on a production build.** `docusaurus start` doesn't produce the page source. Use `docusaurus build` and `docusaurus serve` to try it locally.

## 3. Configure the server

The server reads its settings from environment variables.

### Choose an adapter

| Setting | Description |
|---|---|
| `SUGGEST_ADAPTER` | `github` or `azure-devops` (default) |

**GitHub**

| Setting | Description |
|---|---|
| `GITHUB_OWNER` | User or organisation that owns the repository |
| `GITHUB_REPO` | Repository name |
| `GITHUB_TOKEN` | Fine-grained personal access token, limited to this repository, with **Contents: Read and write** and **Pull requests: Read and write** |
| `GITHUB_TARGET_BRANCH` | Branch that pull requests target, for example `main` |

**Azure DevOps**

| Setting | Description |
|---|---|
| `ADO_ORG` | Organisation name |
| `ADO_PROJECT` | Project name |
| `ADO_REPO` | Repository name |
| `ADO_PAT` | Personal access token with **Code: Read and write** only |
| `ADO_TARGET_BRANCH` | Branch that pull requests target, for example `main` |

Use a dedicated service account for the token where you can, so pull requests are clearly marked as reader suggestions.

### Sign-in and limits

| Setting | Default | Description |
|---|---|---|
| `SUGGEST_AUTH` | *(unset)* | `swa` requires sign-in through Azure Static Web Apps. Unset means anyone can submit |
| `SUGGEST_MAX_PER_HOUR` | `10` | Suggestions per submitter per hour (by user, or by IP address when anonymous) |
| `SUGGEST_GLOBAL_MAX_PER_HOUR` | `50` | Suggestions per hour across everyone |
| `SUGGEST_DEBUG` | *(unset)* | `true` shows server errors to readers. **For troubleshooting only** |

If a required setting is missing, readers see "Suggestions are not set up on this site yet" and the server log names the missing settings.

## 4. Deploy the server

### Option A: Azure Static Web Apps (recommended)

Static Web Apps hosts the site and the function at the same address and handles sign-in in front of the function.

**`api/src/functions/suggestEdit.mjs`**

```js
import {app} from '@azure/functions';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerSuggestEditFunction} from 'docusaurus-plugin-suggest-edits/server/azure-functions';

// This file is bundled into api/dist/, so the path is relative to there
const here = path.dirname(fileURLToPath(import.meta.url));
registerSuggestEditFunction(app, {sourceDir: path.join(here, '../_suggest')});
```

**`api/package.json`**

```json
{
  "name": "api",
  "private": true,
  "type": "module",
  "main": "dist/*.mjs",
  "dependencies": {
    "@azure/functions": "^4"
  }
}
```

**Bundle the function and copy the page source into it.** Static Web Apps deploys the `api` folder on its own, so it can't see your site's `node_modules` or build output. Bundling with [esbuild](https://esbuild.github.io/) keeps the deploy to one file:

```js
// scripts/build-api.mjs
import {build} from 'esbuild';

await build({
  entryPoints: ['api/src/functions/*.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outdir: 'api/dist',
  outExtension: {'.js': '.mjs'},
  external: ['@azure/functions'],
  banner: {js: "import {createRequire} from 'node:module'; const require = createRequire(import.meta.url);"},
});
```

```json
"scripts": {
  "build:swa": "docusaurus build && rm -rf api/_suggest && cp -R build/_suggest api/_suggest && node scripts/build-api.mjs"
}
```

**`static/staticwebapp.config.json`** (Docusaurus copies `static/` to the root of the build):

```json
{
  "routes": [
    {"route": "/api/*", "allowedRoles": ["authenticated"]}
  ],
  "platform": {
    "apiRuntime": "node:20"
  }
}
```

The route rule means only signed-in readers can submit. Set `SUGGEST_AUTH=swa` and `loginUrl` to match your sign-in provider, for example `/.auth/login/github` or `/.auth/login/aad`.

Add the server settings under **Settings → Environment variables** in the Azure portal, then deploy `build` with `api` as the API location.

### Option B: Node.js or Express

Run the handler on any Node host. It needs access to the site's `build/_suggest` folder.

```js
import http from 'node:http';
import {handlerFromEnv} from 'docusaurus-plugin-suggest-edits/server';
import {createNodeHandler} from 'docusaurus-plugin-suggest-edits/server/node';

const handler = createNodeHandler(handlerFromEnv(process.env, 'build/_suggest'), {
  allowedOrigins: ['https://docs.example.com'],
});

http.createServer(handler).listen(3100);
```

`createNodeHandler` options:

| Option | Default | Description |
|---|---|---|
| `allowedOrigins` | `[]` | Site addresses allowed to call the server from the browser (CORS) |
| `path` | `'/api/suggest-edit'` | Request path to handle |
| `trustProxy` | `false` | Use `X-Forwarded-For` for the reader's IP address. **Only enable behind a proxy you control**, or readers can fake it to dodge rate limits |

Sign-in through `SUGGEST_AUTH=swa` only works behind Azure Static Web Apps. On other hosts, leave it unset and rely on rate limits, or put the handler behind your own authentication.

### Advanced: build your own handler

Everything is available from `docusaurus-plugin-suggest-edits/server`:

```js
import {
  createSuggestHandler, // the core request handler
  fileSource,           // reads build/_suggest
  github, azureDevOps,  // adapters
  anonymous, staticWebAppsAuth, // authentication
  createRateLimiter,
  checkProseOnly,
} from 'docusaurus-plugin-suggest-edits/server';
```

An adapter is an object with a `submit(suggestion)` method that returns `{kind, id, url}`, so you can add your own Git host or send suggestions somewhere else.

---

## Security

- **No secrets in the browser.** Tokens live only in the server's environment.
- **Readers act through a service account**, with the minimum permissions listed above. The submitter is recorded in the pull request description.
- **Only listed pages can be edited.** The server accepts a page only if it appears in the build manifest, so excluded files and paths outside the docs folder are refused.
- **Prose-only guard.** MDX can run code at build time. The server parses the original and the suggestion and rejects any change to frontmatter, imports and exports, components and their settings, or `{…}` expressions. Text inside components stays editable.
- **The server uses its own copy of the original page**, not one sent by the browser.
- **Sign-in identity is only trusted behind Azure Static Web Apps.** Static Web Apps strips any `x-ms-client-principal` header a browser sends and adds its own. Anywhere else, that header can be forged, so `SUGGEST_AUTH=swa` must not be used.
- **Nothing merges automatically.** Protect your target branch with a policy that requires review.

Please report security issues privately through GitHub security advisories on this repository.

## Limitations

- One file per suggestion
- Plain text editor, with no live preview (MDX components only render in a full site build)
- Only the default docs instance gets the editor. Blog posts and other docs instances keep Docusaurus's normal "Edit this page" link. Versioned docs aren't supported yet
- Rate limit counts are held in memory, so they reset when the server restarts and aren't shared between serverless instances
- The prose-only guard understands standard MDX, frontmatter and maths (`remark-math`). Pages using other syntax extensions may be refused as unparseable

## Roadmap

- GitLab and generic webhook adapters
- CAPTCHA for anonymous submissions
- Shared store for rate limits
- Versioned docs and multiple docs instances
- Matching the guard to each site's own Markdown plugins

## Licence

MIT
