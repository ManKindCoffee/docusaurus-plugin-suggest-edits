import {build} from 'esbuild';

await build({
  entryPoints: ['api/src/functions/*.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outdir: 'api/dist',
  outExtension: {'.js': '.mjs'},
  external: ['@azure/functions'], // installed by Azure from api/package.json
  // Lets any bundled CommonJS code use require() inside an ES module
  banner: {js: "import {createRequire} from 'node:module'; const require = createRequire(import.meta.url);"},
});

console.log('Built api/dist');