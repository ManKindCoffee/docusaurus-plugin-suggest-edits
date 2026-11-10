import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProseOnly} from './prose-guard.mjs';

const page = `---
title: Forces
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Newton's second law is $F = \\frac{dp}{dt}$.

<Tabs>
  <TabItem value="si" label="SI units">Force is measured in newtons.</TabItem>
</Tabs>
`;

const allowed = (edit) => assert.equal(checkProseOnly(page, edit).ok, true);
const blocked = (edit) => assert.equal(checkProseOnly(page, edit).ok, false);

test('allows a plain text change', () => allowed(page.replace('second law', '2nd law')));
test('allows text inside a component', () => allowed(page.replace('in newtons', 'in newtons (N)')));
test('allows editing maths', () => allowed(page.replace('\\frac{dp}{dt}', '\\frac{d p}{d t}')));

test('blocks frontmatter changes', () => blocked(page.replace('title: Forces', 'title: Hacked')));
test('blocks changed imports', () => blocked(page.replace("'@theme/Tabs'", "'somewhere-else'")));
test('blocks new exports', () => blocked(page.replace("Newton's", "export const x = 1;\n\nNewton's")));
test('blocks component settings', () => blocked(page.replace('label="SI units"', 'label="Imperial"')));
test('blocks new components', () => blocked(page + '\n<Tabs />\n'));
test('blocks JavaScript expressions', () => blocked(page.replace("Newton's", "{alert(1)} Newton's")));
test('blocks broken syntax', () => blocked(page.replace("Newton's", "{ Newton's")));