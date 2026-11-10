import {app} from '@azure/functions';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerSuggestEditFunction} from 'docusaurus-plugin-suggest-edits/server/azure-functions';

// This file is bundled into api/dist/, so the path is relative to there
const here = path.dirname(fileURLToPath(import.meta.url));
registerSuggestEditFunction(app, {sourceDir: path.join(here, '../_suggest')});