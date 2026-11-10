import http from 'node:http';
import {handlerFromEnv} from 'docusaurus-plugin-suggest-edits/server';
import {createNodeHandler} from 'docusaurus-plugin-suggest-edits/server/node';

const env = process.env;
const port = Number(env.SUGGEST_PORT || 3100);

const handler = createNodeHandler(handlerFromEnv(env, 'build/_suggest'), {
  allowedOrigins: (env.SUGGEST_ALLOWED_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim()),
  trustProxy: env.SUGGEST_TRUST_PROXY === 'true',
});

http.createServer(handler).listen(port, () => {
  console.log(`Suggest-edits server on http://localhost:${port}`);
  console.log(`Auth: ${env.SUGGEST_AUTH === 'swa' ? 'Static Web Apps sign-in' : 'anonymous'}`);
});