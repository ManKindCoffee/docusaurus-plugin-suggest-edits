import test from 'node:test';
import assert from 'node:assert/strict';
import {createRateLimiter} from './rate-limit.mjs';
import {staticWebAppsAuth} from './auth.mjs';

test('rate limiter: allows up to the limit, then blocks', () => {
  let t = 0;
  const check = createRateLimiter({max: 2, windowMs: 1000, now: () => t});
  assert.ok(check('a').ok);
  assert.ok(check('a').ok);
  const blocked = check('a');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.ok(check('b').ok, 'other keys are unaffected');
  t = 1000;
  assert.ok(check('a').ok, 'allowed again once the window has passed');
});

const auth = staticWebAppsAuth();
const req = (headers) => ({headers});
const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

test('auth: rejects a missing principal', () => {
  assert.throws(() => auth(req({})), {status: 401});
});

test('auth: rejects a garbled principal', () => {
  assert.throws(() => auth(req({'x-ms-client-principal': 'not-a-principal'})), {status: 401});
});

test('auth: reads the user', () => {
  const user = auth(req({
    'x-ms-client-principal': encode({
      identityProvider: 'aad',
      userId: 'u1',
      userDetails: 'jo@example.com',
      claims: [{typ: 'name', val: 'Jo Bloggs'}],
    }),
  }));
  assert.equal(user.id, 'u1');
  assert.equal(user.name, 'Jo Bloggs');
});