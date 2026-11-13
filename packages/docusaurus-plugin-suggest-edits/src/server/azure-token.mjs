import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

// Microsoft Entra resource ID for Azure DevOps (the same for every organisation)
export const AZURE_DEVOPS_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';

// Refresh tokens this long before they expire
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Token for the managed identity of the Azure Functions app or App Service this runs in.
// Pass clientId for a user-assigned identity; leave it out for the system-assigned one.
export function managedIdentityToken({clientId, env = process.env, resource = AZURE_DEVOPS_RESOURCE} = {}) {
  return cachedToken(async () => {
    const endpoint = env.IDENTITY_ENDPOINT;
    const secret = env.IDENTITY_HEADER;
    if (!endpoint || !secret) {
      throw new Error(
        'Managed identity is not available here: IDENTITY_ENDPOINT is not set. It only works in an Azure Functions app or App Service with a managed identity turned on.',
      );
    }

    const url = new URL(endpoint);
    url.searchParams.set('resource', resource);
    url.searchParams.set('api-version', '2019-08-01');
    if (clientId) url.searchParams.set('client_id', clientId);

    const res = await fetch(url, {headers: {'X-IDENTITY-HEADER': secret}});
    const text = await res.text();
    if (!res.ok) throw new Error(`Managed identity token request failed: ${res.status} ${text}`);

    const body = JSON.parse(text);
    return {token: body.access_token, expiresAt: Number(body.expires_on) * 1000};
  });
}

// Token for whoever is signed in to the Azure CLI (`az login`). For local testing only.
export function azureCliToken({resource = AZURE_DEVOPS_RESOURCE, run = promisify(execFile)} = {}) {
  return cachedToken(async () => {
    let stdout;
    try {
      ({stdout} = await run('az', ['account', 'get-access-token', '--resource', resource, '--output', 'json']));
    } catch (e) {
      throw new Error(`Couldn't get a token from the Azure CLI. Is it installed, and have you run "az login"? (${e.message})`);
    }

    const body = JSON.parse(stdout);
    // Newer CLI versions give expires_on (seconds); older ones give expiresOn (local date-time)
    const expiresAt = body.expires_on ? Number(body.expires_on) * 1000 : Date.parse(body.expiresOn);
    return {token: body.accessToken, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 30 * 60 * 1000};
  });
}

// Reuses a token until shortly before it expires; callers at the same moment share one request
function cachedToken(fetchToken, now = () => Date.now()) {
  let token = null;
  let expiresAt = 0;
  let pending = null;

  return async function getToken() {
    if (token && now() < expiresAt - REFRESH_MARGIN_MS) return token;
    pending ??= fetchToken()
      .then((result) => {
        token = result.token;
        expiresAt = result.expiresAt;
        return token;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
