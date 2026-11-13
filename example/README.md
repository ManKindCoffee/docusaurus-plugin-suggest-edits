# Example site

A small Docusaurus site using `docusaurus-plugin-suggest-edits`, with an Azure Function for Azure Static Web Apps.

Install from the repository root first: `npm install`.

## Try it locally with the Node server

1. Copy `.env.example` to `.env` and fill in the settings for GitHub or Azure DevOps.

   > For Azure DevOps without a token, set `ADO_AUTH=azure-cli` and run `az login` first.

2. Commit and push, so your Git host has the commit the site is built from.
3. In one terminal, start the server:

   ```bash
   node --env-file=.env server/suggest-server.mjs
   ```

4. In another, build and serve the site:

   ```bash
   SUGGEST_ENDPOINT=http://localhost:3100/api/suggest-edit npm run build
   npm run serve
   ```

5. Open a doc page and select **Suggest an edit**.

## Try it with Azure Static Web Apps

1. Copy `api/local.settings.example.json` to `api/local.settings.json` and fill it in.
2. Install the function's packages: `cd api && npm install`.
3. Build and start the emulator:

   ```bash
   npm run build:swa
   npx @azure/static-web-apps-cli start build --api-location api
   ```

4. Open `http://localhost:4280`. Sign-in uses the emulator's test login page.

To deploy, see the plugin's [documentation](../packages/docusaurus-plugin-suggest-edits/README.md#option-a-azure-static-web-apps-recommended).
