#!/usr/bin/env node
/**
 * Build: inline every source module into ONE self-contained HTML file.
 *
 *   src/styles.css + src/**.js  ──►  index.html
 *
 * No bundler, no transpiler: modules are plain scripts concatenated in
 * dependency order and wrapped in a single IIFE (no globals leak except
 * the deliberate `window.Relay` debug handle).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => path.join(root, 'src', p);

/** Dependency order matters: each module may use the ones above it. */
export const MODULES = [
  'i18n.js',
  'icons.js',
  'engine.js',
  'data.js',
  'morph.js',
  'app/core.js',
  'app/views-common.js',
  'app/views-simple.js',
  'app/views-pro.js',
  'app/views-live.js',
  'app/views-inbox.js',
  'app/actions.js',
  'app/render.js',
];

function build() {
  const stripNodeExports = (code) => code.replace(/^if \(typeof module === 'object'.*$/gm, '');
  const js = MODULES.map((m) => `/* ---- src/${m} ---- */\n${stripNodeExports(fs.readFileSync(src(m), 'utf8'))}`).join('\n');
  const css = fs.readFileSync(src('styles.css'), 'utf8');
  for (const [name, code, tag] of [['JS', js, '</script'], ['CSS', css, '</style']]) {
    if (code.toLowerCase().includes(tag)) throw new Error(`${name} contains "${tag}" and would break inlining`);
  }
  const banner = `/*! Relay prototype · built ${new Date().toISOString()} · sources: src/ (see README.md) */`;
  const bundle = `${banner}\n(() => {\n'use strict';\n${js}\n})();`;
  const tpl = fs.readFileSync(src('index.template.html'), 'utf8');
  const html = tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => bundle);
  const out = path.join(root, 'index.html');
  fs.writeFileSync(out, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`✓ index.html — ${kb} KB, ${MODULES.length} JS modules + styles.css`);
}

build();
