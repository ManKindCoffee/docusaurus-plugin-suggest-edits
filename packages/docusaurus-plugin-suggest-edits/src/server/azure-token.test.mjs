import test from 'node:test';
import assert from 'node:assert/strict';
import {managedIdentityToken, azureCliToken, AZURE_DEVOPS_RESOURCE} from './azure-token.mjs';
import {azureDevOps} from './ado.mjs';

const env = {IDENTITY_ENDPOINT: 'http://localhost:8081/msi/token', IDENTITY_HEADER: 'secret'};
const inSeconds = (s) => String(Math.floor(Date.now() / 1000) + s);

function mockFetch(handler) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({url: String(url), options});
    return handler(String(url), options, calls.length);
  };
  return {calls, restore: () => (globalThis.fetch = realFetch)};
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {status});

test('managed identity: asks for an Azure DevOps token with the identity header', async () => {
  const mock = mockFetch(() => json({access_token: 'tok', expires_on: inSeconds(3600)}));
  try {
    const getToken = managedIdentityToken({env, clientId: 'abc'});
    assert.equal(await getToken(), 'tok');
    const url = new URL(mock.calls[0].url);
    assert.equal(url.searchParams.get('resource'), AZURE_DEVOPS_RESOURCE);
    assert.equal(url.searchParams.get('client_id'), 'abc');
    assert.equal(mock.calls[0].options.headers['X-IDENTITY-HEADER'], 'secret');
  } finally {
    mock.restore();
  }
});

test('managed identity: reuses a token until it is close to expiry', async () => {
  const mock = mockFetch(() => json({access_token: 'tok', expires_on: inSeconds(3600)}));
  try {
    const getToken = managedIdentityToken({env});
    await getToken();
    await getToken();
    assert.equal(mock.calls.length, 1);
  } finally {
    mock.restore();
  }
});

test('managed identity: fetches a new token when the old one is about to expire', async () => {
  const mock = mockFetch(() => json({access_token: 'tok', expires_on: inSeconds(60)}));
  try {
    const getToken = managedIdentityToken({env});
    await getToken();
    await getToken();
    assert.equal(mock.calls.length, 2);
  } finally {
    mock.restore();
  }
});

test('managed identity: explains itself when not running in Azure', async () => {
  await assert.rejects(managedIdentityToken({env: {}})(), /only works in an Azure Functions app/);
});

test('azure cli: reads the token from az', async () => {
  const run = async (cmd, args) => {
    assert.equal(cmd, 'az');
    assert.ok(args.includes(AZURE_DEVOPS_RESOURCE));
    return {stdout: JSON.stringify({accessToken: 'cli-tok', expires_on: Number(inSeconds(3600))})};
  };
  assert.equal(await azureCliToken({run})(), 'cli-tok');
});

test('azure devops adapter: sends a bearer token when given getToken', async () => {
  const mock = mockFetch((url, options, n) => (n === 1 ? json({}) : json({pullRequestId: 5})));
  try {
    const adapter = azureDevOps({org: 'o', project: 'p', repo: 'r', targetBranch: 'main', getToken: async () => 'entra-tok'});
    await adapter.submit({
      docPath: 'intro.md',
      permalink: '/docs/intro',
      proposed: 'x',
      user: null,
      manifest: {commit: 'abc', docsPathInRepo: 'example/docs'},
    });
    assert.equal(mock.calls[0].options.headers.Authorization, 'Bearer entra-tok');
  } finally {
    mock.restore();
  }
});

test('azure devops adapter: treats a 203 response as rejected credentials', async () => {
  const mock = mockFetch(() => new Response('<html>sign in</html>', {status: 203}));
  try {
    const adapter = azureDevOps({org: 'o', project: 'p', repo: 'r', targetBranch: 'main', pat: 'x'});
    await assert.rejects(
      adapter.submit({docPath: 'a.md', permalink: '/a', proposed: 'x', user: null, manifest: {commit: 'c', docsPathInRepo: ''}}),
      /rejected the credentials/,
    );
  } finally {
    mock.restore();
  }
});
