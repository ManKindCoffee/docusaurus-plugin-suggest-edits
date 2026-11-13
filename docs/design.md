# docusaurus-plugin-suggest-edits — design

**Status:** v1.1 · as built for release 0.1.0, with the 0.2 plan · November 2026
**Package:** [`docusaurus-plugin-suggest-edits`](https://www.npmjs.com/package/docusaurus-plugin-suggest-edits) · MIT

This document records what was built, why, and what changed from the original draft. Section 10 sets out options for 0.2.

---

## 1. Problem

Docusaurus's built-in "Edit this page" sends readers to the Git host. That works for open-source projects on GitHub, where contributors have accounts and the repo is public. It fails for most organisational docs:

- The repo is private, so readers hit a sign-in or access-denied page
- Readers don't have, and shouldn't need, a Git account
- Non-developers don't know how to branch, commit or raise a pull request
- The usual fallback is a shared mailbox, which loses tracking and review

**Goal:** a reader edits the page in the portal, selects Submit, and the change lands with the docs team as a ready-to-review pull request. No Git account, no repo access, no email.

## 2. Prior art

| | Built-in `editUrl` | `@jlvandenhout/docusaurus-plugin-docs-editor` | This plugin |
|---|---|---|---|
| Git hosts | Any (link only) | GitHub only | GitHub and Azure DevOps, through pluggable adapters |
| Reader needs a Git account | Yes | Yes (GitHub OAuth and a fork) | No |
| Works with private repos | Only for people with access | Only for people with access | Yes |
| Output | Reader raises the PR themselves | PR from the reader's fork | PR raised by a service account |
| Maturity | Stable | Work in progress | 0.1.0, published |

## 3. Goals and non-goals

**Goals (all met in 0.1.0)**

- In-page editing of a page's Markdown, with a diff before submitting
- Server-side submission through a service account, so readers need no Git access
- Pluggable Git-host adapters
- Safe by default: prose-only changes, human review always required
- Works with any static host, through a small serverless or Node handler

**Non-goals**

- WYSIWYG editing
- Live MDX preview (custom components only render in a full site build)
- Editing generated pages, such as OpenAPI reference
- Multi-file suggestions
- Auto-merge, ever

## 4. How it works

```
Reader selects "Suggest an edit"
  → editor opens with the page's source, loaded from the build output
  → reader edits, reviews a line and word-level diff, adds an optional note, submits
  → POST /api/suggest-edit
  → handler: authenticate → rate-limit → validate (page allowed, build commit, size, prose-only)
  → adapter: branch from the build commit → commit the file → open a PR
  → reader sees "Thanks" with a link to the PR
  → docs team reviews; CI runs on the PR as normal
```

## 5. Architecture

### Repository

An npm workspaces monorepo:

```
packages/docusaurus-plugin-suggest-edits/   the published package
example/                                     demo site using the package, with an Azure Function
```

The example site installs the package through the workspace exactly as an outside user would from npm.

### Package entry points

| Import | Runs | Job |
|---|---|---|
| `docusaurus-plugin-suggest-edits` | Build time | Validates options; copies editable page sources to `build/_suggest/src/`; writes `build/_suggest/manifest.json` (build commit, uncommitted-changes flag, docs path in repo, editable files); registers the theme component |
| *(theme)* `EditThisPage` | Browser | Replaces Docusaurus's edit button on default docs pages with the editor; falls back to the original button elsewhere |
| `…/server` | Server | `createSuggestHandler`, `fileSource`, adapters, auth, rate limiter, prose guard, `handlerFromEnv` |
| `…/server/azure-functions` | Azure Functions | `registerSuggestEditFunction(app, {sourceDir})` |
| `…/server/node` | Node / Express | `createNodeHandler(handle, {allowedOrigins, trustProxy, path})` |

### Plugin options

```ts
['docusaurus-plugin-suggest-edits', {
  endpoint: '/api/suggest-edit',   // required
  docsDir: 'docs',
  exclude: ['glossary.mdx', 'changelog'],   // files or folders
  label: 'Suggest an edit',
  loginUrl: '/.auth/login/github',          // shown when the server returns 401
}]
```

Sites must give docs an `editUrl` (any value, for example `() => '#suggest-edit'`), because Docusaurus only renders the edit button when one exists.

### Server configuration

Environment variables, read by `handlerFromEnv`:

| Setting | Purpose |
|---|---|
| `SUGGEST_ADAPTER` | `azure-devops` (default) or `github` |
| `ADO_ORG`, `ADO_PROJECT`, `ADO_REPO`, `ADO_PAT`, `ADO_TARGET_BRANCH` | Azure DevOps adapter |
| `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN`, `GITHUB_TARGET_BRANCH` | GitHub adapter |
| `SUGGEST_AUTH` | `swa` for Static Web Apps sign-in; unset for anonymous |
| `SUGGEST_MAX_PER_HOUR`, `SUGGEST_GLOBAL_MAX_PER_HOUR` | Rate limits (defaults 10 and 50) |
| `SUGGEST_DEBUG` | `true` shows server errors to readers, for troubleshooting only |

Missing settings don't crash the server: readers see "Suggestions are not set up on this site yet" (503), and the log names what's missing.

### Adapter interface

```ts
interface Suggestion {
  docPath: string;      // relative to the docs folder
  permalink: string;
  proposed: string;
  note?: string;
  user: {id: string; name: string; provider: string} | null;
  manifest: {commit: string; docsPathInRepo: string | null; files: string[]};
}

interface SubmissionResult {
  kind: 'pull-request';
  id: string | number;
  url: string;
}

interface SubmissionAdapter {
  name: string;
  submit(suggestion: Suggestion): Promise<SubmissionResult>;
}
```

PR titles, descriptions and branch names come from a shared helper (`describe.mjs`), so every adapter produces identical PRs.

| Adapter | Calls |
|---|---|
| Azure DevOps | Pushes API (create branch from build commit and commit the file, in one call), then Pull Requests API |
| GitHub | Create ref from build commit → get file SHA on the branch → update file contents → create pull request |

### Hosting

**Azure Static Web Apps (reference deployment).** The site and the function share one address. Static Web Apps handles sign-in and enforces `allowedRoles` on `/api/*` before the function runs. Because Static Web Apps deploys the `api` folder on its own, the function is bundled with esbuild into `api/dist/`, and `build/_suggest` is copied into `api/_suggest` at build time, so each deploy carries a matching site and source.

**Node / Express.** `createNodeHandler` adds CORS (an allow-list of origins) and reads the request body. Sign-in is the host's responsibility.

## 6. Design decisions

| Decision | Reasoning |
|---|---|
| Load page source from the build output, not the Git host | Works with private repos and needs no token in the browser. Readers already see the rendered content, so publishing the source adds little |
| Branch from the build commit, not the tip of the target branch | The diff applies to exactly what the reader saw. If the file has changed since, the reviewer sees a conflict rather than an edit silently undoing newer work |
| Submit through a service account | The core of the idea: no Git account needed. The submitter is recorded in the PR description |
| Prose-only guard, always on | MDX can run code at build time. The server parses the original and the suggestion and rejects any change to frontmatter, ESM, JSX elements and attributes, or expressions. Text inside components stays editable |
| The guard must parse with the same syntax extensions as the site | Found in testing: without `remark-math`, LaTeX braces were read as JavaScript expressions and every maths edit was blocked. 0.1.0 enables `remark-math`; other extensions are a 0.2 item |
| The server uses its own copy of the original | The browser can't influence what the suggestion is compared against |
| Never auto-merge | Review is the safety net. Adopters are told to enforce it with a branch policy |
| Plugin replaces `EditThisPage` through its theme path; no swizzling | Confirmed in the spike. Non-docs pages (blog, other docs instances) fall back to the original component through `@theme-init/EditThisPage` |
| Editor is a modal with a plain textarea | Smallest bundle and simplest focus management. A code editor is a 0.2 option |
| Identity only from the Static Web Apps principal | It can be trusted only because Static Web Apps strips any client-sent `x-ms-client-principal`. Verified against a live deployment: a forged header was rejected with 401 |
| No shared-secret authentication | Anything sent by the browser is visible in the page's JavaScript, so a shared secret can't stay secret. Dropped from the draft |
| Rate limits in memory | Enough for one instance. A shared store is a 0.2 item |
| Build never fails for lack of Git | Outside a Git repo, or before the first commit, the build warns and the server refuses suggestions for that build (503) |
| Fresh public repo, separate from the development sandbox | Keeps test content and internal names out of the published history |

## 7. Security

- **No secrets in the browser.** Tokens live only in the server's environment
- **Minimum token scopes:** Azure DevOps Code (read and write); GitHub Contents and Pull requests (read and write), limited to one repository
- **Authentication:** Static Web Apps principal, or anonymous. `SUGGEST_AUTH=swa` must not be used on other hosts, because the header can be forged there
- **Abuse limits:** per-submitter and overall hourly limits; request and edit size caps; one file per submission. `X-Forwarded-For` is ignored unless `trustProxy` is set
- **Path safety:** only pages listed in the build manifest are accepted, so excluded files and paths outside the docs folder are refused
- **Content safety:** the prose-only guard; reviewers still see the full diff
- **Error handling:** unexpected errors return a generic message unless `SUGGEST_DEBUG` is set
- **Reporting:** private vulnerability reporting on the GitHub repository

## 8. Changes from the original draft

| Draft | As built | Why |
|---|---|---|
| Azure DevOps first; GitHub later | Both in 0.1.0 | Most Docusaurus sites are on GitHub, so the plugin wasn't worth publishing without it |
| `docsPluginIds` option for multiple docs instances | Default docs instance only | Kept 0.1.0 small; the fallback keeps other instances working normally |
| `allowedChanges: 'prose' \| 'any'` | Guard always on | No adopter yet needs to turn it off; safer to ship without an opt-out |
| Optional work item alongside the PR | PR only | Deferred to 0.2 |
| Reviewers set by the adapter | Not built | Branch policies on the Git host cover this; adapter support is a 0.2 option |
| Shared-secret authentication | Dropped | Can't be kept secret in a browser |
| Separate `adapters/*` entry points | All under `…/server` | Fewer import paths to document |
| Express wrapper | `createNodeHandler`, which also works as an Express route | One helper instead of two |
| Docs site dogfooding the plugin | README and example site | A docs site wasn't needed for a first release |
| Plugin files only | Plus `…/server/azure-functions` helper | Users would otherwise copy the same wrapper code |

## 9. Known limitations (0.1.0)

- One file per suggestion
- Plain text editor; no live preview
- Default docs instance only; versioned docs aren't supported
- Rate limits are in memory: they reset on restart and aren't shared between serverless instances
- The guard understands standard MDX, frontmatter and `remark-math`; pages using other syntax extensions may be refused as unparseable
- The editor needs a production build (`docusaurus build`), not the dev server
- The build commit must be pushed to the Git host before readers submit
- No automated tests for the browser component yet; the server has unit tests and CI on Node 20 and 22

---

## 10. Options for 0.2

Grouped by what they do for adoption. Effort is in working days.

### A. Easier to trust and adopt

| # | Item | Effort | Notes |
|---|---|---|---|
| A1 | **Publish from GitHub Actions with provenance** | 0.5 | npm shows the package was built from this repo. Uses trusted publishing, so no npm token is stored |
| A2 | **TypeScript types** | 1 | Typed plugin options and server API. Docusaurus configs are usually TypeScript, so this helps everyone |
| A3 | **Live demo** | 1 | Host the example site with a `demo` adapter that returns a fake PR, so people can try the editor without anything real being created |
| A4 | **Browser tests** | 1–2 | Playwright tests for open, edit, review, submit, rejection and excluded pages, run in CI against the example site |
| A5 | **No personal access tokens** | 1–2 | The Azure DevOps adapter gets a short-lived Microsoft Entra token for a managed identity, so there's nothing to rotate and no token tied to a person. Needs the server in an Azure Functions app (linked to Static Web Apps, or on its own) rather than Static Web Apps' built-in functions. A local option uses the Azure CLI sign-in for testing. GitHub gets the equivalent through a GitHub App (may follow in 0.3). PATs stay supported for simple setups |

### B. Fits more teams

| # | Item | Effort | Notes |
|---|---|---|---|
| B1 | **Reviewers on PRs** | 0.5 | `SUGGEST_REVIEWERS` for GitHub users and teams, and Azure DevOps groups. Helps teams without branch policies |
| B2 | **Webhook adapter** | 0.5 | Sends the suggestion as JSON to a URL, so teams can route it to Slack, Jira, ServiceNow or their own tooling |
| B3 | **GitLab adapter** | 1 | Same flow as GitHub through GitLab's API |
| B4 | **Work items and issues** | 1–2 | Optional Azure DevOps work item linked to the PR, or a GitHub issue. For teams that plan on boards |
| B5 | **Translatable editor text** | 0.5 | Use Docusaurus's `translate()` for every string, so non-English sites work properly |

### C. Removes current limitations

| # | Item | Effort | Notes |
|---|---|---|---|
| C1 | **Guard follows the site's Markdown plugins** | 1–2 | Let the server take the same remark plugins as the site, so pages with other syntax extensions can be edited |
| C2 | **Multiple docs instances and versioned docs** | 2–3 | Per-instance manifests; versioned docs edit the versioned file |
| C3 | **Shared rate-limit store** | 1 | A small store interface, with Azure Table Storage and Redis implementations |
| C4 | **CAPTCHA for anonymous sites** | 1–2 | Cloudflare Turnstile, verified on the server |
| C5 | **Code editor** | 1–2 | CodeMirror with Markdown highlighting, loaded only when the editor opens so pages stay light |

### D. Lighter setup

Added after the first round of community feedback, which named the setup cost (a server, a write-scoped token, and Azure Static Web Apps in the recommended setup) as the main barrier.

| # | Item | Effort | Notes |
|---|---|---|---|
| D1 | **Netlify and Vercel functions** | 1–2 | Thin wrappers around the existing handler, like the Azure Functions helper, with "Deploy" buttons in the README |
| D2 | **10-minute quick-start** | 0.5 | The most common case first: a GitHub repo, a free serverless host, anonymous submissions with rate limits. Azure becomes one hosting option among several |

### Suggested scope for 0.2

**A5 (Azure DevOps half), D1, D2, A1 and A2: about 5 days.**

- **A5** removes personal access tokens for Azure DevOps teams, which is the most common objection from security teams
- **D1 and D2** answer the community feedback directly: the plugin shouldn't look Azure-only, and trying it shouldn't take an afternoon
- **A1 and A2** are small and help with trust

**For 0.3:** the GitHub App half of A5; A3 live demo; B1 reviewers and B2 webhook; then C1 and C2, which lift the biggest functional limits. A4 should land before any larger refactor.

The order is worth revisiting as feedback comes in through the Docusaurus Discussions post and npm downloads: real users asking for something beats this guesswork.

### Feedback so far

| Source | Feedback | Response |
|---|---|---|
| Awesome Docusaurus (declined, November 2026) | Too new; needs a server, a write-scoped token and Azure Static Web Apps | A5, D1 and D2 in 0.2. Resubmit after a few releases and real-world use |
| Docusaurus community resources (closed, November 2026) | Third-party projects are no longer listed; use GitHub Discussions instead | Present the project in the 🧩 Plugins, Themes, Presets and Libs Discussions category, and post an update there for each release |
