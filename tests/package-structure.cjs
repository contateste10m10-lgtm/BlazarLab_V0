'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root,'assets/laboratory/fragment.html'),'utf8');
const app = fs.readFileSync(path.join(root,'assets/laboratory/app.js'),'utf8');
const core = fs.readFileSync(path.join(root,'assets/laboratory/analysis-core.js'),'utf8');
const css = fs.readFileSync(path.join(root,'assets/laboratory/laboratory.css'),'utf8');
const loader = fs.readFileSync(path.join(root,'laboratorio-loader.js'),'utf8');
const readme = fs.readFileSync(path.join(root,'LEIA-ME_13.08_Lite.txt'),'utf8');
const dataLibraryPath = path.join(root,'assets/laboratory/data-library.js');
assert.ok(fs.existsSync(dataLibraryPath),'NumPy/ZIP library reader must be packaged locally');
const dataLibrary = fs.readFileSync(dataLibraryPath,'utf8');
assert.match(loader,/assets\/laboratory\/data-library\.js/,'local loader must load the NumPy/ZIP reader before the gallery app');
assert.match(dataLibrary,/function parseNpy/,'NumPy NPY parser must be included');
assert.match(dataLibrary,/function readNpz/,'NumPy NPZ parser must be included');
assert.match(html,/id="batchDataFile"[^>]*multiple/,'multi-file picker must accept multiple files');
assert.match(html,/id="batchLibraryFolderInput"[^>]*webkitdirectory/,'directory library picker must be present');
assert.match(html,/id="batchLibraryZipInput"/,'ZIP library picker must be present');
assert.match(app,/function handleBatchFiles\(files\)/,'multi-file ingestion must be wired');
assert.match(app,/function mergeLibraryTables\(tables\)/,'tables must be merged by column name with source provenance');
assert.match(readme,/\.npy/,'the NumPy NPY format must be documented');
assert.match(readme,/\.npz/,'the NumPy NPZ format must be documented');

function matchingBracket(source, start, open='[', close=']') {
  let depth=0, quote=null, escaped=false;
  for(let i=start;i<source.length;i++) {
    const c=source[i];
    if(quote) { if(escaped)escaped=false; else if(c==='\\')escaped=true; else if(c===quote)quote=null; continue; }
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c===open)depth++; else if(c===close&&--depth===0)return i;
  }
  throw new Error(`No matching ${close} from offset ${start}`);
}
function splitTopLevel(source) {
  const values=[];let start=0,depth=0,quote=null,escaped=false;
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if('([{'.includes(c))depth++; else if(')]}'.includes(c))depth--;
    else if(c===','&&depth===0){values.push(source.slice(start,i).trim());start=i+1;}
  }
  values.push(source.slice(start).trim());return values;
}

const idValues=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(idValues).size,idValues.length,'HTML fragment must not contain duplicate IDs');
const tabKeys=[...html.matchAll(/data-advanced-method-tab="([^"]+)"/g)].map(m=>m[1]);
const panelKeys=[...html.matchAll(/data-advanced-method-panel="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual([...tabKeys].sort(),[...panelKeys].sort(),'every advanced scientific pillar must have a matching panel');
assert.deepEqual([...tabKeys].sort(),['fisher','modulation','mse','sampen'],'the advanced UI must expose all four scientific pillars');
for(const id of ['advancedSampenChart','fisherShannonChart','wpeScaleChart','ciChart','advancedModulationChart']) assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`${id} must appear once`);
const resultsTable=html.match(/<table id="resultsTable">([\s\S]*?)<\/table>/)?.[1];
assert.ok(resultsTable,'results table must exist');
const headerCount=(resultsTable.match(/<th\b/g)||[]).length;
assert.equal(headerCount,21,'the results table must expose 21 columns');
const qualityHeader=html.match(/<table class="quality-table"><thead>([\s\S]*?)<\/thead>[\s\S]*?id="dataQualityTableBody"/)?.[1];
assert.ok(qualityHeader,'per-band quality table must exist');
assert.equal((qualityHeader.match(/<th\b/g)||[]).length,18,'the quality table must expose 18 audit columns');
assert.match(html,/dataQualityTableBody[\s\S]*?colspan="18"/,'quality table empty states must span all 18 columns');
assert.match(resultsTable,/class="empty-cell" colspan="21"/,'empty row must span the 21 results columns');
assert.match(resultsTable,/<th>IC perfil 68,3% \(nominal\)<\/th>/,'the table header must explain the profile-likelihood interval column');
assert.match(resultsTable,/<th>KDE h \(unidade da série\)<\/th>/,'the table must expose KDE bandwidth metadata');
assert.match(resultsTable,/<th>Δ\(−2 ln L\) limite<\/th>/,'the table must expose the boundary likelihood threshold');
assert.match(html,/yᵢ ~ Normal\(S₀, εᵢ² \+ σ₀²\)/,'the modulation panel must explain the heteroscedastic likelihood model');
assert.doesNotMatch(html,/√\(S² − ⟨σ²⟩\)/,'the primary UI must not describe the legacy excess-variance estimator as the main estimator');
assert.equal((html.match(/<span class="method-icon" aria-hidden="true"><svg/g)||[]).length,4,'all four informational callouts must use the circular SVG glyph');
assert.doesNotMatch(html,/<div class="method-icon">i<\/div>/,'old squashed i callout must be removed');
for(const link of [...html.matchAll(/href="#([^"#]+)"/g)].map(m=>m[1])) assert.ok(idValues.includes(link),`internal fragment link #${link} must resolve`);

// Ensure CSV header and row expressions stay aligned as the schema evolves.
const headerStart=app.indexOf("['band_keV'");
assert.ok(headerStart>=0,'CSV export header row must exist');
const headerEnd=matchingBracket(app,headerStart);
const headerFields=splitTopLevel(app.slice(headerStart+1,headerEnd));
const pushStart=app.indexOf('rows.push([',headerEnd);
assert.ok(pushStart>=0,'CSV export value rows must exist');
const valueStart=pushStart+'rows.push('.length;
const valueEnd=matchingBracket(app,valueStart);
const valueFields=splitTopLevel(app.slice(valueStart+1,valueEnd));
assert.equal(valueFields.length,headerFields.length,`CSV value row (${valueFields.length}) must match header (${headerFields.length})`);

const bandDefs=[...app.matchAll(/\{ key: 'b[1-8]', name: '[^']+', short: '[^']+', color: '(#[0-9a-fA-F]{6})' \}/g)].map(m=>m[1].toLowerCase());
assert.equal(bandDefs.length,8,'eight persistent band colors must be defined');
assert.equal(new Set(bandDefs).size,8,'each band must have a distinct stable color');
assert.match(app,/backgroundColor:results\.map\(r=>r\.def\.color/,'bar-chart colors must use the same band definition as table swatches');
assert.match(app,/backgroundColor:r\.def\.color,borderColor:r\.def\.color/,'Fisher–Shannon points must use the matching band color');
assert.match(app,/borderColor:r\.def\.color/,'WPE series must use matching band colors');
assert.match(core,/13\.08-multisource-numpy-library/,'core build version must be 13.08 multisource NumPy schema');
assert.match(css,/\.advanced-method-tabs\{display:grid;grid-template-columns:repeat\(4/,'four method tabs must have a matching responsive grid');

assert.match(html,/id="batchMetricMethod"/,'gallery must expose a method selector');
assert.match(html,/value="fisher"/,'gallery must support Fisher–Shannon');
assert.match(html,/value="modulation"/,'gallery must support intrinsic modulation');
assert.match(html,/value="mse"/,'gallery must support MSE-WPE/CI');
assert.match(app,/function getBatchMetricSpec/,'gallery method selector must map each selected method to its own value');
assert.match(core,/function fisherShannonGaussianReference/,'analytic Gaussian Fisher–Shannon reference must exist');
assert.match(core,/function fisherShannonKDEStability/,'KDE sensitivity sweep must exist');
assert.match(core,/profile likelihood ratio/,'modulation interval must document profile likelihood');
assert.match(core,/function fisherShannonGaussianReference/,'analytic Gaussian Fisher–Shannon reference must exist');
assert.match(core,/function fisherShannonKDEStability/,'KDE sensitivity diagnostics must exist');
assert.match(core,/function coarseGrainDetailed/,'coarse-graining must return explicit remainder and status metadata');
assert.match(core,/tailPolicy: 'discard-incomplete-final-block'/,'coarse-graining tail policy must be explicit');
assert.match(core,/not-found-in-v0.22-reference-archive/,'CI must remain experimental if the reference package has no CI contract');
assert.match(html,/id="mseValidationSummary"/,'MSE panel must show per-scale diagnostics');
assert.match(html,/id="dataQualityPanel"/,'the data quality panel must exist');
for(const id of ['qualityRawRows','qualityFiniteTimes','qualityMedianCadence','qualityCadenceMAD','qualityAlertCount','qualityGapFactor','dataQualityTableBody','dataQualityAlerts','qualitySourceMetadata','downloadQualityManifestBtn']) assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`quality UI element ${id} must appear once`);
assert.match(app,/function renderDataQuality\(\)/,'quality panel must render from the mapped source data');
assert.match(app,/function createQualityManifest\(/,'analysis provenance manifest must be exportable');
assert.match(app,/const totalVisibleAlerts=alertCount\+supplementaryWarnings/,'informational metadata notes must not be counted as quality warnings');
assert.match(app,/sha256ForBuffer/,'original source bytes should be fingerprinted locally when supported');
assert.match(app,/function validIsoCalendarDate/,'ISO date normalization must validate real calendar dates instead of relying on permissive Date.parse');
assert.match(app,/function isIsoDatetimeWithoutTimezone/,'timezone-free ISO datetimes must be distinguished from invalid timestamps');
assert.match(app,/invalidIsoTimeRows/,'invalid ISO temporal values must be recorded in the import diagnostics');
assert.match(app,/TSCAL/,'FITS scale metadata should be interpreted');
assert.match(app,/TNULL/,'FITS integer null metadata should be interpreted');
assert.match(app,/const logicalRepeat=col\.format\.code==='A'\?1:col\.format\.repeat/,'FITS fixed-width text columns must not expand into repeated columns');
assert.match(app,/const hasSeveralScalarRates/,'FITS parser should recognize separate scalar columns for energy bands');
assert.match(app,/MJDREF/,'FITS temporal reference metadata should be recorded');
assert.match(app,/no automatic filling|No automatic filling/i,'manifest must state no auto-fill/interpolation/deduplication');
assert.match(app,/function renderMSEScaleDiagnostics/,'scale diagnostics must be rendered from the computed results');
assert.match(app,/el\('cancelAnalyzeBtn'\)/,'main analysis must wire a cancel control');
assert.match(app,/activeAnalysisAbortController/,'analysis cancellation state must exist');
assert.match(app,/function makeAbortError/,'cancellation must have an explicit AbortError path');
assert.match(core,/async function calculateMSEAsync/,'MSE scales must support cooperative asynchronous calculation');
assert.match(core,/shouldCancel/,'async MSE must check cooperative cancellation between scales');
assert.match(app,/WPE_discarded_points_by_scale/,'CSV must export coarse-graining remainder metadata');
assert.match(html,/id="cancelAnalyzeBtn"/,'fragment must include the cancellation button');
console.log(`PASS package-structure — ${idValues.length} IDs únicos, 4 painéis/abas, tabelas de 21 e 18 colunas, seletor multifonte e CSV (${headerFields.length} campos alinhados).`);
