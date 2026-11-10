import fs from 'node:fs/promises';
import path from 'node:path';
import {checkProseOnly} from './prose-guard.mjs';

// Reads the manifest and page source published by the plugin
export function fileSource(dir) {
  return {
    manifest: async () => JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')),
    source: (docPath) => fs.readFile(path.join(dir, 'src', docPath), 'utf8'),
  };
}

export function createSuggestHandler({adapter, source, authenticate, limits, maxBytes = 200_000, log = console}) {
  async function submit({docPath, permalink, baseCommit, proposed, note}, user) {
    const manifest = await source.manifest();
    if (!manifest.commit) throw clientError("Suggestions aren't available on this version of the site.", 503);
    if (!manifest.files.includes(docPath)) throw clientError("That page can't be edited.");
    if (baseCommit !== manifest.commit) throw clientError('The site has been updated. Reload the page and try again.');
    if (typeof proposed !== 'string' || proposed.length > maxBytes) throw clientError('That edit is too large.');

    const original = await source.source(docPath);
    if (proposed === original) throw clientError('There are no changes to submit.');

    const guard = checkProseOnly(original, proposed);
    if (!guard.ok) throw clientError(guard.reason);

    return adapter.submit({docPath, permalink, proposed, note, user, manifest});
  }

  // Input: {headers, body, ip}. Output: {status, headers, body}
  return async function handle({headers, body, ip}) {
    try {
      const user = authenticate({headers});

      const key = user ? `user:${user.id}` : `ip:${ip}`;
      for (const limit of limits) {
        const result = limit(key);
        if (!result.ok) {
          const minutes = Math.ceil(result.retryAfterSeconds / 60);
          return reply(
            429,
            {error: `Too many suggestions right now. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`},
            {'Retry-After': String(result.retryAfterSeconds)},
          );
        }
      }

      if (body.length > maxBytes * 2) throw clientError('Request too large.', 413);
      return reply(201, await submit(parseJson(body), user));
    } catch (e) {
      if (!e.status) log.error(e);
      return reply(e.status || 500, {error: e.status ? e.message : 'Something went wrong submitting your suggestion.'});
    }
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw clientError('Invalid request.');
  }
}

function clientError(message, status = 400) {
  return Object.assign(new Error(message), {status});
}

function reply(status, body, headers = {}) {
  return {status, body, headers};
}