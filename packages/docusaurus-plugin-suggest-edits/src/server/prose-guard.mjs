import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import {visit} from 'unist-util-visit';

// Must understand the same syntax as the site, or maths braces look like JavaScript
const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkMdx)
  .use(remarkMath)

// Compared exactly, as written in the source
const LOCKED_SOURCE = new Set(['yaml', 'mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression', 'html']);
// Compared by name and settings only, so the text inside stays editable
const COMPONENTS = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement']);

export function lockedParts(source) {
  const tree = parser.parse(source);
  const parts = [];
  visit(tree, (node) => {
    if (LOCKED_SOURCE.has(node.type)) {
      const {start, end} = node.position;
      parts.push(`${node.type}: ${source.slice(start.offset, end.offset)}`);
    } else if (COMPONENTS.has(node.type)) {
      const attrs = node.attributes.map((a) =>
        a.type === 'mdxJsxAttribute'
          ? `${a.name}=${a.value && typeof a.value === 'object' ? `{${a.value.value}}` : JSON.stringify(a.value)}`
          : `{${a.value}}`,
      );
      parts.push(`<${node.name ?? ''} ${attrs.join(' ')}>`);
    }
  });
  return parts;
}

export function checkProseOnly(original, proposed) {
  let before;
  try {
    before = lockedParts(original);
  } catch {
    return {ok: false, reason: "This page can't be checked automatically, so it can't be edited here."};
  }

  let after;
  try {
    after = lockedParts(proposed);
  } catch (e) {
    const where = e.line ? ` around line ${e.line}` : '';
    return {
      ok: false,
      reason: `Your edit breaks the page's formatting${where}. Check for stray { } or < > characters.`,
    };
  }

  const same = before.length === after.length && before.every((part, i) => part === after[i]);
  if (!same) {
    return {
      ok: false,
      reason:
        'Your edit changes part of the page that only the docs team can change (page settings, imports or components). Please change the text only.',
    };
  }
  return {ok: true};
}