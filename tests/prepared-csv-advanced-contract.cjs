'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/laboratory/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'assets/laboratory/fragment.html'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'LEIA-ME_13.08_Lite.txt'), 'utf8');
const expected = ['fonte','janela','banda','tempo','fluxo','sampen','classe_fonte','variabilidade_robusta','modulation_index_percent','n_pontos'];
const builderStart = app.indexOf('async function buildPreparedCurveCsv(){');
const builderEnd = app.indexOf('\nfunction timeUnitLabel', builderStart);
assert.ok(builderStart >= 0 && builderEnd > builderStart, 'prepared CSV builder must exist');
const builder = app.slice(builderStart, builderEnd);
const headerMatch = builder.match(/const header=\[(.*?)\];/s);
assert.ok(headerMatch, 'prepared CSV header declaration must exist');
const actual = [...headerMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
assert.deepEqual(actual, expected, 'initial CSV must have exactly the ten requested columns, in order');
assert.match(app, /function robustVariabilityPercent\(values\)/, 'robust variability must use an explicit helper');
assert.match(app, /100\*1\.4826\*mad\/Math\.abs\(medianValue\)/, 'robust variability definition must be stable and documented');
assert.match(app, /summary&&Number\.isFinite\(band\.sampen\)/, 'SampEn must be exported as a per-band summary, not repeated at every epoch');
assert.match(app, /summary&&Number\.isFinite\(band\.modulation\)/, 'modulation must be exported as a per-band summary, not repeated at every epoch');
assert.match(app, /summary\?band\.validCount:''/, 'n_pontos must be exported once per band');
assert.match(app, /parts=\['\\uFEFF'/, 'CSV should include UTF-8 BOM for spreadsheet compatibility');
assert.match(app, /chunk\.length>=2500/, 'large files should be serialized in chunks');
assert.match(app, /populateArticleSelect\('batchNPointsColumn'.*\[\^n pontos\$|populateArticleSelect\('batchNPointsColumn'/s, 'n_pontos must have its own advanced mapping field');
assert.match(app, /populateArticleSelect\('batchBubbleSizeColumn',headers,true,findArticleColumn\(headers,\[\/epochs\//, 'n_pontos must not be consumed as the bubble-size field');
for (const header of expected) assert.ok(readme.includes(header), `README must document ${header}`);
assert.match(html, /Exportar CSV inicial para o modo avançado/, 'UI must explain that initial CSV is for advanced gallery');
// Execute the actual exporter functions in an isolated DOM/state harness. This checks
// content and summary semantics despite the environment restricting Chromium navigation.
const fnStart = app.indexOf('function medianFiniteNumbers(values)');
const fnEnd = app.indexOf('\nfunction timeUnitLabel', fnStart);
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'actual exporter functions must be extractable for a focused runtime check');
const snippet = app.slice(fnStart, fnEnd);
const captured = { blob: null, filename: null };
const statusNode = { textContent: '' };
const buttonNode = { disabled: false };
const elements = {
  timeColumn: { value: '0' },
  sourceName: { value: 'TEST-SOURCE' },
  preparedCurveExportStatus: statusNode,
  downloadPreparedCurveCsvBtn: buttonNode,
};
for (let i = 0; i < 8; i++) {
  elements[`rate-${i}`] = { value: i === 0 ? '1' : (i === 1 ? '2' : '-1') };
  elements[`err-${i}`] = { value: '-1' };
}
const context = {
  state: {
    parsed: true, table: { header: ['tempo','fluxo_a','fluxo_b'] }, timeIndex: 0,
    dataRows: Array.from({length: 5000}, (_, i) => [59000 + i * 0.01, 10 + (i % 7) * 0.1, 5 + (i % 11) * 0.03]),
    bandDefs: [{name:'14-20 keV'},{name:'20-24 keV'}, ...Array.from({length:6}, (_,i)=>({name:`Banda ${i+3}`}))],
    latestAnalysis: null, results: [], demoMode: false, fileName: 'TEST.csv'
  },
  el: id => elements[id] || null,
  slug: value => String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),
  downloadBlob: (blob, filename) => { captured.blob = blob; captured.filename = filename; },
  Blob, Number, Math, Array, String, Set, Promise, setTimeout,
  console,
};
vm.createContext(context);
vm.runInContext(snippet, context, { timeout: 5000 });
context.syncPreparedCurveExport = () => {};
(async () => {
  await context.downloadPreparedCurveCsv();
  assert.ok(captured.blob, 'pre-analysis export must produce a Blob');
  assert.equal(captured.filename, 'curva_inicial_avancado_test-source.csv');
  let text = await captured.blob.text();
  let lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  assert.equal(lines[0], expected.join(','));
  assert.equal(lines.length, 10001, 'all 5,000 eligible records from each of two bands should be streamed into the CSV');
  const preRows = lines.slice(1).map(line => line.split(','));
  assert.ok(preRows.every(row => row.length === 10), 'every CSV data row must have ten values');
  assert.equal(preRows.filter(row => row[5] !== '').length, 0, 'uncomputed SampEn must remain blank');
  assert.equal(preRows.filter(row => row[8] !== '').length, 0, 'uncomputed modulation must remain blank');
  assert.equal(preRows.filter(row => row[7] !== '').length, 2, 'robust variability summary must appear once per band');
  assert.equal(preRows.filter(row => row[9] !== '').length, 2, 'n_pontos must appear once per band');
  assert.equal(preRows.filter(row => row[2] === '14-20 keV').length, 5000);
  assert.equal(preRows.filter(row => row[2] === '20-24 keV').length, 5000);
  assert.ok(preRows.filter(row => row[7] !== '').every(row => Number(row[7]) >= 0), 'robust variability percentages should be computed when defined');

  context.state.latestAnalysis = { source: 'TEST-SOURCE' };
  context.state.results = [{ def: {name:'14-20 keV'}, value:0.873, modulationIndex:12.4, modulationResult:{status:'OK'} }, { def: {name:'20-24 keV'}, value:0.55, modulationIndex:null, modulationResult:{status:'upper_limit_candidate',upperLimit:18.2} }];
  await context.downloadPreparedCurveCsv();
  text = await captured.blob.text();
  lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const postRows = lines.slice(1).map(line => line.split(','));
  assert.equal(postRows.filter(row => row[5] !== '').length, 2, 'SampEn summary should appear exactly once for each band');
  assert.equal(postRows.filter(row => row[8] !== '').length, 1, 'boundary upper limit must not be exported as a detected modulation value');
  assert.equal(postRows[0][5], '0.873');
  assert.equal(postRows[0][8], '12.4');
  assert.equal(postRows[5000][5], '0.55');
  assert.equal(postRows[5000][8], '', 'upper-limit candidate must leave the numeric detection field blank');
  assert.equal(postRows.filter(row => row[9] !== '').length, 2);
  console.log('PASS prepared-csv-runtime — 10,000-row/two-band stream, exact schema, missing metrics stay blank, one summary per band, upper limit not misrepresented as detection.');
})().catch(error => { console.error(error); process.exitCode = 1; });

console.log('PASS prepared-csv-advanced-contract — 10 exact columns, summary metrics not duplicated per point, n_pontos mapped separately, large-file chunking.');
