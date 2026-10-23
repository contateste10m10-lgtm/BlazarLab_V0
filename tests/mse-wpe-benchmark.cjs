'use strict';
const assert = require('node:assert/strict');
const Core = require('../assets/laboratory/analysis-core.js');
function seededNoise(n,seed=0x7a6b5c4d){let x=seed>>>0;return Array.from({length:n},()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return (x/4294967296)*2-1;});}
(async()=>{
  const records=[];
  for(const n of [1000,5000,15000]){
    const values=seededNoise(n);
    const before=process.memoryUsage().heapUsed;
    const start=process.hrtime.bigint();
    const result=await Core.calculateMSEAsync(values,{scales:8,dimension:4,delay:1});
    const elapsedMs=Number(process.hrtime.bigint()-start)/1e6;
    const heapDeltaMiB=(process.memoryUsage().heapUsed-before)/(1024*1024);
    assert.equal(result.points.length,8,`length ${n}: all requested scales should be reported`);
    assert.equal(result.validScales,8,`length ${n}: seeded noise should have enough vectors at every scale`);
    assert.equal(result.cancelled,false);
    records.push({n,elapsedMs:Number(elapsedMs.toFixed(2)),heapDeltaMiB:Number(heapDeltaMiB.toFixed(2))});
  }
  console.log(`PASS mse-wpe-benchmark — runtime/heap observations (not pass/fail thresholds): ${JSON.stringify(records)}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
