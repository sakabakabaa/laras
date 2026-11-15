#!/usr/bin/env node
// Port docs/engineering/*.md (plus selected top-level notes) into the
// Docusaurus docs tree: adds front matter and rewrites repo-relative links.
//
// - Links between ported docs become docs-site links (./target#anchor).
// - Links to source files (../../apps/web/...) become inline code spans.
// - Links to docs that are not published are stripped to their label.
//
// Usage: node scripts/port-engineering.mjs   (from docs-site/)

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const repoRoot = resolve(siteRoot, '..');
const engDir = join(repoRoot, 'docs', 'engineering');
const outDir = join(siteRoot, 'docs', 'engineering');

// Engineering handbook reading order first, then everything else alphabetically.
// source-atlas.md (592 KB generated index) and builder-backlog.md (stale
// backlog) and production-domain.md (contains server IPs) are not published.
const CURATED = [
  ['README.md', 'index.md', 0],
  ['architecture.md', 'architecture.md', 1],
  ['features.md', 'features.md', 2],
  ['builder-layout.md', 'builder-layout.md', 3],
  ['data-model.md', 'data-model.md', 4],
  ['ai-and-evidence.md', 'ai-and-evidence.md', 5],
  ['operations.md', 'operations.md', 6],
  ['configuration.md', 'configuration.md', 7],
  ['routes.md', 'routes.md', 8],
  ['tests.md', 'tests.md', 9],
];

const TOP_LEVEL = [
  ['../ci.md', 'ci.md'],
  ['../agent-workflows.md', 'agent-workflows.md'],
  ['../P1-RATER-INTEGRATION.md', 'p1-research-rater.md'],
];

const SKIP = new Set([
  'source-atlas.md',
  'builder-backlog.md',
  'production-domain.md',
  'README.md',
  ...CURATED.map(([src]) => src),
  ...TOP_LEVEL.map(([src]) => src),
]);

// All published doc ids in the engineering section (no extension).
const PORTED_IDS = new Set([
  ...CURATED.map(([src, dst]) => dst.replace(/\.md$/, '')),
  ...TOP_LEVEL.map(([, dst]) => dst.replace(/\.md$/, '')),
  'p1-research-rater',
]);

const RENAME_MAP = new Map([
  ['P1-RATER-INTEGRATION', 'p1-research-rater'],
  ['README', 'index'],
]);

const rest = readdirSync(engDir)
  .filter((s) => s.endsWith('.md') && !SKIP.has(s));

const PLAN = [
  ...CURATED,
  ...rest.map((src) => [src, src, 20]),
  ...TOP_LEVEL.map(([src, dst]) => [src, dst, 20]),
];

function titleFrom(body, fallback) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

// MDX treats stray `<` and `{` in prose as JSX. Escape the implausible-tag
// forms outside fenced code blocks and inline code spans.
function mdxSafe(text) {
  const fenceParts = text.split(/^(```|~~~)/m);
  let inFence = false;
  return fenceParts
    .map((part) => {
      if (part === '```' || part === '~~~') {
        inFence = !inFence;
        return part;
      }
      if (inFence) return part;
      // Protect inline code spans (backticks) from escaping.
      const spans = part.split(/(`[^`\n]*`)/g);
      return spans
        .map((s) =>
          s.length > 1 && s.startsWith('`') && s.endsWith('`')
            ? s
            : s.replace(/<(?=[0-9\s=])/g, '&lt;').replace(/\{/g, '&lbrace;')
        )
        .join('');
    })
    .join('');
}

function rewriteLink(label, target, anchors) {
  const anchor = anchors ? `#${anchors}` : '';
  // Links to source files or repo files -> inline code.
  if (/^\.\.\/\.\.\//.test(target)) {
    const p = target.replace(/^\.\.\/\.\.\//, '');
    const labelIsPath = label === p || label === target;
    return labelIsPath ? `\`${p}\`` : `${label} (\`${p}\`)`;
  }
  // Inter-doc links inside docs/engineering -> docs-site links.
  if (/^\.\.\/P1-RATER-INTEGRATION\.md$/.test(target)) {
    return `[${label}](./p1-research-rater${anchor})`;
  }
  if (/^\.\.\/(agent-workflows|ci)\.md$/.test(target)) {
    const name = target.match(/([^/]+)\.md$/)[1];
    return `[${label}](./${name}${anchor})`;
  }
  const plain = target.replace(/^\.\.\//, '').replace(/^\.\//, '');
  const m = plain.match(/^([\w.-]+)\.md(#[\w-]+)?$/);
  if (m) {
    let name = m[1];
    if (!PORTED_IDS.has(name) && RENAME_MAP.has(name)) name = RENAME_MAP.get(name);
    if (PORTED_IDS.has(name)) {
      return `[${label}](./${name}${m[2] || ''})`;
    }
    // Not published (e.g. source-atlas.md) -> keep the name as inline code.
    return label === name ? `\`${name}.md\`` : `${label} (\`${name}.md\`)`;
  }
  return `[${label}](${target})`;
}

let ported = 0;
for (const [srcName, dstName, position] of PLAN) {
  const src = join(engDir, srcName);
  if (!existsSync(src)) {
    console.error(`missing source, skipping: ${srcName}`);
    continue;
  }
  const body = readFileSync(src, 'utf8');
  const fallbackTitle = dstName.replace(/\.md$/, '').replace(/-/g, ' ');

  // Rewrite markdown links before adding front matter.
  let out = body.replace(
    /\[([^\]]+)\]\(([^)\s]+?)(#[\w-]+)?\)/g,
    (full, label, target, anchors) => rewriteLink(label, target, anchors)
  );

  const title = titleFrom(body, fallbackTitle);
  let safe = mdxSafe(out);
  // The index page URL has no trailing slash (/docs/engineering), so its
  // relative doc links resolve wrongly; use absolute site links there.
  if (dstName === 'index.md') {
    safe = safe.replace(/\]\(\.\//g, '](/docs/engineering/');
  }
  const fm = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(`${title} — LARAS engineering handbook`)}`,
    `sidebar_position: ${position}`,
    '---',
    '',
  ].join('\n');

  const dst = join(outDir, dstName);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, fm + safe);
  ported += 1;
  console.log(`ported ${srcName} -> docs/engineering/${dstName} (position ${position})`);
}

writeFileSync(
  join(outDir, '_category_.json'),
  `${JSON.stringify(
    {
      label: 'Engineering handbook',
      link: { type: 'doc', id: 'engineering/index' },
      collapsed: false,
      position: 2,
    },
    null,
    2
  )}\n`
);

// Publish the same (English) files into the id locale tree. The engineering
// handbook is English-only, but publishing real files there keeps relative
// links and routes (/docs/id/engineering/...) working in the id locale
// instead of relying on fallback resolution.
const idOutDir = join(siteRoot, 'i18n', 'id', 'docusaurus-plugin-content-docs', 'current', 'engineering');
mkdirSync(idOutDir, { recursive: true });
let copied = 0;
for (const [, dstName] of PLAN.filter(([src]) => existsSync(join(engDir, src)))) {
  const srcFile = join(outDir, dstName);
  if (existsSync(srcFile)) {
    let content = readFileSync(srcFile, 'utf8');
    if (dstName === 'index.md') {
      content = content.replaceAll('/docs/engineering/', '/docs/id/engineering/');
    }
    writeFileSync(join(idOutDir, dstName), content);
    copied += 1;
  }
}
writeFileSync(
  join(idOutDir, '_category_.json'),
  `${JSON.stringify(
    {
      label: 'Buku pegangan teknis (English)',
      link: { type: 'doc', id: 'engineering/index' },
      collapsed: false,
      position: 2,
    },
    null,
    2
  )}\n`
);

console.log(`\n${ported} files ported; ${copied} mirrored to i18n/id; category manifests written.`);
