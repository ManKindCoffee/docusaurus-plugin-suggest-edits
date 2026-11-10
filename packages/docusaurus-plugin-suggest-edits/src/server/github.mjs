import {describeSuggestion, branchName, repoFilePath} from './describe.mjs';

export function github({owner, repo, token, targetBranch, apiUrl = 'https://api.github.com'}) {
  const base = `${apiUrl}/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'docusaurus-plugin-suggest-edits',
    'Content-Type': 'application/json',
  };

  async function call(method, url, body) {
    const res = await fetch(url, {method, headers, body: body && JSON.stringify(body)});
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url}\n${res.status} ${text}`);
    return JSON.parse(text);
  }

  return {
    name: 'github',

    async submit(suggestion) {
      const {docPath, proposed, manifest} = suggestion;
      const branch = branchName(docPath);
      const path = repoFilePath(manifest, docPath).split('/').map(encodeURIComponent).join('/');
      const {title, body} = describeSuggestion(suggestion);

      // 1. Branch from the commit the site was built from
      await call('POST', `${base}/git/refs`, {ref: `refs/heads/${branch}`, sha: manifest.commit});

      // 2. Look up the file on that branch (GitHub needs its ID to update it)
      const file = await call('GET', `${base}/contents/${path}?ref=${encodeURIComponent(branch)}`);

      // 3. Commit the edit
      await call('PUT', `${base}/contents/${path}`, {
        message: title,
        content: Buffer.from(proposed, 'utf8').toString('base64'),
        sha: file.sha,
        branch,
      });

      // 4. Open the PR
      const pr = await call('POST', `${base}/pulls`, {title, head: branch, base: targetBranch, body});
      return {kind: 'pull-request', id: pr.number, url: pr.html_url};
    },
  };
}