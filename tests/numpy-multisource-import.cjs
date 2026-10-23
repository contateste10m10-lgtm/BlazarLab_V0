'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const lib = require(path.join(root,'assets/laboratory/data-library.js'));

global.pako = { inflateRaw: input => new Uint8Array(zlib.inflateRawSync(Buffer.from(input))) };
function npyHeader(descr, shape) {
  let shapeText = shape.length === 0 ? '()' : `(${shape.join(', ')}${shape.length === 1 ? ',' : ''})`;
  let descrText = String(descr).startsWith('[') ? String(descr) : `'${descr}'`;
  let header = `{'descr': ${descrText}, 'fortran_order': False, 'shape': ${shapeText}, }`;
  const prefix = 10;
  const pad = (16 - ((prefix + Buffer.byteLength(header, 'latin1') + 1) % 16)) % 16;
  header += ' '.repeat(pad) + '\n';
  const h = Buffer.from(header, 'latin1');
  const start = Buffer.alloc(10);
  start.set([0x93,0x4e,0x55,0x4d,0x50,0x59,1,0]);
  start.writeUInt16LE(h.length,8);
  return Buffer.concat([start,h]);
}
function npyFloat64(values, shape=[values.length], name='array.npy') {
  const h=npyHeader('<f8',shape), data=Buffer.alloc(values.length*8);
  values.forEach((v,i)=>data.writeDoubleLE(v,i*8));
  return Buffer.concat([h,data]);
}
function npyUnicode(values, width=32, shape=[values.length]) {
  const h=npyHeader(`<U${width}`,shape), data=Buffer.alloc(values.length*width*4);
  values.forEach((value,i)=>{const points=Array.from(String(value),c=>c.codePointAt(0));points.slice(0,width).forEach((cp,j)=>data.writeUInt32LE(cp,(i*width+j)*4));});
  return Buffer.concat([h,data]);
}
function npyStructuredPairs(rows) {
  const h=npyHeader("[('time', '<f8'), ('flux', '<f8')]",[rows.length]);
  const data=Buffer.alloc(rows.length*16);
  rows.forEach((row,i)=>{data.writeDoubleLE(row[0],i*16);data.writeDoubleLE(row[1],i*16+8);});
  return Buffer.concat([h,data]);
}
function crc32(buffer) {
  let crc=0xffffffff;
  for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function makeZip(entries, useDeflate=false) {
  const locals=[],centrals=[];let offset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name,'utf8'),raw=Buffer.from(entry.data),method=useDeflate?8:0;
    const compressed=useDeflate?zlib.deflateRawSync(raw):raw,crc=crc32(raw);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(method,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);
    locals.push(local,name,compressed);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(method,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt16LE(0,34);central.writeUInt32LE(0,38);central.writeUInt32LE(offset,42);
    centrals.push(central,name);offset+=local.length+name.length+compressed.length;
  }
  const centralBytes=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,centralBytes,end]);
}
function asArrayBuffer(buf){return buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);}

const flux=lib.readNpy(asArrayBuffer(npyFloat64([1.25,2.5,3.75])), 'flux.npy');
assert.deepEqual(flux.header,['indice_observacao','flux']);
assert.deepEqual(flux.rows,[['0','1.25'],['1','2.5'],['2','3.75']]);
assert.equal(flux.sourceType,'NPY');

const matrix=lib.readNpy(asArrayBuffer(npyFloat64([1,2,3,4],[2,2])), 'matriz.npy');
assert.deepEqual(matrix.header,['indice_observacao','matriz_1','matriz_2']);
assert.deepEqual(matrix.rows,[['0','1','2'],['1','3','4']]);

const structured=lib.readNpy(asArrayBuffer(npyStructuredPairs([[59000.5,1.1],[59001.5,1.3]])), 'curva.npy');
assert.deepEqual(structured.header,['time','flux']);
assert.deepEqual(structured.rows,[['59000.5','1.1'],['59001.5','1.3']]);

const npz=makeZip([
  {name:'tempo.npy',data:npyFloat64([59000,59001,59002])},
  {name:'fluxo.npy',data:npyFloat64([1.1,1.3,1.2])},
  {name:'fonte.npy',data:npyUnicode(['Swift BAT exemplo'],32,[])}
],true);
const npzTable=lib.readNpz(asArrayBuffer(npz),'arrays.npz');
assert.deepEqual(npzTable.header,['tempo','fluxo','fonte']);
assert.equal(npzTable.rows.length,3);
assert.deepEqual(npzTable.rows.map(row=>row[0]),['59000','59001','59002']);
assert.deepEqual(npzTable.rows.map(row=>row[1]),['1.1','1.3','1.2']);
assert.deepEqual(npzTable.rows.map(row=>row[2]),['Swift BAT exemplo','Swift BAT exemplo','Swift BAT exemplo']);

const libraryZip=makeZip([
  {name:'catalogo/a.csv',data:Buffer.from('fonte,tempo,fluxo\nA,1,2\n','utf8')},
  {name:'arrays/curva.npz',data:npz}
],false);
const items=lib.unzip(asArrayBuffer(libraryZip),'biblioteca.zip');
assert.equal(items.length,2);
assert.ok(items.some(item=>item.name==='catalogo/a.csv'));
assert.ok(items.some(item=>item.name==='arrays/curva.npz'));

assert.throws(()=>lib.readNpy(asArrayBuffer(npyHeader('|O', [1])),'unsafe-object.npy'),/Dtype NumPy não suportado/);
const mismatch=makeZip([
  {name:'tempo.npy',data:npyFloat64([1,2,3])},
  {name:'fluxo.npy',data:npyFloat64([1,2])}
]);
assert.throws(()=>lib.readNpz(asArrayBuffer(mismatch),'mismatch.npz'),/não foi alinhado automaticamente/);

const app=fs.readFileSync(path.join(root,'assets/laboratory/app.js'),'utf8');
const start=app.indexOf('function batchCanonicalHeader');
const end=app.indexOf('function renderBatchLibraryManifest()',start);
assert.ok(start>=0&&end>start,'multisource table normalization helpers must exist');
const vm=require('node:vm');
const context={normName:s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(),console};
vm.createContext(context);vm.runInContext(app.slice(start,end),context,{timeout:5000});
const merged=context.mergeLibraryTables([
  {filename:'curva_A.csv',header:['source','time','flux'],rows:[['A','1','10'],['B','2','11']],delimiter:','},
  {filename:'metricas_B.csv',header:['fonte','tempo','sampen','classe'],rows:[['C','3','0.5','FSRQ']],delimiter:','}
]);
assert.equal(merged.rows.length,3);
const ix=Object.fromEntries(merged.header.map((name,i)=>[name,i]));
assert.ok('arquivo_importado_de' in ix);
assert.deepEqual(Array.from(merged.rows, row=>row[ix.fonte]),['A','B','C']);
assert.deepEqual(Array.from(merged.rows, row=>row[ix.arquivo_importado_de]),['curva_A.csv','curva_A.csv','metricas_B.csv']);
assert.equal(merged.rows[2][ix.fluxo],'');
assert.equal(merged.rows[2][ix.sampen],'0.5');

const html=fs.readFileSync(path.join(root,'assets/laboratory/fragment.html'),'utf8');
const loader=fs.readFileSync(path.join(root,'laboratorio-loader.js'),'utf8');
assert.match(html,/id="batchDataFile"[^>]*multiple/);
assert.match(html,/id="batchLibraryFolderInput"[^>]*webkitdirectory/);
assert.match(html,/id="batchLibraryZipInput"/);
assert.match(html,/\.npy/);assert.match(html,/\.npz/);
assert.match(loader,/assets\/laboratory\/data-library\.js/);
assert.match(app,/function handleBatchFiles\(files\)/);
assert.match(app,/function mergeLibraryTables\(tables\)/);
console.log('PASS numpy-multisource-import — NPY 1D/2D/estruturado, NPZ DEFLATE, scalar metadata, ZIP biblioteca, comprimentos incompatíveis, dtype object bloqueado e merge multifonte preservando fonte/arquivo.');
