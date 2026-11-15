#!/usr/bin/env node
// Validate every ```mermaid block in the docs trees with mermaid's own parser.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Mermaid (via DOMPurify) needs a DOM; provide happy-dom globals before import.
const { Window } = await import('happy-dom');
const window = new Window();
globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.btoa = window.btoa.bind(window);
globalThis.atob = window.atob.bind(window);

const mermaid = (await import('mermaid')).default;
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });

const roots = ['docs', 'i18n/id/docusaurus-plugin-content-docs/current'];
const blocks = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.md')) {
      const text = readFileSync(p, 'utf8');
      const re = /```mermaid\n([\s\S]*?)```/g;
      let m;
      while ((m = re.exec(text))) blocks.push({ file: p, src: m[1] });
    }
  }
}
roots.forEach(walk);

let failed = 0;
for (const { file, src } of blocks) {
  try {
    await mermaid.parse(src);
    console.log(`ok    ${file}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${file}: ${String(error).slice(0, 200)}`);
  }
}
console.log(`\n${blocks.length - failed}/${blocks.length} diagrams parse cleanly`);
process.exit(failed ? 1 : 0);
