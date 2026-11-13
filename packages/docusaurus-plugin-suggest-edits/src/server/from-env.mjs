import {createSuggestHandler, fileSource} from './core.mjs';
import {azureDevOps} from './ado.mjs';
import {github} from './github.mjs';
import {anonymous, staticWebAppsAuth} from './auth.mjs';
import {createRateLimiter} from './rate-limit.mjs';
import {managedIdentityToken, azureCliToken} from './azure-token.mjs';

// How the Azure DevOps adapter signs in: pat (default), managed-identity or azure-cli
const ADO_AUTH_MODES = ['pat', 'managed-identity', 'azure-cli'];

const ADAPTERS = {
  'azure-devops': {
    required: (env) => [
      'ADO_ORG',
      'ADO_PROJECT',
      'ADO_REPO',
      'ADO_TARGET_BRANCH',
      ...(adoAuthMode(env) === 'pat' ? ['ADO_PAT'] : []),
    ],
    create: (env) =>
      azureDevOps({
        org: env.ADO_ORG,
        project: env.ADO_PROJECT,
        repo: env.ADO_REPO,
        targetBranch: env.ADO_TARGET_BRANCH,
        ...adoCredentials(env),
      }),
  },
  github: {
    required: () => ['GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_TOKEN', 'GITHUB_TARGET_BRANCH'],
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

  const missing = definition.required(env).filter((key) => !env[key]);
  if (missing.length) {
    log.error(`[suggest-edits] Missing settings for the ${name} adapter: ${missing.join(', ')}`);
    return notConfigured();
  }

  try {
    return definition.create(env);
  } catch (e) {
    log.error(`[suggest-edits] ${e.message}`);
    return notConfigured();
  }
}

function adoAuthMode(env) {
  return env.ADO_AUTH || 'pat';
}

function adoCredentials(env) {
  switch (adoAuthMode(env)) {
    case 'pat':
      return {pat: env.ADO_PAT};
    case 'managed-identity':
      return {getToken: managedIdentityToken({clientId: env.ADO_MANAGED_IDENTITY_CLIENT_ID})};
    case 'azure-cli':
      return {getToken: azureCliToken()};
    default:
      throw new Error(`Unknown ADO_AUTH "${env.ADO_AUTH}". Use one of: ${ADO_AUTH_MODES.join(', ')}`);
  }
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
