'use strict';
const assert = require('node:assert/strict');
const Core = require('../assets/laboratory/analysis-core.js');
function approx(a,b,tol,msg){assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol,`${msg}: ${a} vs ${b}`)}
function independentWPE(x,d=4,delay=1){
  if(!Array.isArray(x)||x.some(v=>!Number.isFinite(v)))return null;
  const n=x.length-(d-1)*delay;if(n<2)return null;
  const scale=Math.max(...x.map(Math.abs));if(!(scale>0))return null;
  const bins=new Map();let total=0;
  for(let i=0;i<n;i++){
    const v=Array.from({length:d},(_,k)=>x[i+k*delay]);
    const wv=v.map(q=>q/scale),m=wv.reduce((a,b)=>a+b,0)/d;
    const w=wv.reduce((s,q)=>s+(q-m)**2,0)/d;
    const pat=v.map((q,j)=>({q,j})).sort((a,b)=>a.q<b.q?-1:a.q>b.q?1:a.j-b.j).map(p=>p.j).join(',');
    bins.set(pat,(bins.get(pat)||0)+w);total+=w;
  }
  if(!(total>0))return null;let H=0;
  for(const w of bins.values()){const p=w/total;if(p>0)H-=p*Math.log(p)}
  return H;
}
function seededNoise(n,seed=0x1234abcd){let x=seed>>>0;return Array.from({length:n},()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return ((x/4294967296)-0.5)*2;});}

assert.match(Core.VERSION,/13\.08/);
// Analytic/reference equivalence at scale s=1.
const sample=Array.from({length:257},(_,i)=>Math.sin(i*.17)+.21*Math.cos(i*.73)+.015*(i%11));
const wpe=Core.weightedPermutationEntropy(sample,4,1);
approx(wpe.value,independentWPE(sample,4,1),1e-12,'production WPE matches independent direct implementation');
const mse=Core.calculateMSE(sample,{scales:8,dimension:4,delay:1});
approx(mse.points[0].value,wpe.value,1e-12,'MSE scale one equals direct WPE');
assert.ok(mse.points.every(p=>p.discarded===sample.length%p.scale),'each scale records discarded tail points');
assert.equal(mse.scaleType,'observation-count');
assert.equal(mse.tailPolicy,'discard-incomplete-final-block');
for(const p of mse.points)if(Number.isFinite(p.normalized))assert.ok(p.normalized>=0&&p.normalized<=1,'normalized WPE is bounded in [0,1]');

// Coarse-graining contract, including remainder handling.
const cg=Core.coarseGrainDetailed([1,2,3,4,5,6,7,8,9,10],3);
assert.deepEqual(cg.values,[2,5,8]);assert.equal(cg.discarded,1);assert.equal(cg.outputLength,3);assert.equal(cg.tailPolicy,'discard-incomplete-final-block');
assert.deepEqual(Core.coarseGrain([1,2,3,4,5,6,7,8,9,10],3),[2,5,8]);
assert.equal(Core.coarseGrainDetailed([1,2],3).status,'insufficient');
assert.equal(Core.coarseGrainDetailed([1,2,NaN,4],2).status,'invalid-data','missing data must not be silently filtered');
assert.deepEqual(Core.coarseGrain([1,2,NaN,4],2),[],'invalid order must not be reconstructed by removing bad rows');

// Constants, strict trends, periodic data, ties, and fixed-seed reproducibility.
const constant=Core.weightedPermutationEntropy(Array(64).fill(7),4,1);
assert.equal(constant.value,null);assert.equal(constant.status,'zero-weight');
const increasing=Core.weightedPermutationEntropy(Array.from({length:80},(_,i)=>i+1),4,1);
assert.equal(increasing.value,0);assert.equal(increasing.status,'experimental');assert.equal(increasing.distinctPatterns,1);
const periodic=Array.from({length:120},(_,i)=>Math.sin(i*Math.PI/2));
const p1=Core.weightedPermutationEntropy(periodic,3,1),p2=Core.weightedPermutationEntropy(periodic,3,1);
assert.equal(p1.value,p2.value);assert.equal(p1.distinctPatterns,p2.distinctPatterns);
const tied=Core.weightedPermutationEntropy([1,1,2,2,1,3,3,2,1,1,4,2,3,1,2,4,4,1,3,2,5,1,0,3],3,1);
assert.ok(Number.isFinite(tied.value));assert.ok(tied.tieTemplates>0);assert.match(tied.tiePolicy,/ordem temporal/);
const noise=seededNoise(300),noiseA=Core.weightedPermutationEntropy(noise,4,1),noiseB=Core.weightedPermutationEntropy(seededNoise(300),4,1);
approx(noiseA.value,noiseB.value,0,'fixed-seed WPE reproducibility');

// Affine invariance for positive/negative scale and translation when no ties are introduced.
for(const transform of [x=>7*x+12,x=>-2.5*x+4]){
  const altered=Core.weightedPermutationEntropy(sample.map(transform),4,1);
  approx(altered.value,wpe.value,1e-10,'weighted motif entropy affine invariance');
}
// Extreme magnitudes must not overflow weight accumulation; tiny-but-representable values must not underflow to zero.
const extreme=[1e308,-1e308,8e307,-8e307,6e307,-6e307,4e307,-4e307,2e307,-2e307,1e307,-1e307,9e306,-9e306,7e306,-7e306,5e306,-5e306,3e306,-3e306,2e306,-2e306,1e306,-1e306];
assert.ok(Number.isFinite(Core.weightedPermutationEntropy(extreme,3,1).value),'extreme finite values should not overflow WPE');
const tiny=Core.weightedPermutationEntropy([1e-300,2e-300,4e-300,3e-300,7e-300,1e-300,6e-300,2e-300,8e-300,3e-300,4e-300,9e-300,5e-300,1e-300,6e-300,3e-300,7e-300],3,1);
assert.ok(Number.isFinite(tiny.value),'tiny representable amplitudes should not underflow to a zero-weight series');

// Insufficient templates and sparse-support warnings are explicit.
assert.equal(Core.weightedPermutationEntropy([1,2,3,4],4,1).status,'insufficient');
const sparse=Core.weightedPermutationEntropy(Array.from({length:20},(_,i)=>Math.sin(i*.8)+i*.02),4,1);
assert.ok(Number.isFinite(sparse.value));assert.equal(sparse.status,'experimental-sparse');assert.match(sparse.reason,/Amostra esparsa/);
assert.equal(Core.weightedPermutationEntropy([1,2,3,4,5],8,1).status,'invalid-dimension');
assert.equal(Core.weightedPermutationEntropy([1,2,3,4],3,0).status,'invalid-delay');
const bad=Core.weightedPermutationEntropy([1,2,NaN,4,5,6],3,1);
assert.equal(bad.value,null);assert.equal(bad.status,'invalid-data');

// CI uses the current legacy sum only as a provisional experimental convention; never fill missing scales with zero.
const complete=Core.calculateMSE(sample,{scales:6,dimension:4,delay:1});
assert.equal(complete.validScales,6);approx(complete.CI,complete.points.reduce((sum,p)=>sum+p.value,0),1e-12,'provisional CI equals the discrete raw-WPE sum');
assert.equal(complete.ciStatus,'experimental-definition-unconfirmed');assert.equal(complete.ciReferenceStatus,'not-found-in-v0.22-reference-archive');
const incomplete=Core.calculateMSE(Array(40).fill(7),{scales:8,dimension:4,delay:1});
assert.equal(incomplete.CI,null);assert.equal(incomplete.ciStatus,'incomplete');assert.ok(incomplete.validScales<8);
const invalid=Core.calculateMSE([1,2,NaN,4,5,6,7,8,9,10],{scales:4,dimension:3,delay:1});
assert.equal(invalid.validScales,0);assert.equal(invalid.CI,null);assert.ok(invalid.points.every(p=>p.status==='invalid-data'));
assert.match(invalid.reason,/não são substituídas por zero/);
// Physical time cannot be inferred from the ordinal series alone.
assert.equal(complete.physicalTimeScale,null);assert.equal(complete.scaleType,'observation-count');
(async () => {
  // The asynchronous scale runner yields between scales and must return a cancelled, non-promotable partial result.
  let progressCount = 0;
  const partial = await Core.calculateMSEAsync(sample, { scales: 8, dimension: 4, delay: 1 }, {
    shouldCancel: () => progressCount >= 3,
    onProgress: () => { progressCount += 1; }
  });
  assert.equal(partial.cancelled, true, 'async MSE must acknowledge cancellation');
  assert.equal(partial.status, 'cancelled-partial');
  assert.equal(partial.CI, null, 'partial scales must never be promoted to CI');
  assert.equal(partial.points.length, 3, 'cancellation should stop at the completed scale batch boundary');
  assert.equal(partial.ciStatus, 'cancelled-partial');
  let completedScales = 0;
  const completeAsync = await Core.calculateMSEAsync(sample, { scales: 5, dimension: 4, delay: 1 }, {
    onProgress: () => { completedScales += 1; }
  });
  assert.equal(completedScales, 5, 'async runner must report each completed scale');
  assert.equal(completeAsync.cancelled, false);
  assert.equal(completeAsync.points.length, 5);
  assert.equal(completeAsync.validScales, Core.calculateMSE(sample, { scales: 5, dimension: 4, delay: 1 }).validScales);
  console.log('PASS mse-wpe-validation — independent WPE, s=1 equivalence, coarse-graining remainder, invalid values, constants/trends/periodicity/ties, fixed seed, affine invariance, extreme magnitudes, sparse/short scales, cancellation and provisional CI contract.');
})().catch(error => { console.error(error); process.exitCode = 1; });
