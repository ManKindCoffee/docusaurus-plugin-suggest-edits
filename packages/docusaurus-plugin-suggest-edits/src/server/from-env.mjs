import {createSuggestHandler, fileSource} from './core.mjs';
import {azureDevOps} from './ado.mjs';
import {github} from './github.mjs';
import {anonymous, staticWebAppsAuth} from './auth.mjs';
import {createRateLimiter} from './rate-limit.mjs';

const ADAPTERS = {
  'azure-devops': {
    required: ['ADO_ORG', 'ADO_PROJECT', 'ADO_REPO', 'ADO_PAT', 'ADO_TARGET_BRANCH'],
    create: (env) =>
      azureDevOps({
        org: env.ADO_ORG,
        project: env.ADO_PROJECT,
        repo: env.ADO_REPO,
        pat: env.ADO_PAT,
        targetBranch: env.ADO_TARGET_BRANCH,
      }),
  },
  github: {
    required: ['GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_TOKEN', 'GITHUB_TARGET_BRANCH'],
    create: (env) =>
      github({
        owner: env.GITHUB_OWNER,
        repo: env.GITHUB_REPO,
        token: env.GITHUB_TOKEN,
        targetBranch: env.GITHUB_TARGET_BRANCH,
      }),
  },
};

export function handlerFromEnv(env, sourceDir, log = console) {
  const perSubmitter = createRateLimiter({max: Number(env.SUGGEST_MAX_PER_HOUR || 10)});
  const overall = createRateLimiter({max: Number(env.SUGGEST_GLOBAL_MAX_PER_HOUR || 50)});

  return createSuggestHandler({
    adapter: adapterFromEnv(env, log),
    source: fileSource(sourceDir),
    authenticate: env.SUGGEST_AUTH === 'swa' ? staticWebAppsAuth() : anonymous(),
    limits: [perSubmitter, () => overall('all')],
    exposeErrors: env.SUGGEST_DEBUG === 'true',
    log,
  });
}

function adapterFromEnv(env, log) {
  const name = env.SUGGEST_ADAPTER || 'azure-devops';
  const definition = ADAPTERS[name];

  if (!definition) {
    log.error(`[suggest-edits] Unknown SUGGEST_ADAPTER "${name}". Use one of: ${Object.keys(ADAPTERS).join(', ')}`);
    return notConfigured();
  }

  const missing = definition.required.filter((key) => !env[key]);
  if (missing.length) {
    log.error(`[suggest-edits] Missing settings for the ${name} adapter: ${missing.join(', ')}`);
    return notConfigured();
  }

  return definition.create(env);
}

// Readers get a clear message; the log above tells the site owner what to fix
function notConfigured() {
  return {
    name: 'not-configured',
    async submit() {
      throw Object.assign(new Error('Suggestions are not set up on this site yet. Please try again later.'), {status: 503});
    },
  };
}