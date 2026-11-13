import {describeSuggestion, branchName, repoFilePath} from './describe.mjs';

// Authenticate with either a personal access token (pat) or a function that returns
// a Microsoft Entra access token (getToken), such as managedIdentityToken().
export function azureDevOps({org, project, repo, targetBranch, pat, getToken}) {
  if (!pat && !getToken) throw new Error('The Azure DevOps adapter needs either pat or getToken.');

  const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}`;
  const api = `${base}/_apis/git/repositories/${repo}`;

  async function authorization() {
    return pat ? 'Basic ' + Buffer.from(':' + pat).toString('base64') : `Bearer ${await getToken()}`;
  }

  async function call(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: {Authorization: await authorization(), 'Content-Type': 'application/json'},
      body: body && JSON.stringify(body),
    });
    const text = await res.text();
    // Azure DevOps answers some rejected credentials with 203 and a sign-in page
    if (res.status === 203) throw new Error(`${method} ${url}\nAzure DevOps rejected the credentials (203).`);
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
