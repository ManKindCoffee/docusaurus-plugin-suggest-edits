import test from 'node:test';
import assert from 'node:assert/strict';
import {github} from './github.mjs';
import {repoFilePath} from './describe.mjs';

test('github adapter: branches from the build commit, commits the file, opens a PR', async () => {
  const calls = [];
  const responses = [{ref: 'x'}, {sha: 'file-sha'}, {content: {}}, {number: 7, html_url: 'https://github.com/o/r/pull/7'}];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({url, method: options.method, body: options.body && JSON.parse(options.body)});
    return new Response(JSON.stringify(responses[calls.length - 1]), {status: 200});
  };

  try {
    const adapter = github({owner: 'o', repo: 'r', token: 't', targetBranch: 'main'});
    const result = await adapter.submit({
      docPath: 'physics/waves.mdx',
      permalink: '/docs/physics/waves',
      proposed: 'new text',
      note: '',
      user: null,
      manifest: {commit: 'abc123', docsPathInRepo: 'my-website/docs'},
    });

    assert.equal(result.url, 'https://github.com/o/r/pull/7');
    assert.equal(calls[0].body.sha, 'abc123', 'branches from the build commit');
    assert.match(calls[1].url, /contents\/my-website\/docs\/physics\/waves\.mdx\?ref=/);
    assert.equal(calls[2].body.sha, 'file-sha');
    assert.equal(Buffer.from(calls[2].body.content, 'base64').toString(), 'new text');
    assert.equal(calls[3].body.base, 'main');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('repo paths work when docs sit at the repo root', () => {
  assert.equal(repoFilePath({docsPathInRepo: ''}, 'intro.mdx'), 'intro.mdx');
  assert.equal(repoFilePath({docsPathInRepo: 'site/docs'}, 'intro.mdx'), 'site/docs/intro.mdx');
});