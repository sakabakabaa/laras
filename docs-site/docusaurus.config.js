// LARAS documentation site — served at https://laraslernen.com/docs
// @ts-check
// Note: this project is intentionally outside the root npm workspaces so the
// app image build (npm ci at the repository root) is unaffected.

const lightCode = require('./src/brand.cjs');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'LARAS',
  tagline: 'How the platform works — and how AI feedback is provided',
  url: 'https://laraslernen.com',
  baseUrl: '/docs',
  trailingSlash: false,

  organizationName: 'LARAS',
  projectName: 'laras',

  onBrokenLinks: 'warn',

  favicon: 'img/favicon.png',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'id'],
    localeConfigs: {
      en: { label: 'English', htmlLang: 'en' },
      id: { label: 'Bahasa Indonesia', htmlLang: 'id' },
    },
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editLocalizedFiles: false,
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        language: ['en'],
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        docsRouteBasePath: '/',
      }),
    ],
  ],

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      mermaid: {
        options: {
          theme: lightCode.mermaidTheme,
        },
      },
      colorMode: {
        defaultMode: 'light',
        respectPrefersColorScheme: true,
      },
      announcementBar: {
        id: 'laras_docs',
        content:
          'Documentation for <a target="_blank" href="https://laraslernen.com">laraslernen.com</a> — including how AI feedback is generated and reviewed.',
        backgroundColor: '#7e1a14',
        textColor: '#ffffff',
      },
      navbar: {
        title: 'LARAS Docs',
        logo: {
          alt: 'LARAS',
          src: 'img/laras-mark.png',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'handbook',
            position: 'left',
            label: 'Docs',
          },
          {
            href: 'https://laraslernen.com',
            position: 'right',
            label: 'Open LARAS',
          },
          { type: 'localeDropdown', position: 'right' },
        ],
      },
      footer: {
        style: 'dark',
        copyright: `Copyright © ${new Date().getFullYear()} LARAS. Built with Docusaurus.`,
      },
      metadata: [
        {
          name: 'description',
          content:
            'LARAS documentation: platform architecture, course workflows, and how AI-generated feedback, scoring and lecturer review work.',
        },
      ],
    }),
};

module.exports = config;
