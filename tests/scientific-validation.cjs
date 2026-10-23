'use strict';
const assert = require('node:assert/strict');
const Core = require('../assets/laboratory/analysis-core.js');

function approx(actual, expected, tol, message) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tol,
    `${message}: ${actual} versus ${expected} (tol ${tol})`);
}
function mean(a) { return a.reduce((s,v)=>s+v,0)/a.length; }
function popStd(a) { const m=mean(a); return Math.sqrt(mean(a.map(v=>(v-m)**2))); }
function assertFiniteOrNull(v, label) { assert.ok(v === null || Number.isFinite(v), `${label} must be finite or null`); }

// Independent, deliberately straightforward SampEn reference: pairwise O(N^2) count.
function bruteSampen(values, m, toleranceMultiplier) {
  const s=popStd(values);
  if (!Number.isFinite(s) || s===0 || values.length < m+2) return {value:null,A:0,B:0};
  const z=values.map(v=>(v-mean(values))/s), radius=toleranceMultiplier, templates=z.length-m;
  const count=dim=>{
    let n=0;
    for(let i=0;i<templates;i++) for(let j=i+1;j<templates;j++) {
      let match=true;
      for(let k=0;k<dim;k++) if(Math.abs(z[i+k]-z[j+k])>radius){match=false;break;}
      if(match)n++;
    }
    return n;
  };
  const B=count(m), A=count(m+1);
  return {value:A>0&&B>0?-Math.log(A/B):null,A,B};
}

// Reference WPE with stable ordinal ranks and variance-based pattern weights.
function bruteWPE(values, dimension=4, delay=1) {
  const total=values.length-(dimension-1)*delay;
  if(total<1)return null;
  const bins=new Map(); let sumWeights=0;
  for(let i=0;i<total;i++) {
    const v=Array.from({length:dimension},(_,k)=>values[i+k*delay]);
    const center=mean(v); const weight=mean(v.map(x=>(x-center)**2));
    const order=v.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value||a.index-b.index).map(o=>o.index).join(',');
    bins.set(order,(bins.get(order)||0)+weight); sumWeights+=weight;
  }
  if(!(sumWeights>0))return null;
  let H=0; for(const weight of bins.values()){const p=weight/sumWeights;if(p>0)H-=p*Math.log(p);}
  return H;
}

// Independent dense-grid profile likelihood check for the modulation MLE.
function bruteGridModulation(points, steps=30000) {
  const ys=points.map(p=>p.y), es=points.map(p=>p.error), m=mean(ys), sd=popStd(ys);
  const qmax=Math.max(6*sd,6*Math.max(...es),Math.abs(m)*1e-5,1e-14);
  function logL(q){
    const vars=es.map(e=>e*e+q*q);
    const weights=vars.map(v=>1/v);
    const mu=ys.reduce((s,y,i)=>s+y*weights[i],0)/weights.reduce((s,w)=>s+w,0);
    if(!(mu>0))return {ll:-Infinity,mu};
    let ll=0; for(let i=0;i<ys.length;i++)ll-=0.5*(Math.log(2*Math.PI*vars[i])+(ys[i]-mu)**2/vars[i]);
    return {ll,mu};
  }
  let best={q:0,...logL(0)};
  for(let i=1;i<=steps;i++){
    const q=qmax*i/steps, p=logL(q);
    if(p.ll>best.ll)best={q,...p};
  }
  return 100*best.q/best.mu;
}

assert.match(Core.VERSION,/13\.08/, 'core must advertise version 13.08');

// 01 Sample Entropy — counts, formula, invariance, and undefined cases.
const series=Array.from({length:72},(_,i)=>Math.sin(i*0.71)+0.3*Math.cos(i*1.37)+0.08*Math.sin(i*2.2));
for(const [m,r] of [[2,0.2],[2,0.35],[3,0.3]]) {
  const expected=bruteSampen(series,m,r), got=Core.sampleEntropy(series,m,r);
  assert.equal(got.A,expected.A,`SampEn A count must match brute reference for m=${m}, r=${r}`);
  assert.equal(got.B,expected.B,`SampEn B count must match brute reference for m=${m}, r=${r}`);
  if(expected.value===null)assert.equal(got.value,null);else approx(got.value,expected.value,1e-12,'SampEn formula -ln(A/B)');
}
const seBase=Core.sampleEntropy(series,2,0.25), seShift=Core.sampleEntropy(series.map(x=>x+31),2,0.25), seScale=Core.sampleEntropy(series.map(x=>x*7),2,0.25);
assert.equal(seBase.A,seShift.A); assert.equal(seBase.B,seShift.B); assert.equal(seBase.A,seScale.A); assert.equal(seBase.B,seScale.B);
approx(seBase.value,seShift.value,1e-12,'SampEn translation invariance'); approx(seBase.value,seScale.value,1e-12,'SampEn positive-scale invariance with sigma-relative r');
assert.equal(Core.sampleEntropy(Array(20).fill(4),2,0.2).value,null,'constant series SampEn must be undefined');
assert.equal(Core.sampleEntropy([1,2,3],2,0.2).value,null,'short-series SampEn must be undefined');

// 02 Fisher–Shannon — finite output, analytic affine scaling relations, degeneracy.
const fsSeries=Array.from({length:100},(_,i)=>Math.sin(i*1.3)+Math.cos(i*0.27));
const fs=Core.fisherShannonKDE(fsSeries), fsTrans=Core.fisherShannonKDE(fsSeries.map(x=>4*x+9));
assert.ok([fs.H,fs.N_X,fs.fisher,fs.complexityProduct].every(Number.isFinite),'Fisher–Shannon reference series must be finite');
assert.ok(fs.N_X>0 && fs.fisher>=0 && fs.complexityProduct>=0,'Fisher–Shannon quantities must respect basic domain');
approx(fsTrans.H-fs.H,Math.log(4),0.025,'differential entropy shift under x -> 4x+9');
approx(fsTrans.N_X/fs.N_X,16,0.25,'entropy power scales quadratically under x -> 4x+9');
approx(fsTrans.fisher/fs.fisher,1/16,0.025,'Fisher information inverse-square scale');
approx(fsTrans.complexityProduct,fs.complexityProduct,0.03,'Fisher–Shannon product affine-scale invariance');
assert.equal(Core.fisherShannonKDE(Array(50).fill(2)).status,'degenerate','constant series KDE must be marked degenerate');
assert.equal(Core.fisherShannonKDE(Array(50).fill(2)).complexityProduct,null,'degenerate KDE must not become a numeric zero');
const gaussian=Core.fisherShannonGaussianReference(2);
approx(gaussian.H,0.5*Math.log(2*Math.PI*Math.E*4),1e-12,'Gaussian differential entropy analytic reference');
approx(gaussian.N_X,4,1e-12,'Gaussian entropy power analytic reference');
approx(gaussian.fisher,0.25,1e-12,'Gaussian Fisher information analytic reference');
approx(gaussian.complexityProduct,1,1e-12,'Gaussian Fisher–Shannon product is one');
const kdeMeta=Core.fisherShannonKDE(fsSeries,{gridCount:241,bandwidthFactor:1.1});
assert.equal(kdeMeta.gridCount,241,'KDE grid count is recorded');
assert.ok(Number.isFinite(kdeMeta.normalizationAreaBefore)&&Number.isFinite(kdeMeta.normalizationAreaAfter),'KDE normalization diagnostics are reported');
approx(kdeMeta.normalizationAreaAfter,1,1e-8,'normalized KDE area approaches one');
const stability=Core.fisherShannonKDEStability(fsSeries,{bandwidthFactors:[0.8,1,1.25],gridCounts:[161,241]});
assert.equal(stability.bandwidthSweep.length,3,'bandwidth sensitivity sweep includes requested factors');
assert.equal(stability.gridSweep.length,2,'grid sensitivity sweep includes requested grid counts');
assert.match(stability.note,/tolerância antes de avaliar/i,'KDE stability has no unregistered universal threshold');

// 03 Intrinsic modulation — compare ML estimate to an independent dense-grid profile.
const modPoints=Array.from({length:35},(_,i)=>({y:10+Math.sin(i*0.8)*1.2+0.2*Math.cos(i*0.31),error:0.25+0.02*(i%3)}));
const mod=Core.intrinsicModulation(modPoints,true), modRef=bruteGridModulation(modPoints);
assert.equal(mod.status,'OK','synthetic interior MLE case should yield an interior estimate');
approx(mod.value,modRef,0.035,'MLE modulation versus independent dense-grid reference');
assert.ok(Number.isFinite(mod.interval68Lower)&&Number.isFinite(mod.interval68Upper)&&mod.interval68Lower<=mod.value&&mod.value<=mod.interval68Upper,'interior profile-likelihood interval should bracket estimate in the test fixture');
const modScaled=Core.intrinsicModulation(modPoints.map(p=>({y:p.y*3,error:p.error*3})),true);
approx(mod.value,modScaled.value,1e-5,'intrinsic modulation percentage invariance to a common flux/error unit scale');
const boundary=Core.intrinsicModulation([{y:10,error:1},{y:10.1,error:1},{y:9.9,error:1}],true);
assert.equal(boundary.status,'upper_limit_candidate','MLE at sigma0=0 must be identified as limit candidate, not detection');
assert.equal(boundary.value,null,'boundary case must not report a detected intrinsic modulation');
assert.ok(Number.isFinite(boundary.upperLimit)&&boundary.upperLimit>0,'boundary case should provide a finite upper-limit candidate for this fixture');
assert.equal(boundary.profileLimitDelta2LogL,2.71,'upper limit must record its nominal profile-likelihood threshold');
assert.equal(mod.intervalDelta2LogL,1,'interior interval must record Delta(-2 ln L)=1');
assert.match(mod.intervalMethod,/profile likelihood ratio/i,'interior interval method must be documented as profile likelihood');
assert.equal(Core.intrinsicModulation([{y:1,error:1},{y:2,error:1}],true).status,'insufficient_paired_data','too few paired points must be explicit');
assert.equal(Core.intrinsicModulation([{y:-2,error:1},{y:-1,error:1},{y:-3,error:1}],true).status,'nonpositive_mean','non-positive mean must not become a positive modulation percentage');
assert.equal(Core.intrinsicModulation(modPoints,false).status,'missing_error_column','missing observational errors must be explicit');
const oldDiagnostic=Core.intrinsicModulationExcessVariance(modPoints,true);
assertFiniteOrNull(oldDiagnostic.value,'legacy excess-variance diagnostic');

// 04 MSE-WPE/CI — compare one scale to independent WPE, affine invariance, no silent zero CI.
const wpeSeries=Array.from({length:96},(_,i)=>Math.sin(i*0.43)+0.27*Math.cos(i*1.1)+0.03*(i%7));
const mse=Core.calculateMSE(wpeSeries,{scales:6,dimension:4,delay:1});
const wpeRef=bruteWPE(wpeSeries,4,1);
assert.ok(Number.isFinite(mse.points[0].value),'WPE first scale should be estimable for fixture');
approx(mse.points[0].value,wpeRef,1e-12,'WPE first scale versus independent implementation');
for(const point of mse.points) if(Number.isFinite(point.normalized)) assert.ok(point.normalized>=-1e-12&&point.normalized<=1+1e-12,'normalized WPE must lie between zero and one');
assert.equal(mse.validScales,6,'fixture should estimate all six scales');
assert.ok(Number.isFinite(mse.CI),'CI is allowed only when all requested scales are valid');
assert.equal(mse.ciStatus,'experimental-definition-unconfirmed','legacy CI sum remains explicitly experimental until its definition is homologated');
assert.equal(mse.ciReferenceStatus,'not-found-in-v0.22-reference-archive','do not claim V0.22 contains a CI definition');
assert.match(mse.ciDefinition,/soma discreta da WPE bruta/i,'the provisional CI convention must be explicit');
assert.equal(mse.scaleType,'observation-count','ordinal scale must not be assumed to equal physical time');
const mseAffine=Core.calculateMSE(wpeSeries.map(x=>7*x+12),{scales:6,dimension:4,delay:1});
for(let i=0;i<mse.points.length;i++) approx(mseAffine.points[i].value,mse.points[i].value,1e-10,`WPE affine invariance at scale ${i+1}`);
const constantMse=Core.calculateMSE(Array(40).fill(7),{scales:8,dimension:4,delay:1});
assert.ok(constantMse.validScales<8,'constant fixture should leave at least some WPE scales unestimable');
assert.equal(constantMse.CI,null,'CI with any missing scale must be null, not a sum with zero substituted');
for(const value of [fs.H,fs.N_X,fs.fisher,mod.value,mod.upperLimit,mse.CI]) assertFiniteOrNull(value,'scientific output');

console.log('PASS scientific-validation — regressão dos 4 pilares: SampEn, Fisher–Shannon, modulação MLE e WPE/CI com convenção provisória explícita.');
