'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../assets/laboratory/app.js'),'utf8');

// Execute the exact ISO parsing helpers from app.js in isolation, so tests exercise
// the shipped implementation rather than a second handwritten parser.
const start=app.indexOf('function validIsoCalendarDate');
const end=app.indexOf('function splitLine',start);
assert.ok(start>=0&&end>start,'ISO parser helper block should be present');
const helpers=app.slice(start,end);
const context={Date,Number,String,RegExp};
vm.runInNewContext(`${helpers}\nglobalThis.helpers={validIsoCalendarDate,parseIsoTimeToken,isIsoTimeLikeToken,isIsoDatetimeWithoutTimezone};`,context);
const {validIsoCalendarDate,parseIsoTimeToken,isIsoTimeLikeToken,isIsoDatetimeWithoutTimezone}=context.helpers;
assert.equal(validIsoCalendarDate(2024,2,29),true);
assert.equal(validIsoCalendarDate(2023,2,29),false);
assert.ok(Number.isFinite(parseIsoTimeToken('2024-02-29')?.value));
assert.equal(parseIsoTimeToken('2024-02-31'),null,'impossible date must remain invalid');
assert.ok(Number.isFinite(parseIsoTimeToken('2024-01-01T10:30:00Z')?.value));
assert.ok(Number.isFinite(parseIsoTimeToken('2024-01-01T10:30:00-05:00')?.value));
assert.equal(parseIsoTimeToken('2024-01-01T25:30:00Z'),null,'invalid hour must not normalize');
assert.equal(parseIsoTimeToken('2024-01-01T10:30:00'),null,'timezone-free datetime must not be guessed');
assert.equal(isIsoDatetimeWithoutTimezone('2024-01-01T10:30:00'),true);
assert.equal(isIsoTimeLikeToken('2024-02-31T10:30:00Z'),true,'malformed ISO-looking strings must reach explicit invalid-time diagnostics');
assert.match(app,/const mixedTimeRepresentations=hasNumericTimeTokens&&hasIsoTimeTokens/,'mixed numeric and ISO time columns must be detected');
assert.match(app,/parsedTime&&mixedTimeRepresentations/,'ISO values must not be normalized into a mixed native coordinate column');
assert.match(app,/mixedIsoTimeRows/,'blocked conversions must be counted in diagnostics and provenance');
assert.match(app,/const hasSeveralScalarRates/,'FITS tables with scalar columns for separate bands should be supported');
assert.match(app,/const logicalRepeat=col\.format\.code==='A'\?1:col\.format\.repeat/,'fixed-width FITS strings must not become repeated columns');
console.log('PASS import-provenance-contract — strict calendar/clock checks, explicit timezone policy, mixed time coordinate protection and FITS scalar/string column contracts.');
