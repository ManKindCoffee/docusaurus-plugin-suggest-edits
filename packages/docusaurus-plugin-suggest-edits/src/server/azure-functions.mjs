import {handlerFromEnv} from './from-env.mjs';

export function registerSuggestEditFunction(app, {sourceDir, env = process.env, route = 'suggest-edit', name = 'suggestEdit'}) {
  const handle = handlerFromEnv(env, sourceDir);

  app.http(name, {
    route,
    methods: ['POST'],
    authLevel: 'anonymous', // Static Web Apps handles sign-in in front of this
    handler: async (request) => {
      const result = await handle({
        headers: Object.fromEntries(request.headers),
        body: await request.text(),
        ip: clientIp(request.headers.get('x-forwarded-for')),
      });
      return {status: result.status, headers: result.headers, jsonBody: result.body};
    },
  });
}

// Static Web Apps sets this header itself, so it can be trusted here. Strips a port if present.
function clientIp(forwarded) {
  const first = (forwarded || '').split(',')[0].trim();
  return /^[\d.]+:\d+$/.test(first) ? first.split(':')[0] : first || 'unknown';
}