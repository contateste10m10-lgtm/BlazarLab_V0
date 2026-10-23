'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'assets/laboratory/fragment.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/laboratory/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/laboratory/laboratory.css'), 'utf8');

assert.equal((html.match(/data-advanced-method-tab=/g) || []).length, 3, 'three advanced method tabs must exist');
assert.equal((html.match(/data-advanced-method-panel=/g) || []).length, 3, 'three advanced method panels must exist');
for (const id of ['advancedPanelSampen', 'advancedPanelFisher', 'advancedPanelMse']) {
  assert.match(html, new RegExp(`id="${id}"`), `missing advanced panel ${id}`);
}
for (const id of ['entropyChart', 'modulationChart', 'advancedSampenChart', 'fisherShannonChart', 'wpeScaleChart', 'ciChart']) {
  assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must appear exactly once in fragment`);
}
assert.match(html, /<td class="empty-cell" colspan="15">/, 'empty table row must span all fifteen columns');
assert.doesNotMatch(html, /class="citation-details"/, 'the standalone SampEn citation block requested for removal must be absent');
assert.match(js, /devicePixelRatio:Math\.min\(3,Math\.max\(2,Number\(window\.devicePixelRatio\)\|\|1\)\)/, 'charts need high-DPI rendering');
assert.match(js, /toggleChartFullscreen/, 'full-screen toggle handler must exist');
assert.match(js, /event\.key !== 'Escape'/, 'Escape must close full-screen chart');
assert.match(js, /setupAdvancedMethodExplorer\(\)/, 'method selector setup must exist');
assert.match(js, /chart-tool-fullscreen/, 'toolbar must expose the full-screen control');
assert.match(js, /lab-status-chip/, 'band availability output must use status chips');
assert.match(css, /\.chart-layout\{align-items:start;/, 'primary result layout must avoid stretching plot panels to the table height');
assert.match(css, /\.results-table-panel table\{width:100%;min-width:1480px/, 'summary table must preserve readable columns and scroll horizontally');
assert.match(css, /\.advanced-method-tabs\{display:grid;grid-template-columns:repeat\(3/, 'advanced selector must use a method-tab layout');
for (const file of [
  'assets/laboratory/laboratory.css',
  'assets/laboratory/fragment.html',
  'assets/laboratory/vendor/chart.umd.min.js',
  'assets/laboratory/vendor/hammer.min.js',
  'assets/laboratory/vendor/chartjs-plugin-zoom.min.js',
  'assets/laboratory/vendor/pako.min.js',
  'assets/laboratory/analysis-core.js',
  'assets/laboratory/app.js'
]) assert.ok(fs.existsSync(path.join(root, file)), `missing local asset ${file}`);

console.log('PASS — método seletor 3×, canvases, tabela 15 colunas, remoção da referência autônoma, tela cheia/Esc, alta densidade de pixels, disponibilidade por banda e dependências locais.');
