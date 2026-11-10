const path = require('path');
const fs = require('fs/promises');
const {execSync} = require('child_process');
const {Joi} = require('@docusaurus/utils-validation');

function suggestEditsPlugin(context, options) {
  const {siteDir} = context;
  const docsDir = path.join(siteDir, options.docsDir);

  return {
    name: 'suggest-edits',

    getThemePath() {
      return path.resolve(__dirname, './theme');
    },

    // Re-run when docs are added or removed during `npm start`
    getPathsToWatch() {
      return [`${docsDir}/**/*.{md,mdx}`];
    },

    // Work out which pages can be edited, once, for everything below
    async loadContent() {
      const all = await listMarkdown(docsDir);
      return {files: all.filter((f) => !isExcluded(f, options.exclude))};
    },

    // Settings the browser needs
    async contentLoaded({content, actions}) {
      actions.setGlobalData({
        endpoint: options.endpoint,
        label: options.label,
        loginUrl: options.loginUrl,
        docsDir: options.docsDir,
        files: content.files,
      });
    },

    // Publish page source and the manifest with the build
    async postBuild({content, outDir}) {
      const exportRoot = path.join(outDir, '_suggest');

      for (const rel of content.files) {
        const dest = path.join(exportRoot, 'src', rel);
        await fs.mkdir(path.dirname(dest), {recursive: true});
        await fs.copyFile(path.join(docsDir, rel), dest);
      }

      const repoRoot = git('rev-parse --show-toplevel', siteDir);
      const commit = repoRoot ? git('rev-parse HEAD', siteDir) : null;
      const uncommittedChanges = repoRoot ? git('status --porcelain', siteDir) !== '' : null;

      if (!commit) {
        console.warn(
          '[suggest-edits] This site was not built from a Git repository with at least one commit, so suggestions will be refused for this build.',
        );
      } else if (uncommittedChanges) {
        console.warn(
          '[suggest-edits] Built with uncommitted changes. Commit and push before deploying, or suggestions may not match the published pages.',
        );
      }

      const manifest = {
        commit,
        uncommittedChanges,
        docsPathInRepo: repoRoot ? path.relative(repoRoot, docsDir).split(path.sep).join('/') : null,
        files: content.files,
      };

      await fs.writeFile(path.join(exportRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
    },
  };
}

// An entry excludes that exact file, or everything in that folder
function isExcluded(file, exclude) {
  return exclude.some((entry) => {
    const e = entry.replace(/\/$/, '');
    return file === e || file.startsWith(`${e}/`);
  });
}

async function listMarkdown(dir, base = dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdown(full, base)));
    else if (/\.mdx?$/.test(entry.name)) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

function git(args, cwd) {
  try {
    return execSync(`git ${args}`, {cwd}).toString().trim();
  } catch {
    return null;
  }
}

const schema = Joi.object({
  endpoint: Joi.string().required(),
  docsDir: Joi.string().default('docs'),
  exclude: Joi.array().items(Joi.string()).default([]),
  label: Joi.string().default('Suggest an edit'),
  loginUrl: Joi.string().allow(null).default(null),
});

module.exports = suggestEditsPlugin;
module.exports.validateOptions = ({validate, options}) => validate(schema, options);