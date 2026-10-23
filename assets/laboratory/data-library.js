/* BlazarLab Privado 13.08 — importação local de bibliotecas e arrays NumPy.
 * Suporta tabelas NumPy numéricas/string 1D/2D, campos estruturados simples,
 * NPZ/ZIP comum (STORE ou DEFLATE). Não desserializa dtype=object/pickle.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BlazarDataLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';
  const MAX_ARCHIVE_ENTRIES = 2000;
  const MAX_ENTRY_BYTES = 200 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
  const MAX_ARRAY_ELEMENTS = 5_000_000;
  const utf8 = new TextDecoder('utf-8', {fatal:false});

  function fail(message) { throw new Error(message); }
  function sliceBuffer(u8) { return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); }
  function cleanName(value) { return String(value || '').replace(/\\/g,'/').split('/').filter(p=>p && p!=='.' && p!=='..').join('/'); }
  function basename(value) { return String(value||'').split(/[\\/]/).pop().replace(/\.[^.]+$/,'') || 'array'; }

  function headerValue(header, key) {
    const re = new RegExp("['\\\"]" + key + "['\\\"]\\s*:\\s*");
    const match = re.exec(header);
    if (!match) fail(`Cabeçalho NumPy sem o campo ${key}.`);
    let pos = match.index + match[0].length;
    while (/\s/.test(header[pos] || '')) pos++;
    const start = pos;
    if (header[pos] === '[' || header[pos] === '(' || header[pos] === '{') {
      const open = header[pos], close = open === '[' ? ']' : open === '(' ? ')' : '}';
      let depth = 0, quote = null, escaped = false;
      for (; pos < header.length; pos++) {
        const ch = header[pos];
        if (quote) { if (escaped) escaped=false; else if(ch==='\\')escaped=true; else if(ch===quote)quote=null; continue; }
        if (ch === "'" || ch === '"') { quote=ch; continue; }
        if (ch === open) depth++;
        if (ch === close && --depth === 0) return header.slice(start, pos+1);
      }
      fail(`Valor ${key} incompleto no cabeçalho NumPy.`);
    }
    if (header[pos] === "'" || header[pos] === '"') {
      const quote = header[pos++];
      let escaped = false;
      for (; pos < header.length; pos++) {
        const ch=header[pos];
        if (escaped) { escaped=false; continue; }
        if (ch==='\\') { escaped=true; continue; }
        if (ch===quote) return header.slice(start,pos+1);
      }
      fail(`Texto ${key} incompleto no cabeçalho NumPy.`);
    }
    while (pos < header.length && header[pos] !== ',' && header[pos] !== '}') pos++;
    return header.slice(start,pos).trim();
  }
  function unquote(s) { const t=String(s).trim(); return (t[0]==="'"||t[0]==='"')?t.slice(1,-1):t; }
  function dtypeInfo(descr) {
    const raw=String(descr).trim();
    if (/^[<>=|]?[Mm]\d+\[/.test(raw)) fail(`O dtype NumPy ${raw} representa data/hora com unidade embutida; converta explicitamente para uma coordenada numérica com unidade conhecida antes de importar.`);
    const m=raw.match(/^([<>=|]?)([a-zA-Z?])(\d+)$/);
    if(!m) fail(`Dtype NumPy não suportado: ${raw}. Use arrays numéricos ou texto UTF-8 simples; dtype=object/pickle não é aceito por segurança.`);
    const endian=m[1]||'=', kind=m[2], size=Number(m[3]);
    const valid = (kind==='f'&&[2,4,8].includes(size)) || ((kind==='i'||kind==='u')&&[1,2,4,8].includes(size)) || ((kind==='b'||kind==='?')&&size===1) || ((kind==='S'||kind==='a')&&size>=1&&size<=4096) || (kind==='U'&&size>=1&&size<=1024);
    if(!valid) fail(`Dtype NumPy ${raw} não é suportado neste navegador.`);
    return {descr:raw,endian,kind,size,width:kind==='U'?size*4:size,string:kind==='S'||kind==='a'||kind==='U',little:endian!=='>'};
  }
  function decodeHalf(bits) {
    const sign=(bits&0x8000)?-1:1, exp=(bits>>10)&31, frac=bits&1023;
    if(exp===0) return frac===0 ? sign*0 : sign*Math.pow(2,-14)*(frac/1024);
    if(exp===31) return frac===0 ? sign*Infinity : NaN;
    return sign*Math.pow(2,exp-15)*(1+frac/1024);
  }
  function readScalar(view, offset, info) {
    const le=info.little, {kind,size,width}=info;
    if(kind==='S'||kind==='a') {
      const bytes=new Uint8Array(view.buffer,view.byteOffset+offset,size);
      return utf8.decode(bytes).replace(/\0+$/g,'').trimEnd();
    }
    if(kind==='U') {
      const chars=[];
      for(let i=0;i<size;i++) { const cp=view.getUint32(offset+i*4,le); if(!cp)break; chars.push(cp); }
      try { let out=''; for(let i=0;i<chars.length;i+=2048)out+=String.fromCodePoint(...chars.slice(i,i+2048)); return out; }
      catch(_) { return chars.map(cp=>cp<=0x10ffff?String.fromCodePoint(cp):'�').join(''); }
    }
    if(kind==='b'||kind==='?') return view.getUint8(offset) ? 1 : 0;
    let n;
    if(kind==='f') n=size===2?decodeHalf(view.getUint16(offset,le)):size===4?view.getFloat32(offset,le):view.getFloat64(offset,le);
    else if(kind==='i') {
      if(size===1)n=view.getInt8(offset);
      else if(size===2)n=view.getInt16(offset,le);
      else if(size===4)n=view.getInt32(offset,le);
      else { const b=view.getBigInt64(offset,le); return b<=BigInt(Number.MAX_SAFE_INTEGER)&&b>=BigInt(Number.MIN_SAFE_INTEGER)?Number(b):b.toString(); }
    } else if(kind==='u') {
      if(size===1)n=view.getUint8(offset);
      else if(size===2)n=view.getUint16(offset,le);
      else if(size===4)n=view.getUint32(offset,le);
      else { const b=view.getBigUint64(offset,le); return b<=BigInt(Number.MAX_SAFE_INTEGER)?Number(b):b.toString(); }
    }
    return Number.isFinite(n) ? n : '';
  }
  function parseNpy(buffer, logicalName='array.npy') {
    const bytes=new Uint8Array(buffer);
    if(bytes.length<10 || bytes[0]!==0x93 || utf8.decode(bytes.subarray(1,6))!=='NUMPY') fail(`${logicalName}: assinatura de arquivo .npy inválida.`);
    const major=bytes[6], minor=bytes[7]; let headerStart,headerLength;
    const view=new DataView(buffer);
    if(major===1){headerLength=view.getUint16(8,true);headerStart=10;}
    else if(major===2||major===3){if(bytes.length<12)fail(`${logicalName}: cabeçalho NumPy truncado.`);headerLength=view.getUint32(8,true);headerStart=12;}
    else fail(`${logicalName}: versão NPY ${major}.${minor} não suportada.`);
    const dataStart=headerStart+headerLength;
    if(headerLength<1 || dataStart>bytes.length) fail(`${logicalName}: cabeçalho NumPy truncado.`);
    const decoder=major===3?new TextDecoder('utf-8',{fatal:false}):new TextDecoder('latin1',{fatal:false});
    const header=decoder.decode(bytes.subarray(headerStart,dataStart));
    const shapeRaw=headerValue(header,'shape');
    const shapeInside=shapeRaw.slice(1,-1).trim();
    const shape=shapeInside?shapeInside.split(',').map(s=>s.trim()).filter(Boolean).map(Number):[];
    if(shape.some(n=>n<0) || shape.length>2) fail(`${logicalName}: só arrays escalares, 1D e 2D são suportados; recebido shape ${shapeRaw}.`);
    const count=shape.length===0?1:shape.reduce((a,b)=>a*b,1);
    if(!Number.isSafeInteger(count)||count<1||count>MAX_ARRAY_ELEMENTS) fail(`${logicalName}: ${count} elementos excedem o limite seguro de ${MAX_ARRAY_ELEMENTS}.`);
    const fortranOrder=/['"]fortran_order['"]\s*:\s*True/.test(header);
    const descrRaw=headerValue(header,'descr');
    let descr;
    if(descrRaw.startsWith('[')) {
      const fields=[];
      const pattern=/\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g;
      let m;
      while((m=pattern.exec(descrRaw))!==null) fields.push({name:m[2],info:dtypeInfo(m[4])});
      if(!fields.length) fail(`${logicalName}: dtype estruturado vazio ou não suportado.`);
      const itemBytes=fields.reduce((s,f)=>s+f.info.width,0);
      if(!shape.length||shape.length!==1) fail(`${logicalName}: arrays estruturados precisam ser unidimensionais.`);
      if(dataStart+shape[0]*itemBytes>bytes.length) fail(`${logicalName}: payload menor que o dtype estruturado declarado.`);
      const columns=fields.map(field=>({name:field.name,values:[]}));
      for(let row=0;row<shape[0];row++) {
        let off=dataStart+row*itemBytes;
        for(let f=0;f<fields.length;f++){columns[f].values.push(readScalar(view,off,fields[f].info));off+=fields[f].info.width;}
      }
      return {filename:logicalName,shape,fortranOrder,columns,rowCount:shape[0],dtype:'structured'};
    }
    descr=unquote(descrRaw); const info=dtypeInfo(descr);
    const needed=count*info.width;
    if(dataStart+needed>bytes.length) fail(`${logicalName}: payload NumPy truncado; esperava ${needed} bytes.`);
    if(shape.length===0) return {filename:logicalName,shape,fortranOrder,columns:[{name:basename(logicalName),values:[readScalar(view,dataStart,info)]}],rowCount:1,dtype:descr,scalar:true};
    const rows=shape[0], cols=shape.length===2?shape[1]:1;
    const columns=[];
    for(let c=0;c<cols;c++) {
      const name=cols===1?basename(logicalName):`${basename(logicalName)}_${c+1}`;
      const values=[];
      for(let r=0;r<rows;r++) {
        const flat=shape.length===1?r:(fortranOrder?c*rows+r:r*cols+c);
        values.push(readScalar(view,dataStart+flat*info.width,info));
      }
      columns.push({name,values});
    }
    return {filename:logicalName,shape,fortranOrder,columns,rowCount:rows,dtype:descr,scalar:false};
  }
  function metadataName(name) {
    return /^(fonte|source|source_id|classe|class|classe_fonte|class_name|banda|band|janela|window|instrument|instrumento)$/i.test(String(name).trim());
  }
  function looksLikeTimeName(name) { return /^(tempo|time|mjd|jd|timestamp|date|data)$/i.test(String(name).trim()); }
  function makeTable(columns, rowCount, filename, options={}) {
    if(!columns.length) fail(`${filename}: nenhum array utilizável foi encontrado.`);
    const nonScalarLengths=columns.map(c=>c.values.length).filter(n=>n>1);
    const n=rowCount||nonScalarLengths[0]||1;
    if(!Number.isSafeInteger(n)||n<1||n>MAX_ARRAY_ELEMENTS)fail(`${filename}: número de linhas inválido.`);
    for(const column of columns) {
      const len=column.values.length;
      if(len!==n && !(len===1&&metadataName(column.name))) fail(`${filename}: arrays com comprimentos incompatíveis (${column.name} tem ${len}; esperado ${n}). Não alinhei, cortei nem preenchi os arrays automaticamente.`);
    }
    let normalized=columns.map(c=>({name:String(c.name||'array').trim()||'array',values:c.values}));
    const used=new Map();
    normalized=normalized.map(c=>{const key=c.name.toLowerCase();const count=(used.get(key)||0)+1;used.set(key,count);return count===1?c:{...c,name:`${c.name} [${count}]`};});
    if(options.addIndex!==false && !normalized.some(c=>looksLikeTimeName(c.name)) && n>1) normalized.unshift({name:'indice_observacao',values:Array.from({length:n},(_,i)=>i)});
    const header=normalized.map(c=>c.name);
    const rows=Array.from({length:n},(_,i)=>normalized.map(c=>String(c.values.length===1&&metadataName(c.name)?c.values[0]:(c.values[i]??''))));
    return {filename,header,rows,delimiter:',',numpy:true,numpyShapes:columns.map(c=>({name:c.name,length:c.values.length})),sourceType:options.sourceType||'NumPy'};
  }
  function readNpy(buffer, filename='array.npy') {
    const decoded=parseNpy(buffer,filename);
    return makeTable(decoded.columns,decoded.rowCount,filename,{sourceType:'NPY'});
  }
  function unzip(buffer, filename='arquivo.zip') {
    const bytes=new Uint8Array(buffer), view=new DataView(buffer);
    if(bytes.length<22)fail(`${filename}: arquivo ZIP pequeno demais ou inválido.`);
    let eocd=-1, scanStart=Math.max(0,bytes.length-65557);
    for(let p=bytes.length-22;p>=scanStart;p--){if(view.getUint32(p,true)===0x06054b50){eocd=p;break;}}
    if(eocd<0)fail(`${filename}: não encontrei o diretório final ZIP; ZIP64 ou arquivo truncado não é suportado.`);
    if(view.getUint16(eocd+4,true)!==0||view.getUint16(eocd+6,true)!==0)fail(`${filename}: ZIP multi-disco não é suportado.`);
    const entriesCount=view.getUint16(eocd+10,true), centralSize=view.getUint32(eocd+12,true), centralOffset=view.getUint32(eocd+16,true);
    if(entriesCount===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff)fail(`${filename}: ZIP64 não é suportado nesta versão.`);
    if(entriesCount>MAX_ARCHIVE_ENTRIES)fail(`${filename}: ${entriesCount} itens excede o limite de ${MAX_ARCHIVE_ENTRIES}.`);
    if(centralOffset+centralSize>bytes.length)fail(`${filename}: diretório ZIP fora dos limites do arquivo.`);
    const out=[]; let pos=centralOffset,total=0;
    for(let index=0;index<entriesCount;index++) {
      if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)fail(`${filename}: entrada ${index+1} do diretório ZIP é inválida.`);
      const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),compressed=view.getUint32(pos+20,true),uncompressed=view.getUint32(pos+24,true),nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true),localOffset=view.getUint32(pos+42,true);
      const name=utf8.decode(bytes.subarray(pos+46,pos+46+nameLen)); pos+=46+nameLen+extraLen+commentLen;
      if(name.endsWith('/'))continue;
      const safeName=cleanName(name);
      if(!safeName || safeName.startsWith('__MACOSX/'))continue;
      if(flags&1)fail(`${filename}: a entrada ${safeName} usa criptografia ZIP, que não é suportada.`);
      if(compressed===0xffffffff||uncompressed===0xffffffff||localOffset===0xffffffff)fail(`${filename}: ZIP64 não é suportado (${safeName}).`);
      if(uncompressed>MAX_ENTRY_BYTES)fail(`${filename}: a entrada ${safeName} excede o limite de ${MAX_ENTRY_BYTES} bytes.`);
      total+=uncompressed;if(total>MAX_TOTAL_BYTES)fail(`${filename}: tamanho total descompactado excede o limite de segurança.`);
      if(localOffset+30>bytes.length||view.getUint32(localOffset,true)!==0x04034b50)fail(`${filename}: cabeçalho local inválido em ${safeName}.`);
      const localNameLen=view.getUint16(localOffset+26,true),localExtraLen=view.getUint16(localOffset+28,true),dataStart=localOffset+30+localNameLen+localExtraLen;
      if(dataStart+compressed>bytes.length)fail(`${filename}: conteúdo truncado na entrada ${safeName}.`);
      const compressedData=bytes.subarray(dataStart,dataStart+compressed);let data;
      if(method===0)data=new Uint8Array(compressedData);
      else if(method===8){if(!root.pako||typeof root.pako.inflateRaw!=='function')fail('O suporte local à descompactação ZIP não carregou (pako.inflateRaw).');data=root.pako.inflateRaw(compressedData);}
      else fail(`${filename}: método de compressão ZIP ${method} não suportado na entrada ${safeName}.`);
      if(data.length!==uncompressed)fail(`${filename}: tamanho descompactado diferente do declarado em ${safeName}.`);
      out.push({name:safeName,bytes:data});
    }
    return out;
  }
  function readNpz(buffer, filename='arrays.npz') {
    const entries=unzip(buffer,filename).filter(e=>/\.npy$/i.test(e.name));
    if(!entries.length)fail(`${filename}: nenhum array .npy foi encontrado no NPZ.`);
    const columns=[];let n=null;
    for(const entry of entries){
      const table=parseNpy(sliceBuffer(entry.bytes),entry.name);
      if(table.rowCount>1){if(n===null)n=table.rowCount;else if(n!==table.rowCount)fail(`${filename}: o array ${entry.name} tem ${table.rowCount} linhas, enquanto os demais têm ${n}. O NPZ não foi alinhado automaticamente.`);}
      for(const col of table.columns)columns.push({name:col.name,values:col.values});
    }
    const rowCount=n||Math.max(1,...columns.map(c=>c.values.length));
    return makeTable(columns,rowCount,filename,{sourceType:'NPZ'});
  }
  function isZipBytes(bytes) { return bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&(bytes[2]===0x03||bytes[2]===0x05||bytes[2]===0x07); }
  return {parseNpy,readNpy,readNpz,unzip,isZipBytes,makeTable,MAX_ARRAY_ELEMENTS,MAX_ENTRY_BYTES,MAX_TOTAL_BYTES};
});
