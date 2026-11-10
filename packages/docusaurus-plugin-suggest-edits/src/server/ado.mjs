import {describeSuggestion, branchName, repoFilePath} from './describe.mjs';

export function azureDevOps({org, project, repo, pat, targetBranch}) {
  const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}`;
  const api = `${base}/_apis/git/repositories/${repo}`;
  const headers = {
    Authorization: 'Basic ' + Buffer.from(':' + pat).toString('base64'),
    'Content-Type': 'application/json',
  };

  async function call(method, url, body) {
    const res = await fetch(url, {method, headers, body: body && JSON.stringify(body)});
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url}\n${res.status} ${text}`);
    return JSON.parse(text);
  }

  return {
    name: 'azure-devops',

    async submit(suggestion) {
      const {docPath, proposed, manifest} = suggestion;
      const branch = branchName(docPath);
      const {title, body} = describeSuggestion(suggestion);

      // Create the branch from the build commit and commit the edit, in one call
      await call('POST', `${api}/pushes?api-version=7.1`, {
        refUpdates: [{name: `refs/heads/${branch}`, oldObjectId: manifest.commit}],
        commits: [{
          comment: title,
          changes: [{
            changeType: 'edit',
            item: {path: `/${repoFilePath(manifest, docPath)}`},
            newContent: {content: proposed, contentType: 'rawtext'},
          }],
        }],
      });

      const pr = await call('POST', `${api}/pullrequests?api-version=7.1`, {
        sourceRefName: `refs/heads/${branch}`,
        targetRefName: `refs/heads/${targetBranch}`,
        title,
        description: body,
      });

      return {kind: 'pull-request', id: pr.pullRequestId, url: `${base}/_git/${repo}/pullrequest/${pr.pullRequestId}`};
    },
  };
}