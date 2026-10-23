'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'assets/laboratory/fragment.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/laboratory/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/laboratory/laboratory.css'), 'utf8');

assert.equal((html.match(/data-advanced-method-tab=/g) || []).length, 4, 'four scientific pillar tabs must exist');
assert.equal((html.match(/data-advanced-method-panel=/g) || []).length, 4, 'four scientific pillar panels must exist');
for (const id of ['advancedPanelSampen', 'advancedPanelFisher', 'advancedPanelMse', 'advancedPanelModulation']) {
  assert.match(html, new RegExp(`id="${id}"`), `missing advanced panel ${id}`);
}
for (const id of ['entropyChart', 'modulationChart', 'advancedSampenChart', 'fisherShannonChart', 'wpeScaleChart', 'ciChart', 'advancedModulationChart']) {
  assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must appear exactly once in fragment`);
}
assert.match(html, /<td class="empty-cell" colspan="21">/, 'empty table row must span all twenty-one columns');
assert.doesNotMatch(html, /class="citation-details"/, 'the standalone SampEn citation block requested for removal must be absent');
assert.match(js, /devicePixelRatio:Math\.min\(3,Math\.max\(2,Number\(window\.devicePixelRatio\)\|\|1\)\)/, 'charts need high-DPI rendering');
assert.match(js, /toggleChartFullscreen/, 'full-screen toggle handler must exist');
assert.match(js, /event\.key !== 'Escape'/, 'Escape must close full-screen chart');
assert.match(js, /setupAdvancedMethodExplorer\(\)/, 'method selector setup must exist');
assert.match(js, /chart-tool-fullscreen/, 'toolbar must expose the full-screen control');
assert.match(js, /lab-status-chip/, 'band availability output must use status chips');
assert.match(css, /\.chart-layout\{align-items:start;/, 'primary result layout must avoid stretching plot panels to the table height');
assert.match(css, /\.results-table-panel table\{width:100%;min-width:1600px/, 'summary table must preserve readable columns and scroll horizontally');
assert.match(css, /\.advanced-method-tabs\{display:grid;grid-template-columns:repeat\(4/, 'advanced selector must use a method-tab layout');
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

assert.match(html, /IC perfil 68,3% \(nominal\)/, 'profile-likelihood modulation interval must be visible in the table');
assert.match(js, /autoSkip:false,maxRotation:0,minRotation:0/, "banded charts must show each band tick, not every other label");
assert.match(js, /legend:\{display:true,position:'bottom'/, "Fisher/WPE charts must show color legends");
assert.match(html, /<span class="method-icon" aria-hidden="true"><svg/, "information icon must use a non-squashable circular SVG");
assert.match(js, /intrinsicModulation\(|upper_limit_candidate/, "boundary modulation estimates must not be presented as detections");
assert.match(js, /chartAvailable && fsCanvas/, "advanced plots must fail gracefully when chart library is unavailable");
assert.match(html,/id="batchMetricMethod"/,'multisource gallery must offer method selection');
assert.match(js,/getBatchMetricSpec\(\)/,'method selector must be used by render functions');
console.log('PASS — 4 pilares, seletor multifonte, banda/cor sincronizadas, tabela de 21 colunas, ícone vetorial, tela cheia/Esc, MLE de modulação e dependências locais.');
