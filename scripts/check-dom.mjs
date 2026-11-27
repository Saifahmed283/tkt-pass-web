// Static guard: every el.* reference must be declared, and every referenced
// DOM id must exist exactly once in the matching page.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const pages = {
  pass: { html: 'pass.html', js: 'assets/pass.js' },
  admin: { html: 'admin.html', js: 'assets/admin.js' },
};

let failed = false;

for (const [name, { html: htmlFile, js: jsFile }] of Object.entries(pages)) {
  const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
  const js = fs.readFileSync(path.join(root, jsFile), 'utf8');
  const elBlock = js.match(/const el = \{([\s\S]*?)\n\};/)?.[1] || '';

  const mappedProps = new Set(
    [...elBlock.matchAll(/^\s*([A-Za-z0-9_]+):\s*\$\('/gm)].map((match) => match[1]),
  );
  const usedProps = new Set([...js.matchAll(/\bel\.([A-Za-z0-9_]+)/g)].map((match) => match[1]));
  const referencedIds = new Set(
    [...js.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]),
  );

  const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const htmlIdSet = new Set(htmlIds);
  const duplicates = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
  const missingProps = [...usedProps].filter((prop) => !mappedProps.has(prop));
  const missingIds = [...referencedIds].filter((id) => !htmlIdSet.has(id));

  const problems = [
    missingProps.length && `undeclared el props: ${missingProps.join(', ')}`,
    missingIds.length && `missing ids: ${missingIds.join(', ')}`,
    duplicates.length && `duplicate ids: ${[...new Set(duplicates)].join(', ')}`,
  ].filter(Boolean);

  if (problems.length) {
    failed = true;
    console.error(`${name}: FAIL — ${problems.join('; ')}`);
  } else {
    console.log(`${name}: ok — ${mappedProps.size} el refs, ${referencedIds.size} ids`);
  }
}

if (failed) process.exitCode = 1;
