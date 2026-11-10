import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const REPO_URL = 'https://github.com/<YOUR-GITHUB-USERNAME>/docusaurus-plugin-suggest-edits';

const config: Config = {
  title: 'Suggest Edits example',
  tagline: 'Readers suggest edits; your team reviews pull requests',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://example.com',
  baseUrl: '/',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
          // Docusaurus only shows the edit button when a page has an editUrl.
          // The plugin replaces the button, so this value is never used.
          editUrl: () => '#suggest-edit',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      'docusaurus-plugin-suggest-edits',
      {
        // Same address as the site under Azure Static Web Apps.
        // To use the local Node server instead, build with:
        //   SUGGEST_ENDPOINT=http://localhost:3100/api/suggest-edit npm run build
        endpoint: process.env.SUGGEST_ENDPOINT ?? '/api/suggest-edit',
        loginUrl: '/.auth/login/github',
        exclude: ['excluded'],
      },
    ],
  ],

  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
      type: 'text/css',
    },
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Suggest Edits example',
      logo: {
        alt: 'Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: REPO_URL,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Example site for <a href="${REPO_URL}">docusaurus-plugin-suggest-edits</a>. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
