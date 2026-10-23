'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../assets/laboratory/analysis-core.js');
const app = fs.readFileSync(path.join(__dirname,'../assets/laboratory/app.js'),'utf8');
const fragment = fs.readFileSync(path.join(__dirname,'../assets/laboratory/fragment.html'),'utf8');

assert.match(core.VERSION, /^13\.08-/);
assert.equal(typeof core.datasetQualityDiagnostics, 'function');
assert.match(fragment,/id="dataQualityPanel"/);
assert.match(fragment,/id="downloadQualityManifestBtn"/);
assert.match(app,/function createQualityManifest\(/);
assert.match(app,/appliedColumnTransforms/);
assert.match(app,/TSCAL/); assert.match(app,/TZERO/); assert.match(app,/TNULL/);
assert.match(app,/TIMESYS/); assert.match(app,/MJDREF/); assert.match(app,/TIMEUNIT/);
assert.match(app,/No automatic filling, interpolation, duplicate merging or unit conversion/);

// Mixed data deliberately combines an out-of-order timestamp, a duplicate,
// one missing flux, one row with both invalid time and flux, a negative flux,
// and an invalid uncertainty. No record may be silently removed or rewritten.
const rows = [
  [3, 10, 0.1],
  [1, 11, 0.1],
  [1, 12, 0.1],
  [10, null, 0.1],
  [12, -1, -0.1],
  [NaN, NaN, NaN],
  [15, 15, 0]
];
const snapshot = rows.map(row => row.slice());
const mapping = {
  timeIndex: 0,
  header: ['TIME', 'FLUX', 'ERR'],
  bands: [{ label: 'Banda teste', rateIndex: 1, errorIndex: 2 }]
};
const q = core.datasetQualityDiagnostics(rows, mapping, {
  gapFactor: 2, embedding: 2, wpeScales: 8, wpeDimension: 4, wpeDelay: 1
});
const b = q.bands[0];
assert.equal(q.rowCount, 7);
assert.equal(q.finiteTimeCount, 6);
assert.equal(q.missingOrInvalidTimeCount, 1);
assert.equal(q.orderReversals, 1);
assert.equal(q.duplicateTimeCount, 1);
assert.equal(q.globalCadence.medianCadence, 2.5);
assert.equal(q.globalCadence.cadenceMAD, 0.5);
assert.equal(q.globalCadence.gapCount, 1);
assert.equal(b.nTimeFluxValid, 5);
assert.equal(b.missingOrInvalidTime, 1);
assert.equal(b.missingOrInvalidFlux, 2, 'missing-flux count is independent from missing-time count');
assert.equal(b.negativeFluxCount, 1, 'negative values are flagged, not discarded');
assert.equal(b.nErrorValid, 4);
assert.equal(b.missingOrInvalidError, 1);
assert.equal(b.sampleEntropyCandidate, true);
assert.equal(b.fisherShannonCandidate, false);
assert.equal(b.modulationCandidate, true);
assert.equal(b.wpeScalePoints, 0);
assert.equal(b.wpeMaxScaleCandidate, false);
assert.ok(b.alerts.some(s => /fluxo.*negativo/i.test(s)));
assert.ok(b.alerts.some(s => /incerteza.*inválida/i.test(s)));
assert.deepEqual(rows, snapshot, 'source table rows must not be mutated');
assert.equal(q.originalRowsPreserved, true);
assert.deepEqual(q.transformationsApplied, []);
assert.equal(q.interpolationApplied, false);
assert.equal(q.duplicateRowsMerged, false);

// Duplicate and overlapping mapping warnings must be explicit.
const mapBad = {
  timeIndex: 0,
  header: ['TIME', 'FLUX', 'flux'],
  bands: [
    { label: 'B1', rateIndex: 1, errorIndex: 2 },
    { label: 'B2', rateIndex: 1, errorIndex: 1 }
  ]
};
const qBad = core.datasetQualityDiagnostics(rows, mapBad, { gapFactor: 3 });
assert.ok(qBad.mappingWarnings.some(s => /várias bandas/i.test(s)));
assert.ok(qBad.mappingWarnings.some(s => /papéis diferentes/i.test(s)));
assert.ok(qBad.mappingWarnings.some(s => /nomes de colunas duplicados/i.test(s)));
assert.equal(qBad.duplicatedRateColumns.length, 1);
assert.equal(qBad.overlapColumns.length, 1);
const qDupErrors=core.datasetQualityDiagnostics(rows,{timeIndex:0,header:['TIME','FLUX_A','FLUX_B','ERR'],bands:[{label:'A',rateIndex:1,errorIndex:3},{label:'B',rateIndex:2,errorIndex:3}]});
assert.equal(qDupErrors.duplicatedErrorColumns.length,1);
assert.ok(qDupErrors.mappingWarnings.some(s=>/colunas de incerteza.*várias bandas/i.test(s)));

// Missing time mapping should not invent a cadence.
const noTime = core.datasetQualityDiagnostics(rows, {
  timeIndex: -1, header: ['FLUX'], bands: [{ label: 'B1', rateIndex: 0, errorIndex: -1 }]
});
assert.equal(noTime.finiteTimeCount, 0);
assert.equal(noTime.globalCadence.medianCadence, null);
assert.ok(noTime.mappingWarnings.some(s => /Nenhuma coluna de tempo/i.test(s)));

// Large tables retain exact row/eligibility counts but transparently sample cadence.
const large = Array.from({ length: 5000 }, (_, i) => [i, Math.sin(i / 20), 0.1]);
const largeSnapshotFirst = large[0].slice(), largeSnapshotLast = large.at(-1).slice();
const largeQ = core.datasetQualityDiagnostics(large, {
  timeIndex: 0, header: ['TIME', 'FLUX', 'ERR'], bands: [{ label: 'B1', rateIndex: 1, errorIndex: 2 }]
}, { maxCadencePoints: 1000, gapFactor: 3 });
assert.equal(largeQ.rowCount, 5000);
assert.equal(largeQ.bands[0].nTimeFluxValid, 5000);
assert.equal(largeQ.cadenceSampled, true);
assert.equal(largeQ.cadenceStride, 5);
assert.ok(largeQ.mappingWarnings.some(s => /amostra sistemática/i.test(s)));
assert.deepEqual(large[0], largeSnapshotFirst);
assert.deepEqual(large.at(-1), largeSnapshotLast);

console.log('PASS data-quality-validation — máscaras por método, ausências independentes, fluxo negativo preservado, cadência/MAD/lacunas, duplicatas/mapeamento, amostragem transparente e ausência de mutação.');
