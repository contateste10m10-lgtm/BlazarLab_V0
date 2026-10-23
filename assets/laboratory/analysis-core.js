/*
 * BlazarLab Privado 13.06 — núcleo científico testável.
 * SampEn segue H_SE = -ln(A/B), distância de Chebyshev e exclusão de auto-pares.
 * O índice de modulação usa a definição intrínseca do artigo de referência.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EntropyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '13.06-data-quality-provenance-validation';

  function finiteSeries(values) {
    return Array.from(values ?? []).filter(Number.isFinite).map(Number);
  }

  function mean(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function populationStd(values) {
    if (!values.length) return null;
    const center = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length);
  }

  function getNeighborOffsets(dimensions) {
    const offsets = [];
    const current = Array(dimensions).fill(0);
    function build(depth) {
      if (depth === dimensions) {
        offsets.push(current.slice());
        return;
      }
      for (let step = -1; step <= 1; step++) {
        current[depth] = step;
        build(depth + 1);
      }
    }
    build(0);
    return offsets;
  }

  function createPairSampler(limit, seed) {
    return limit > 0 ? { limit, pairs: [], seen: 0, seed: seed >>> 0 } : null;
  }

  // Deterministic reservoir sampling keeps a representative, bounded set of
  // real matches for visualization without storing every pair in dense series.
  function rememberPair(sampler, i, j) {
    if (!sampler) return;
    sampler.seen++;
    if (sampler.pairs.length < sampler.limit) {
      sampler.pairs.push([i, j]);
      return;
    }
    sampler.seed = (Math.imul(sampler.seed, 1664525) + 1013904223) >>> 0;
    const slot = Math.floor((sampler.seed / 4294967296) * sampler.seen);
    if (slot < sampler.limit) sampler.pairs[slot] = [i, j];
  }

  function bruteForceMatches(z, dimension, radius, sampler = null, requestedTemplateCount = null) {
    const availableTemplates = z.length - dimension + 1;
    const nTemplates = requestedTemplateCount == null ? availableTemplates : Math.max(0, Math.min(availableTemplates, requestedTemplateCount));
    let matches = 0;
    for (let i = 0; i < nTemplates; i++) {
      for (let j = i + 1; j < nTemplates; j++) {
        let match = true;
        for (let k = 0; k < dimension; k++) {
          if (Math.abs(z[i + k] - z[j + k]) > radius) {
            match = false;
            break;
          }
        }
        if (match) { matches++; rememberPair(sampler, i, j); }
      }
    }
    return matches;
  }

  // Uniform-grid search counts all pairs for a fixed embedding dimension. B
  // and A are counted separately for dimensions m and m+1, matching the
  // project's reference Python/cKDTree routine. Equivalence to EntropyHub v2.0
  // still requires a direct numerical comparison on identical series.
  function gridMatches(z, dimension, radius, sampler = null, requestedTemplateCount = null) {
    const availableTemplates = z.length - dimension + 1;
    const nTemplates = requestedTemplateCount == null ? availableTemplates : Math.max(0, Math.min(availableTemplates, requestedTemplateCount));
    const offsets = getNeighborOffsets(dimension);
    const buckets = new Map();
    let matches = 0;

    for (let i = 0; i < nTemplates; i++) {
      const cell = Array.from({ length: dimension }, (_, k) => Math.floor(z[i + k] / radius));
      for (const offset of offsets) {
        const neighborKey = cell.map((value, k) => value + offset[k]).join(',');
        const candidates = buckets.get(neighborKey);
        if (!candidates) continue;
        for (const j of candidates) {
          let match = true;
          for (let k = 0; k < dimension; k++) {
            if (Math.abs(z[i + k] - z[j + k]) > radius) {
              match = false;
              break;
            }
          }
          if (match) { matches++; rememberPair(sampler, j, i); }
        }
      }
      const key = cell.join(',');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
    return matches;
  }

  function countMatches(z, dimension, radius, sampler = null, requestedTemplateCount = null) {
    const availableTemplates = z.length - dimension + 1;
    const nTemplates = requestedTemplateCount == null ? availableTemplates : Math.max(0, Math.min(availableTemplates, requestedTemplateCount));
    if (nTemplates < 2) return 0;
    return nTemplates < 700
      ? bruteForceMatches(z, dimension, radius, sampler, nTemplates)
      : gridMatches(z, dimension, radius, sampler, nTemplates);
  }

  // Two-sided 95% Student-t critical value. Values through 30 d.f. use a
  // reference table; larger d.f. use a Cornish-Fisher expansion near the normal
  // quantile. This follows the approximate t interval described by Richman &
  // Moorman (2000), rather than presenting a Wilson interval as if it were theirs.
  const T975_DF_1_TO_30 = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
    2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
    2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042
  ];
  function studentTCritical975(df) {
    if (!Number.isFinite(df) || df < 1) return null;
    if (df <= T975_DF_1_TO_30.length) return T975_DF_1_TO_30[df - 1];
    const z = 1.959963984540054;
    const v = df, z2 = z*z, z3 = z2*z, z5 = z3*z2, z7 = z5*z2;
    return z + (z3 + z)/(4*v) + (5*z5 + 16*z3 + 3*z)/(96*v*v) + (3*z7 + 19*z5 + 17*z3 - 15*z)/(384*v*v*v);
  }

  /**
   * Approximate 95% confidence interval for SampEn, based on the t interval for
   * the binary conditional-match probability p=A/B described in Richman &
   * Moorman (2000). The Bernoulli sample SD is sqrt(B/(B-1)*p*(1-p)); its SE
   * is therefore sqrt(p*(1-p)/(B-1)). Transform the probability interval by
   * -ln(p). Overlapping templates/pairs are dependent, so this is an approximate
   * indicator of uncertainty, not a guarantee of nominal coverage for all series.
   */
  function sampleEntropyConfidenceInterval(A, B) {
    if (!Number.isFinite(A) || !Number.isFinite(B) || B < 2 || A <= 0 || A > B) {
      return { level: 0.95, method: 'Richman-Moorman t approximation for p=A/B', status: 'not_estimable', lower: null, upper: null, probability: B > 0 ? A / B : null, probabilityLower: null, probabilityUpper: null, degreesFreedom: Number.isFinite(B) ? B - 1 : null };
    }
    const probability = A / B;
    if (A === B) {
      return { level: 0.95, method: 'Richman-Moorman t approximation for p=A/B', status: 'boundary_probability', lower: 0, upper: null, probability, probabilityLower: null, probabilityUpper: 1, degreesFreedom: B - 1, note: 'A=B: o intervalo t degeneraria em largura zero e não é informativo no limite.' };
    }
    const df = B - 1;
    const tCritical = studentTCritical975(df);
    const standardError = Math.sqrt(probability * (1 - probability) / df);
    const margin = tCritical * standardError;
    const probabilityLower = Math.max(0, probability - margin);
    const probabilityUpper = Math.min(1, probability + margin);
    return {
      level: 0.95, method: 'Richman-Moorman t approximation for p=A/B', status: probabilityLower === 0 ? 'open_upper' : 'ok',
      lower: Object.is(-Math.log(probabilityUpper), -0) ? 0 : -Math.log(probabilityUpper), upper: probabilityLower > 0 ? -Math.log(probabilityLower) : null,
      probability, probabilityLower, probabilityUpper, standardError, degreesFreedom: df, tCritical,
      note: probabilityLower === 0 ? 'O limite inferior de p alcança zero; o limite superior transformado de SampEn não é finito.' : ''
    };
  }


  /**
   * Data-quality/provenance diagnostics for mapped light-curve tables.
   * Pure and non-mutating: input rows are never sorted or edited. Chronological
   * statistics use sorted copies of valid mapped time/flux pairs only.
   */
  function datasetQualityDiagnostics(rows, mapping = {}, options = {}) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const timeIndex = Number.isInteger(mapping.timeIndex) ? mapping.timeIndex : -1;
    const gapFactor = Number.isFinite(options.gapFactor) && options.gapFactor > 1 ? options.gapFactor : 3;
    const m = Number.isInteger(options.embedding) ? Math.max(1, options.embedding) : 2;
    const wpeScales = Number.isInteger(options.wpeScales) ? Math.max(1, options.wpeScales) : 8;
    const wpeDimension = Number.isInteger(options.wpeDimension) ? Math.max(2, options.wpeDimension) : 4;
    const wpeDelay = Number.isInteger(options.wpeDelay) ? Math.max(1, options.wpeDelay) : 1;
    const median = values => {
      const x = values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
      if (!x.length) return null;
      const k = Math.floor(x.length/2);
      return x.length%2 ? x[k] : (x[k-1]+x[k])/2;
    };
    const maxCadencePoints = Number.isInteger(options.maxCadencePoints) ? Math.max(1000, options.maxCadencePoints) : 100000;
    const cadenceSampled = sourceRows.length > maxCadencePoints;
    const cadenceStride = cadenceSampled ? Math.ceil(sourceRows.length / maxCadencePoints) : 1;
    // Keep full table untouched and bound cadence arrays for very large sources.
    // Exact time counts/order/duplicates are streamed; only gap/cadence estimation is sampled.
    const cadenceTimes=[], globalUniqueTimes=new Set();
    let finiteTimeCount=0, orderReversals=0, prev=null, lastFiniteTime=null, lastFiniteIndex=-1;
    for(let i=0;i<sourceRows.length;i++){
      const t=timeIndex>=0?sourceRows[i]?.[timeIndex]:null;
      if(!Number.isFinite(t))continue;
      finiteTimeCount++;globalUniqueTimes.add(t);lastFiniteTime=t;lastFiniteIndex=i;
      if(i%cadenceStride===0)cadenceTimes.push(t);
      if(Number.isFinite(prev)&&t<prev)orderReversals++;
      prev=t;
    }
    if(cadenceSampled&&lastFiniteIndex>=0&&lastFiniteIndex%cadenceStride!==0)cadenceTimes.push(lastFiniteTime);
    const globalTimeStats = timeSeriesDiagnostics(cadenceTimes, {gapFactor});
    globalTimeStats.nInput=sourceRows.length;globalTimeStats.nFinite=finiteTimeCount;
    globalTimeStats.duplicateCount=finiteTimeCount-globalUniqueTimes.size;
    globalTimeStats.nUniqueTimes=globalUniqueTimes.size;globalTimeStats.orderReversals=orderReversals;
    globalTimeStats.cadenceSampled=cadenceSampled;globalTimeStats.cadenceStride=cadenceStride;
    const seenRates = new Map();
    for (const band of (mapping.bands || [])) {
      const idx = Number.isInteger(band?.rateIndex) ? band.rateIndex : -1;
      if (idx >= 0) seenRates.set(idx, (seenRates.get(idx)||0)+1);
    }
    const duplicatedRateColumns = [...seenRates.entries()].filter(([,count])=>count>1).map(([index,count])=>({index,count}));
    const seenErrors = new Map();
    for(const band of (mapping.bands||[])){const idx=Number.isInteger(band?.errorIndex)?band.errorIndex:-1;if(idx>=0)seenErrors.set(idx,(seenErrors.get(idx)||0)+1);}
    const duplicatedErrorColumns=[...seenErrors.entries()].filter(([,count])=>count>1).map(([index,count])=>({index,count}));
    const columnRoles=new Map();
    const addRole=(index,role,band)=>{if(!Number.isInteger(index)||index<0)return;if(!columnRoles.has(index))columnRoles.set(index,[]);columnRoles.get(index).push({role,band});};
    addRole(timeIndex,'time','global');
    for(const band of (mapping.bands||[])){addRole(band?.rateIndex,'flux',band?.label||'Banda');addRole(band?.errorIndex,'uncertainty',band?.label||'Banda');}
    const overlapColumns=[];
    for(const [index,roles] of columnRoles){const distinct=new Set(roles.map(r=>r.role));if(distinct.size>1)overlapColumns.push({index,roles:roles.map(r=>`${r.role}:${r.band}`)});}
    const bands = (mapping.bands || []).map((band, bandNo) => {
      const rateIndex = Number.isInteger(band?.rateIndex) ? band.rateIndex : -1;
      const errorIndex = Number.isInteger(band?.errorIndex) ? band.errorIndex : -1;
      let invalidTime = 0, missingFlux = 0, validPairs = 0, negativeFlux = 0, errorMissingOrInvalid = 0, errorValidPairs = 0;
      const candidateTimeSet=new Set(), sampledCadenceTimes=[];
      let bandOrderReversals=0, rowPrev=null, lastCandidateTime=null, lastCandidateIndex=-1;
      let minTime=Infinity,maxTime=-Infinity,fluxMin=Infinity,fluxMax=-Infinity;
      for (let rowIndex=0;rowIndex<sourceRows.length;rowIndex++) {
        const row=sourceRows[rowIndex];
        const t = timeIndex >= 0 ? row?.[timeIndex] : null;
        const y = rateIndex >= 0 ? row?.[rateIndex] : null;
        // Count quality dimensions independently before creating the method-specific mask.
        // A row can have both a bad timestamp and a missing flux; it must be visible in both counts.
        if (!Number.isFinite(t)) invalidTime++;
        if (rateIndex < 0 || !Number.isFinite(y)) missingFlux++;
        if (!Number.isFinite(t) || rateIndex < 0 || !Number.isFinite(y)) continue;
        validPairs++;candidateTimeSet.add(t);lastCandidateTime=t;lastCandidateIndex=rowIndex;
        minTime=Math.min(minTime,t);maxTime=Math.max(maxTime,t);fluxMin=Math.min(fluxMin,y);fluxMax=Math.max(fluxMax,y);
        if(cadenceSampled?rowIndex%cadenceStride===0:true)sampledCadenceTimes.push(t);
        if(Number.isFinite(rowPrev)&&t<rowPrev)bandOrderReversals++;
        rowPrev=t;
        if (y < 0) negativeFlux++;
        const e = errorIndex >= 0 ? row?.[errorIndex] : null;
        if (errorIndex >= 0 && Number.isFinite(e) && e >= 0) errorValidPairs++;
        else errorMissingOrInvalid++;
      }
      if(cadenceSampled&&lastCandidateIndex>=0&&lastCandidateIndex%cadenceStride!==0)sampledCadenceTimes.push(lastCandidateTime);
      const uniqueTimeCount=candidateTimeSet.size;
      const sortedUnique=[...new Set(cadenceSampled?sampledCadenceTimes:candidateTimeSet)].sort((a,b)=>a-b);
      const intervals=[];
      for(let i=1;i<sortedUnique.length;i++){const d=sortedUnique[i]-sortedUnique[i-1];if(Number.isFinite(d)&&d>0)intervals.push(d);}
      const medianCadence=median(intervals);
      const mad=median(intervals.map(d=>Math.abs(d-(medianCadence ?? d))));
      const gapThreshold=Number.isFinite(medianCadence)?medianCadence*gapFactor:null;
      const gapCount=Number.isFinite(gapThreshold)?intervals.filter(d=>d>gapThreshold).length:0;
      const maxGap=intervals.length?intervals.reduce((max,d)=>Math.max(max,d),-Infinity):null;
      const duplicateTimes = validPairs - uniqueTimeCount;
      minTime=validPairs?minTime:null;maxTime=validPairs?maxTime:null;
      const coverage=validPairs>1?maxTime-minTime:null;
      const scalePoints=Math.floor(validPairs/wpeScales);
      const wpeTemplates=Math.max(0,scalePoints-(wpeDimension-1)*wpeDelay);
      const alerts=[];
      if(rateIndex<0)alerts.push('Sem coluna de fluxo mapeada');
      if(!validPairs)alerts.push('Nenhum par tempo–fluxo válido');
      if(invalidTime)alerts.push(`${invalidTime} linha(s) sem tempo finito`);
      if(missingFlux)alerts.push(`${missingFlux} linha(s) sem fluxo finito`);
      if(bandOrderReversals)alerts.push(`${bandOrderReversals} recuo(s) cronológico(s) na ordem original`);
      if(duplicateTimes)alerts.push(`${duplicateTimes} tempo(s) repetido(s) nos pares válidos`);
      if(gapCount)alerts.push(`${gapCount} lacuna(s) > ${gapFactor}× Δt mediano (heurística${cadenceSampled?', cadência amostrada':''})`);
      if(cadenceSampled)alerts.push(`Cadência estimada em amostra sistemática de linhas (1/${cadenceStride}); contagens de registros continuam exatas.`);
      if(negativeFlux)alerts.push(`${negativeFlux} fluxo(s) negativo(s): sinalizar, não descartar`);
      if(errorIndex<0)alerts.push('Sem coluna de incerteza: modulação intrínseca não elegível');
      else if(errorMissingOrInvalid)alerts.push(`${errorMissingOrInvalid} incerteza(s) ausente(s)/inválida(s)`);
      const n = validPairs;
      return {
        band: band?.label || `Banda ${bandNo+1}`, bandIndex: bandNo,
        rateIndex, errorIndex, rowCount:sourceRows.length, nTimeFluxValid:validPairs,
        missingOrInvalidTime:invalidTime, missingOrInvalidFlux:missingFlux,
        negativeFluxCount:negativeFlux, errorMapped:errorIndex>=0,
        nErrorValid:errorIndex>=0?errorValidPairs:0, missingOrInvalidError:errorIndex>=0?errorMissingOrInvalid:null,
        sampleEntropyCandidate:n>=m+2, fisherShannonCandidate:n>=8,
        modulationCandidate:errorIndex>=0&&errorValidPairs>=3,
        wpeScalePoints:scalePoints, wpeTemplateCountAtMaxScale:wpeTemplates,
        wpeMaxScaleCandidate:wpeTemplates>=2,
        orderReversals:bandOrderReversals, duplicateTimeCount:duplicateTimes,
        uniqueTimeCount, intervalCount:intervals.length,
        medianCadence, robustCadenceMAD:mad, maxGap, gapThreshold, gapCount, cadenceSampled, cadenceStride,
        timeCoverage:coverage, timeMin:minTime, timeMax:maxTime,
        fluxMin, fluxMax,
        alerts
      };
    });
    const headerNames=(mapping.header||[]).map(x=>String(x||''));
    const normalized=headerNames.map(x=>x.trim().toLowerCase().replace(/[^a-z0-9]+/g,''));
    const duplicateHeaders=[...new Set(normalized.filter((x,i)=>x&&normalized.indexOf(x)!==i))];
    const genericHeaders=headerNames.some(x=>/^coluna\s*\d+$|^column\s*\d+$/i.test(x.trim()));
    const mappingWarnings=[];
    if(timeIndex<0)mappingWarnings.push('Nenhuma coluna de tempo selecionada.');
    if(timeIndex>=0&&finiteTimeCount<sourceRows.length)mappingWarnings.push(`${sourceRows.length-finiteTimeCount} linha(s) têm tempo ausente/não finito.`);
    if(globalTimeStats.orderReversals)mappingWarnings.push(`${globalTimeStats.orderReversals} recuo(s) de tempo na ordem original; a série original não foi reordenada.`);
    if(globalTimeStats.duplicateCount)mappingWarnings.push(`${globalTimeStats.duplicateCount} tempo(s) duplicado(s) na coluna temporal.`);
    if(globalTimeStats.gapCount)mappingWarnings.push(`${globalTimeStats.gapCount} lacuna(s) > ${gapFactor}× a mediana de Δt${cadenceSampled?' (cadência estimada em amostra sistemática)':''}; é um alerta heurístico, não uma observação esperada ausente.`);
    if(cadenceSampled)mappingWarnings.push(`Arquivo grande: cadência estimada com amostra sistemática de 1 em cada ${cadenceStride} linhas; contagens brutas e de elegibilidade continuam exatas.`);
    if(duplicatedRateColumns.length)mappingWarnings.push('Uma ou mais colunas de fluxo estão mapeadas para várias bandas. Confirme se isso é intencional.');
    if(duplicatedErrorColumns.length)mappingWarnings.push('Uma ou mais colunas de incerteza estão mapeadas para várias bandas. Confirme se isso é intencional.');
    if(overlapColumns.length)mappingWarnings.push('A mesma coluna é usada com papéis diferentes (tempo, fluxo ou incerteza). Revise o mapeamento.')
    if(duplicateHeaders.length)mappingWarnings.push('O arquivo contém nomes de colunas duplicados/ambíguos.');
    if(genericHeaders)mappingWarnings.push('Alguns nomes de coluna são genéricos; confirme manualmente o significado físico.');
    return {
      schemaVersion:'1.0', rowCount:sourceRows.length, columnCount:headerNames.length,
      timeIndex, gapFactor, finiteTimeCount,
      missingOrInvalidTimeCount:sourceRows.length-finiteTimeCount,
      orderReversals:globalTimeStats.orderReversals,
      duplicateTimeCount:globalTimeStats.duplicateCount,
      globalCadence:globalTimeStats,
      bands, duplicatedRateColumns, duplicatedErrorColumns, overlapColumns, duplicateHeaders, genericHeaders,
      mappingWarnings, cadenceSampled, cadenceStride, originalRowsPreserved:true,
      transformationsApplied:[], interpolationApplied:false, duplicateRowsMerged:false,
      note:'Diagnósticos descritivos. Os dados de entrada não são alterados; métricas usam máscaras de elegibilidade específicas e podem ter requisitos adicionais.'
    };
  }

  /**
   * Descriptive diagnostics for timestamps. Does not reorder or remove the user's
   * actual series; it reports order reversals, duplicate times, median positive
   * cadence, cadence CV and heuristic gaps (> gapFactor × median cadence).
   */
  function timeSeriesDiagnostics(times, options = {}) {
    const gapFactor = Number.isFinite(options.gapFactor) && options.gapFactor > 1 ? options.gapFactor : 3;
    const input = Array.from(times ?? []);
    const finite = input.map(value => (typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN))).filter(Number.isFinite);
    let orderReversals = 0;
    for (let i = 1; i < finite.length; i++) if (finite[i] < finite[i - 1]) orderReversals++;
    const sorted = finite.slice().sort((a, b) => a - b);
    const unique = [];
    let duplicateCount = 0;
    for (const value of sorted) {
      if (unique.length && value === unique[unique.length - 1]) duplicateCount++;
      else unique.push(value);
    }
    const intervals = [];
    for (let i = 1; i < unique.length; i++) {
      const delta = unique[i] - unique[i - 1];
      if (delta > 0 && Number.isFinite(delta)) intervals.push(delta);
    }
    intervals.sort((a, b) => a - b);
    const median = intervals.length ? (intervals.length % 2 ? intervals[(intervals.length - 1) / 2] : (intervals[intervals.length / 2 - 1] + intervals[intervals.length / 2]) / 2) : null;
    const deviations = median == null ? [] : intervals.map(value => Math.abs(value - median)).sort((a,b)=>a-b);
    const cadenceMAD = deviations.length ? (deviations.length%2?deviations[(deviations.length-1)/2]:(deviations[deviations.length/2-1]+deviations[deviations.length/2])/2) : null;
    const average = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
    const sd = intervals.length ? Math.sqrt(intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length) : null;
    const gapLimit = Number.isFinite(median) ? median * gapFactor : null;
    const gaps = Number.isFinite(gapLimit) ? intervals.filter(delta => delta > gapLimit) : [];
    const maxGap = intervals.length ? intervals.reduce((max, value)=>Math.max(max,value),-Infinity) : null;
    return { nInput: input.length, nFinite: finite.length, nUniqueTimes: unique.length, duplicateCount, orderReversals, intervalCount: intervals.length, medianCadence: median, cadenceMAD, meanCadence: average, cadenceCv: average > 0 && sd != null ? sd / average : null, gapFactor, gapThreshold: gapLimit, gapCount: gaps.length, maxGap, maxGapRatio: Number.isFinite(median) && median > 0 && intervals.length ? intervals[intervals.length - 1] / median : null };
  }

  /**
   * Sample Entropy H_SE = -ln(A/B), using the Richman & Moorman (2000)
   * convention: the same N-m template start positions are used for dimensions
   * m and m+1. This makes every A match a subset of B and guarantees A <= B.
   * r = toleranceMultiplier * population SD(series); this SD convention is
   * explicitly recorded because library defaults can differ. Auto-pairs are
   * excluded, each unordered pair is counted once, and equality at r is included.
   */
  function sampleEntropy(series, m = 2, toleranceMultiplier = 0.2, options = {}) {
    const x = finiteSeries(series);
    const requestedPairLimit = Number.isInteger(options?.maxMatchPairs) ? options.maxMatchPairs : 0;
    const pairLimit = Math.max(0, Math.min(100, requestedPairLimit));
    const emptyMatchPairs = pairLimit > 0 ? { m: [], mPlus1: [], maxStoredPerDimension: pairLimit } : undefined;
    if (!Number.isInteger(m) || m < 1) throw new RangeError('A dimensão m deve ser um inteiro positivo.');
    if (!Number.isFinite(toleranceMultiplier) || toleranceMultiplier <= 0) throw new RangeError('A tolerância deve ser maior que zero.');

    const n = x.length;
    if (n < m + 2) {
      return { value: null, reason: 'Poucos pontos para formar pares', sigma: null, r: null, A: 0, B: 0, n, templateCount: Math.max(0, n - m), ci95: sampleEntropyConfidenceInterval(0, 0), ...(emptyMatchPairs ? { matchPairs: emptyMatchPairs } : {}) };
    }
    const center = mean(x);
    const sigma = populationStd(x);
    if (sigma === 0) {
      return { value: null, reason: 'Série constante (σ = 0)', sigma, r: 0, A: 0, B: 0, n, templateCount: Math.max(0, n - m), ci95: sampleEntropyConfidenceInterval(0, 0), ...(emptyMatchPairs ? { matchPairs: emptyMatchPairs } : {}) };
    }
    if (!Number.isFinite(sigma) || !Number.isFinite(center)) {
      return { value: null, reason: 'Escala numérica não finita', sigma, r: null, A: 0, B: 0, n, templateCount: Math.max(0, n - m), ci95: sampleEntropyConfidenceInterval(0, 0), ...(emptyMatchPairs ? { matchPairs: emptyMatchPairs } : {}) };
    }
    const r = toleranceMultiplier * sigma;
    const radius = toleranceMultiplier;
    const z = x.map(value => (value - center) / sigma);
    const mSampler = createPairSampler(pairLimit, 0x13579bdf);
    const mPlus1Sampler = createPairSampler(pairLimit, 0x2468ace0);

    // Richman & Moorman use the first N-m templates for both dimensions so
    // that m and m+1 comparisons have identical start positions. This differs
    // from a common alternative that counts N-m+1 templates for B.
    const templateCount = n - m;
    // Visual pair sampling is bounded and never changes scientific A/B counts.
    const B = countMatches(z, m, radius, mSampler, templateCount);
    const A = countMatches(z, m + 1, radius, mPlus1Sampler, templateCount);
    const matchPairs = pairLimit > 0
      ? { m: mSampler.pairs, mPlus1: mPlus1Sampler.pairs, maxStoredPerDimension: pairLimit }
      : undefined;
    if (B === 0) return { value: null, reason: 'B = 0 (nenhum par semelhante)', sigma, r, A, B, n, templateCount, ci95: sampleEntropyConfidenceInterval(A, B), ...(matchPairs ? { matchPairs } : {}) };
    if (A === 0) return { value: null, reason: 'A = 0 (nenhuma extensão semelhante)', sigma, r, A, B, n, templateCount, ci95: sampleEntropyConfidenceInterval(A, B), ...(matchPairs ? { matchPairs } : {}) };
    const estimate = -Math.log(A / B);
    return { value: Object.is(estimate, -0) ? 0 : estimate, reason: 'OK', sigma, r, A, B, n, templateCount, conditionalProbability: A / B, ci95: sampleEntropyConfidenceInterval(A, B), ...(matchPairs ? { matchPairs } : {}) };
  }

  /**
   * Legacy excess-variance diagnostic retained for comparison only.
   * It is not the primary intrinsic-modulation estimator in 13.04 because
   * subtracting mean(error^2) from sample variance is not the requested
   * heteroscedastic Gaussian maximum-likelihood fit. Mean flux is never
   * replaced by its absolute value; invalid error pairs remain excluded.
   */
  function intrinsicModulationExcessVariance(points, hasErrorColumn = true) {
    const all = Array.from(points ?? []).filter(p => Number.isFinite(p?.y));
    if (!hasErrorColumn) {
      return {
        value: null, reason: 'Coluna de incerteza não selecionada', status: 'missing_error_column',
        nRate: all.length, nUsed: 0, nErrorExcluded: all.length, meanFlux: mean(all.map(p => p.y)),
        observedVariance: null, noiseVariance: null, intrinsicVariance: null, rmsIntrinsic: null
      };
    }
    const valid = all.filter(p => Number.isFinite(p?.error) && p.error >= 0);
    const nErrorExcluded = all.length - valid.length;
    const flux = valid.map(p => p.y);
    const errors = valid.map(p => p.error);
    const n = flux.length;
    const avg = mean(flux);
    const base = {
      value: null, reason: '', status: 'unavailable', nRate: all.length, nUsed: n,
      nErrorExcluded, meanFlux: avg, observedVariance: null, noiseVariance: null,
      intrinsicVariance: null, rmsIntrinsic: null
    };
    if (n < 2) {
      return { ...base, reason: 'Menos de 2 pontos com fluxo e incerteza válidos', status: 'insufficient_paired_data' };
    }
    const varianceObserved = flux.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (n - 1);
    const varianceNoise = mean(errors.map(error => error ** 2));
    let varianceIntrinsic = varianceObserved - varianceNoise;
    const varianceScale = Math.max(Number.MIN_VALUE, Math.abs(varianceObserved), Math.abs(varianceNoise));
    const numericalTolerance = 1e-12 * varianceScale;
    if (varianceIntrinsic < 0 && Math.abs(varianceIntrinsic) <= numericalTolerance) varianceIntrinsic = 0;
    const calculated = { ...base, observedVariance: varianceObserved, noiseVariance: varianceNoise, intrinsicVariance: varianceIntrinsic };

    if (!Number.isFinite(avg) || avg <= 0) {
      return { ...calculated, reason: 'Fluxo médio não positivo; a fórmula do artigo não define um índice percentual válido', status: 'nonpositive_mean' };
    }
    if (![varianceObserved, varianceNoise, varianceIntrinsic].every(Number.isFinite)) {
      return { ...calculated, reason: 'Variância observada/corrigida não finita', status: 'nonfinite_variance' };
    }
    if (varianceIntrinsic < 0) {
      return { ...calculated, reason: 'Variância corrigida pelo ruído negativa', status: 'negative_intrinsic_variance' };
    }
    const rmsIntrinsic = Math.sqrt(varianceIntrinsic);
    const value = 100 * rmsIntrinsic / avg;
    if (!Number.isFinite(value)) {
      return { ...calculated, rmsIntrinsic, reason: 'O índice percentual não é finito para esta média de fluxo', status: 'nonfinite_result' };
    }
    const partial = nErrorExcluded > 0;
    return {
      ...calculated, value, rmsIntrinsic,
      reason: partial ? 'Calculado com subconjunto: algumas incertezas faltam ou são inválidas' : (varianceIntrinsic === 0 ? 'Variância intrínseca estimada igual a zero' : 'OK'),
      status: partial ? 'partial_uncertainties' : (varianceIntrinsic === 0 ? 'zero_intrinsic_variance' : 'OK')
    };
  }


  /**
   * Intrinsic modulation by a heteroscedastic Gaussian maximum-likelihood model.
   * Observations are modelled as y_i ~ Normal(S0, error_i^2 + sigma0^2), where
   * mbar = sigma0/S0. For a fixed sigma0, the MLE of S0 is the inverse-variance
   * weighted mean; the profile log-likelihood is then optimized in sigma0 >= 0.
   *
   * This is an experimental numerical implementation of the heteroscedastic Gaussian
   * likelihood approach described by Richards et al. (2011, ApJS 194, 29). Intervals
   * are profiled likelihood-ratio intervals (Delta(-2 log L)=1 for nominal 68.3%;
   * Delta(-2 log L)=2.71 for a nominal one-sided 95% boundary limit). Coverage still
   * requires simulation calibration and independent comparison before publication use.
   */
  function intrinsicModulation(points, hasErrorColumn = true, options = {}) {
    const all = Array.from(points ?? []).filter(p => Number.isFinite(p?.y));
    if (!hasErrorColumn) {
      return {
        value: null, upperLimit: null, reason: 'Coluna de incerteza não selecionada', status: 'missing_error_column',
        estimator: 'heteroscedastic Gaussian maximum likelihood', nRate: all.length, nUsed: 0,
        nErrorExcluded: all.length, meanFlux: mean(all.map(p => p.y)), observedVariance: null,
        noiseVariance: null, intrinsicVariance: null, rmsIntrinsic: null, interval68Lower: null,
        interval68Upper: null, intervalMethod: 'profile likelihood, nominal 68.3%; coverage calibration pending'
      };
    }
    const valid = all.filter(p => Number.isFinite(p?.error) && p.error >= 0);
    const nErrorExcluded = all.length - valid.length;
    const flux = valid.map(p => Number(p.y));
    const errors = valid.map(p => Number(p.error));
    const n = flux.length, average = mean(flux), sd = populationStd(flux);
    const observedVariance = n > 1 ? flux.reduce((sum,v)=>sum+(v-average)**2,0)/(n-1) : null;
    const noiseVariance = n ? mean(errors.map(e=>e*e)) : null;
    const base = {
      value:null, upperLimit:null, reason:'', status:'unavailable', estimator:'heteroscedastic Gaussian maximum likelihood',
      nRate:all.length,nUsed:n,nErrorExcluded,meanFlux:average,observedVariance,noiseVariance,
      intrinsicVariance:null,rmsIntrinsic:null,sigmaIntrinsic:null,logLikelihood:null,
      interval68Lower:null,interval68Upper:null,intervalMethod:'profile likelihood, nominal 68.3%; coverage calibration pending'
    };
    if (n < 3) return {...base,reason:'A estimativa de referência requer pelo menos três pares fluxo–incerteza válidos.',status:'insufficient_paired_data'};
    if (!Number.isFinite(average) || average <= 0) return {...base,reason:'Fluxo médio não positivo; m̄ = σ₀/S₀ não é definido como índice percentual positivo.',status:'nonpositive_mean'};
    const scale = Math.max(Math.abs(average), sd || 0, ...errors, Number.MIN_VALUE);
    if (errors.every(e=>e===0) && (sd || 0) <= scale*1e-14) {
      return {...base,reason:'Série constante com incertezas exatamente nulas: a verossimilhança fica degenerada na fronteira.',status:'degenerate_zero_error_constant'};
    }
    const profile = sigma0 => {
      if (!Number.isFinite(sigma0) || sigma0 < 0) return {logLikelihood:-Infinity,mean:null};
      let wsum=0, wysum=0;
      for(let i=0;i<n;i++){
        const variance=errors[i]*errors[i]+sigma0*sigma0;
        if (!(variance>0) || !Number.isFinite(variance)) return {logLikelihood:-Infinity,mean:null};
        const w=1/variance;
        wsum+=w; wysum+=w*flux[i];
      }
      const mu=wysum/wsum;
      if (!(mu>0) || !Number.isFinite(mu)) return {logLikelihood:-Infinity,mean:mu};
      let ll=0;
      for(let i=0;i<n;i++){
        const variance=errors[i]*errors[i]+sigma0*sigma0;
        const residual=flux[i]-mu;
        ll-=0.5*(Math.log(2*Math.PI*variance)+(residual*residual)/variance);
      }
      return {logLikelihood:Number.isFinite(ll)?ll:-Infinity,mean:mu};
    };
    const qMax = Math.max(6*(sd||0),6*Math.max(...errors),scale*1e-5,1e-14);
    const gridN = Number.isInteger(options.gridN)?Math.max(32,Math.min(160,options.gridN)):64;
    const grid=Array.from({length:gridN+1},(_,i)=>qMax*i/gridN);
    const scores=grid.map(q=>profile(q).logLikelihood);
    let bestIndex=0;
    for(let i=1;i<scores.length;i++) if(scores[i]>scores[bestIndex]) bestIndex=i;
    let sigmaHat=grid[bestIndex], llHat=scores[bestIndex];
    // Refine around the best grid cell with golden-section search.
    let left=grid[Math.max(0,bestIndex-1)], right=grid[Math.min(gridN,bestIndex+1)];
    if(right>left){
      const phi=(Math.sqrt(5)-1)/2; let c=right-phi*(right-left), d=left+phi*(right-left);
      let fc=profile(c).logLikelihood, fd=profile(d).logLikelihood;
      const iterations=Number.isInteger(options.optimizerIterations)?Math.max(20,Math.min(70,options.optimizerIterations)):42;
      for(let j=0;j<iterations;j++){
        if(fc>fd){right=d;d=c;fd=fc;c=right-phi*(right-left);fc=profile(c).logLikelihood;}
        else{left=c;c=d;fc=fd;d=left+phi*(right-left);fd=profile(d).logLikelihood;}
      }
      const refined=(left+right)/2, refinedScore=profile(refined).logLikelihood;
      if(refinedScore>llHat){sigmaHat=refined;llHat=refinedScore;}
    }
    // Compare the boundary explicitly: a zero estimate is not reported as a detection.
    const boundaryScore=profile(0).logLikelihood;
    if(boundaryScore>=llHat){sigmaHat=0;llHat=boundaryScore;}
    if(!Number.isFinite(llHat)) return {...base,reason:'A verossimilhança não tem um máximo finito com os dados fornecidos.',status:'nonfinite_likelihood'};
    const atBoundary = sigmaHat <= scale*1e-8;
    if(atBoundary){
      const limitDelta2LogL=2.71; // Nominal one-sided 95% profile-likelihood limit; empirical coverage still needs calibration.
      const target=llHat-limitDelta2LogL/2;
      let lo=0, hi=Math.max(qMax,scale*1e-6), hiScore=profile(hi).logLikelihood, expansion=0;
      while(hiScore>target && expansion<12){hi*=2;hiScore=profile(hi).logLikelihood;expansion++;}
      if(!(hiScore<=target)) return {...base,reason:'Máximo na fronteira; o limite superior aproximado não fechou na faixa numérica explorada.',status:'upper_limit_unbounded',sigmaIntrinsic:0,intrinsicVariance:0,rmsIntrinsic:0,logLikelihood:llHat};
      for(let i=0;i<42;i++){const mid=(lo+hi)/2;if(profile(mid).logLikelihood>target)lo=mid;else hi=mid;}
      const qLimit=(lo+hi)/2, muLimit=profile(qLimit).mean, upperLimit=muLimit>0?100*qLimit/muLimit:null;
      return {...base,value:null,upperLimit:Number.isFinite(upperLimit)?upperLimit:null,reason:'Máximo de verossimilhança na fronteira σ₀=0. Limite superior nominal unilateral de 95% por perfil de verossimilhança; a cobertura ainda requer calibração.',status:'upper_limit_candidate',sigmaIntrinsic:0,intrinsicVariance:0,rmsIntrinsic:0,logLikelihood:llHat,profileLimitDelta2LogL:limitDelta2LogL,profileLimitConfidenceLevel:0.95,intervalMethod:'profile likelihood; nominal one-sided 95% limit, coverage calibration pending',meanFlux:profile(0).mean};
    }
    const atHat=profile(sigmaHat);
    const intervalDelta2LogL=1.0; // One-parameter, nominal 68.3% likelihood-ratio interval.
    const target68=llHat-intervalDelta2LogL/2;
    const boundaryProfile=profile(0).logLikelihood;
    let lowSigma=0;
    if(Number.isFinite(boundaryProfile)&&boundaryProfile<target68){
      let lo=0,hi=sigmaHat;
      for(let i=0;i<64;i++){
        const mid=(lo+hi)/2;
        if(profile(mid).logLikelihood>target68)hi=mid;else lo=mid;
      }
      lowSigma=(lo+hi)/2;
    }
    let intervalHi=Math.max(qMax,sigmaHat*1.5,scale*1e-6);
    let hiScore=profile(intervalHi).logLikelihood,expansions=0;
    while(hiScore>target68&&expansions<16){intervalHi*=2;hiScore=profile(intervalHi).logLikelihood;expansions++;}
    let highSigma=null;
    if(Number.isFinite(hiScore)&&hiScore<=target68){
      let lo=sigmaHat,hi=intervalHi;
      for(let i=0;i<64;i++){
        const mid=(lo+hi)/2;
        if(profile(mid).logLikelihood>target68)lo=mid;else hi=mid;
      }
      highSigma=(lo+hi)/2;
    }
    const lowMean=profile(lowSigma).mean;
    const highMean=Number.isFinite(highSigma)?profile(highSigma).mean:null;
    const interval68Lower=Number.isFinite(lowSigma)&&lowMean>0?100*lowSigma/lowMean:null;
    const interval68Upper=Number.isFinite(highSigma)&&highMean>0?100*highSigma/highMean:null;
    const value=100*sigmaHat/atHat.mean;
    if(!Number.isFinite(value)) return {...base,reason:'O índice m̄ não é finito para o máximo de verossimilhança encontrado.',status:'nonfinite_result'};
    const partial=nErrorExcluded>0;
    const intervalComplete=Number.isFinite(interval68Lower)&&Number.isFinite(interval68Upper);
    return {...base,value,upperLimit:null,reason:partial?'Máxima verossimilhança calculada com subconjunto: algumas incertezas faltam ou são inválidas.':(intervalComplete?'MLE gaussiano heteroscedástico; intervalo nominal de 68,3% por perfil de verossimilhança.':'MLE interior calculado, mas o intervalo por perfil não fechou.'),status:partial?'partial_uncertainties':'OK',meanFlux:atHat.mean,sigmaIntrinsic:sigmaHat,intrinsicVariance:sigmaHat*sigmaHat,rmsIntrinsic:sigmaHat,logLikelihood:llHat,interval68Lower,interval68Upper,intervalDelta2LogL:intervalDelta2LogL,intervalConfidenceLevel:0.682689492,intervalMethod:'profile likelihood ratio: Delta(-2 ln L)=1; nominal 68.3%, coverage calibration pending',intervalProfileComplete:intervalComplete,standardError68:Number.isFinite(interval68Upper)&&Number.isFinite(interval68Lower)?(interval68Upper-interval68Lower)/2:null};
  }


  // Exploratory Fisher-Shannon estimator: Gaussian KDE with numerically normalized grid.
  // H is in nats, N_X in squared flux units, I_F in inverse squared flux units.
  // This implementation must be independently validated before publication-grade use.
  function fisherShannonKDE(values, options = {}) {
    const original = finiteSeries(values);
    const minN = Number.isInteger(options.minN) ? Math.max(5, options.minN) : 8;
    if (original.length < minN) return { H: null, N_X: null, fisher: null, complexityProduct: null, bandwidth: null, n: original.length, status: 'insufficient', reason: `A KDE Fisher–Shannon requer pelo menos ${minN} observações válidas.` };
    const sorted = [...original].sort((a,b)=>a-b);
    const mu = mean(original);
    const sd = populationStd(original);
    const scale = Math.max(Math.abs(mu), Math.abs(sorted[sorted.length-1]), Math.abs(sorted[0]), Number.MIN_VALUE);
    if (!Number.isFinite(sd) || sd <= scale * 1e-14) return { H: null, N_X: null, fisher: null, complexityProduct: null, bandwidth: null, n: original.length, status: 'degenerate', reason: 'Série constante ou quase constante; a densidade não é estimável de modo estável.' };
    const quantile = q => {
      const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    const iqr = quantile(.75) - quantile(.25);
    const robustScale = iqr > 0 ? Math.min(sd, iqr / 1.349) : sd;
    const baseBandwidth = .9 * robustScale * Math.pow(original.length, -.2);
    const bandwidthFactor = Number.isFinite(options.bandwidthFactor) && options.bandwidthFactor > 0 ? Math.max(0.35, Math.min(3, options.bandwidthFactor)) : 1;
    const bandwidth = baseBandwidth * bandwidthFactor;
    if (!Number.isFinite(bandwidth) || bandwidth <= 0) return { H: null, N_X: null, fisher: null, complexityProduct: null, bandwidth: null, n: original.length, status: 'invalid-bandwidth', reason: 'Não foi possível estimar uma largura KDE positiva.' };
    const gridCount = Number.isInteger(options.gridCount) ? Math.max(101, Math.min(801, options.gridCount)) : 241;
    const minX = sorted[0] - 4 * bandwidth, maxX = sorted[sorted.length-1] + 4 * bandwidth;
    const step = (maxX - minX) / (gridCount - 1);
    if (!Number.isFinite(step) || step <= 0) return { H: null, N_X: null, fisher: null, complexityProduct: null, bandwidth, n: original.length, status: 'invalid-grid', reason: 'A grade numérica da KDE não pôde ser construída.' };
    const density = new Array(gridCount).fill(0), derivative = new Array(gridCount).fill(0);
    const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI), invN = 1 / original.length;
    for (let i=0; i<gridCount; i++) {
      const x = minX + i * step; let f=0, df=0;
      for (const sample of original) {
        const z=(x-sample)/bandwidth, kernel=invSqrt2Pi*Math.exp(-.5*z*z);
        f += kernel / bandwidth;
        df += -z * kernel / (bandwidth * bandwidth);
      }
      density[i]=f*invN; derivative[i]=df*invN;
    }
    let area=0;
    for(let i=0;i<gridCount-1;i++) area+=(density[i]+density[i+1])*step/2;
    if (!Number.isFinite(area) || area<=0) return { H:null,N_X:null,fisher:null,complexityProduct:null,bandwidth,baseBandwidth,bandwidthFactor,n:original.length,status:'invalid-density',reason:'A densidade estimada não pôde ser normalizada.' };
    for(let i=0;i<gridCount;i++){density[i]/=area;derivative[i]/=area;}
    let H=0, fisher=0;
    const peak=Math.max(...density), floor=Math.max(Number.MIN_VALUE,peak*1e-12);
    for(let i=0;i<gridCount-1;i++){
      const f0=Math.max(density[i],floor),f1=Math.max(density[i+1],floor),d0=derivative[i],d1=derivative[i+1];
      H+=(-f0*Math.log(f0)-f1*Math.log(f1))*step/2;
      fisher+=((d0*d0/f0)+(d1*d1/f1))*step/2;
    }
    const NX=Math.exp(2*H)/(2*Math.PI*Math.E);
    const product=NX*fisher;
    if (![H,NX,fisher,product].every(Number.isFinite) || NX<=0 || fisher<0 || product<0) return {H:null,N_X:null,fisher:null,complexityProduct:null,bandwidth,baseBandwidth,bandwidthFactor,n:original.length,gridCount,normalizationAreaBefore:area,normalizationAreaAfter:null,status:'nonfinite',reason:'A integral ou uma grandeza Fisher–Shannon ficou não finita.'};
    let normalizedArea=0;for(let i=0;i<gridCount-1;i++)normalizedArea+=(density[i]+density[i+1])*step/2;
    return {H,N_X:NX,fisher,complexityProduct:product,bandwidth,baseBandwidth,bandwidthFactor,n:original.length,gridCount,gridStep:step,normalizationAreaBefore:area,normalizationAreaAfter:normalizedArea,bandwidthRule:'robust Silverman-like rule: 0.9 × min(σ, IQR/1.349) × N^(−1/5)',status:'experimental',reason:'Estimativa KDE exploratória; examine sensibilidade ao bandwidth/grid e compare com referência independente antes de uso publicado.'};
  }

  function fisherShannonGaussianReference(sigma) {
    if(!Number.isFinite(sigma)||sigma<=0)return {H:null,N_X:null,fisher:null,complexityProduct:null,status:'invalid-scale',reason:'σ precisa ser finito e positivo.'};
    const variance=sigma*sigma;
    const H=0.5*Math.log(2*Math.PI*Math.E*variance);
    const N_X=variance,fisher=1/variance,complexityProduct=N_X*fisher;
    return {H,N_X,fisher,complexityProduct,status:'analytic-reference',model:'Gaussian distribution',sigma};
  }

  // Sensitivity report: no universal pass/fail threshold is imposed. The caller
  // must pre-register acceptable differences for the sample size and application.
  function fisherShannonKDEStability(values, options = {}) {
    const bandwidthFactors=Array.isArray(options.bandwidthFactors)?options.bandwidthFactors.filter(v=>Number.isFinite(v)&&v>0):[0.8,1,1.25];
    const uniqueFactors=[...new Set(bandwidthFactors.map(v=>Math.max(0.35,Math.min(3,v))))].sort((a,b)=>a-b);
    const bandwidthSweep=uniqueFactors.map(factor=>({factor,...fisherShannonKDE(values,{...options,bandwidthFactor:factor})}));
    const gridCounts=Array.isArray(options.gridCounts)?options.gridCounts.filter(Number.isInteger):[161,241,401];
    const uniqueGrids=[...new Set(gridCounts.map(v=>Math.max(101,Math.min(801,v))))].sort((a,b)=>a-b);
    const gridSweep=uniqueGrids.map(gridCount=>({gridCount,...fisherShannonKDE(values,{...options,bandwidthFactor:options.bandwidthFactor||1,gridCount})}));
    const relativeRange=key=>{
      const vals=bandwidthSweep.map(x=>x[key]).filter(Number.isFinite);
      if(vals.length<2)return null;
      const center=vals.reduce((a,b)=>a+b,0)/vals.length;
      return Math.abs(center)>Number.EPSILON?(Math.max(...vals)-Math.min(...vals))/Math.abs(center):null;
    };
    const gridRelativeRange=key=>{
      const vals=gridSweep.map(x=>x[key]).filter(Number.isFinite);
      if(vals.length<2)return null;
      const center=vals.reduce((a,b)=>a+b,0)/vals.length;
      return Math.abs(center)>Number.EPSILON?(Math.max(...vals)-Math.min(...vals))/Math.abs(center):null;
    };
    return {status:bandwidthSweep.every(x=>x.status==='experimental')&&gridSweep.every(x=>x.status==='experimental')?'diagnostic':'partial',method:'sensitivity sweep; threshold not globally fixed',bandwidthSweep,gridSweep,relativeRange:{H:relativeRange('H'),N_X:relativeRange('N_X'),fisher:relativeRange('fisher'),complexityProduct:relativeRange('complexityProduct')},gridRelativeRange:{H:gridRelativeRange('H'),N_X:gridRelativeRange('N_X'),fisher:gridRelativeRange('fisher'),complexityProduct:gridRelativeRange('complexityProduct')},note:'Defina a tolerância antes de avaliar o caso; nenhum limiar universal de estabilidade é aplicado automaticamente.'};
  }

  function validateWpeSeries(values) {
    let x;
    try { x = Array.from(values ?? []); }
    catch (_) { return { ok: false, values: [], status: 'invalid-data', reason: 'A série precisa ser uma sequência numérica finita.' }; }
    if (!x.length) return { ok: false, values: x, status: 'insufficient', reason: 'A série está vazia.' };
    const invalidIndex = x.findIndex(value => typeof value !== 'number' || !Number.isFinite(value));
    if (invalidIndex >= 0) return { ok: false, values: x, status: 'invalid-data', reason: `Valor não finito ou não numérico no índice ${invalidIndex}; a ordem temporal não foi alterada nem valores foram removidos.` };
    return { ok: true, values: x, status: 'ok', reason: '' };
  }

  function ordinalPattern(values) {
    // Deterministic tie convention: exact ties retain the temporal order within the vector.
    return values.map((value, index) => ({ value, index }))
      .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : a.index - b.index))
      .map(item => item.index).join(',');
  }

  // WPE contract: variance weight for each delay vector, accumulated by its ordinal motif.
  // All weights are divided by a common squared amplitude scale before summing. This common
  // factor cancels in p_w and prevents avoidable overflow/underflow without changing WPE.
  function weightedPermutationEntropy(values, dimension = 4, delay = 1) {
    const checked = validateWpeSeries(values);
    const x = checked.values;
    const empty = { value: null, normalized: null, count: 0, templateCount: 0, distinctPatterns: 0, positiveWeightPatterns: 0, positiveWeightTemplates: 0, tieTemplates: 0, totalWeight: null, maxEntropy: null, status: checked.status, reason: checked.reason, weightDefinition: 'population variance per ordinal delay vector; common global amplitude scaling', tiePolicy: 'stable temporal order for exact ties', normalization: 'H_W / ln(d!)', weightingConvention: 'variance-weighted motifs (Fadlallah et al. 2013); project implementation remains experimental pending an external reference comparison' };
    if (!checked.ok) return empty;
    if (!Number.isInteger(dimension) || dimension < 2 || dimension > 7) return { ...empty, status: 'invalid-dimension', reason: 'A dimensão ordinal deve ser um inteiro entre 2 e 7.' };
    if (!Number.isInteger(delay) || delay < 1 || delay > 10) return { ...empty, status: 'invalid-delay', reason: 'O atraso deve ser um inteiro entre 1 e 10.' };
    const count = x.length - (dimension - 1) * delay;
    if (count < 2) return { ...empty, count: Math.max(0, count), templateCount: Math.max(0, count), status: 'insufficient', reason: `São necessários pelo menos 2 vetores ordinais completos; encontrados ${Math.max(0, count)}.` };

    let amplitudeScale = 0;
    for (const value of x) amplitudeScale = Math.max(amplitudeScale, Math.abs(value));
    if (!(amplitudeScale > 0) || !Number.isFinite(amplitudeScale)) return { ...empty, count, templateCount: count, status: 'zero-weight', reason: 'A série é constante em zero; a soma dos pesos é zero e a WPE não é estimável.' };

    const scaled = x.map(value => value / amplitudeScale);
    const patternWeights = new Map();
    let totalWeight = 0;
    let positiveWeightTemplates = 0;
    let tieTemplates = 0;
    for (let i = 0; i < count; i += 1) {
      const originalVector = new Array(dimension);
      const scaledVector = new Array(dimension);
      for (let k = 0; k < dimension; k += 1) {
        originalVector[k] = x[i + k * delay];
        scaledVector[k] = scaled[i + k * delay];
      }
      if (new Set(originalVector).size < dimension) tieTemplates += 1;
      const center = scaledVector.reduce((sum, value) => sum + value, 0) / dimension;
      let squared = 0;
      for (const value of scaledVector) squared += (value - center) ** 2;
      const weight = squared / dimension;
      const key = ordinalPattern(originalVector);
      patternWeights.set(key, (patternWeights.get(key) || 0) + weight);
      totalWeight += weight;
      if (weight > 0) positiveWeightTemplates += 1;
    }
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) return { ...empty, count, templateCount: count, distinctPatterns: patternWeights.size, tieTemplates, totalWeight: 0, status: 'zero-weight', reason: 'Soma dos pesos igual a zero; a WPE não é estimável nesta escala. Não foi substituída por zero.' };

    let entropy = 0;
    let positiveWeightPatterns = 0;
    for (const weight of patternWeights.values()) {
      const probability = weight / totalWeight;
      if (probability > 0) { entropy -= probability * Math.log(probability); positiveWeightPatterns += 1; }
    }
    const maxEntropy = Math.log(factorial(dimension));
    if (!Number.isFinite(entropy) || entropy < -1e-12 || entropy > maxEntropy + 1e-10) return { ...empty, count, templateCount: count, distinctPatterns: patternWeights.size, positiveWeightPatterns, positiveWeightTemplates, tieTemplates, totalWeight, maxEntropy, status: 'invalid-entropy', reason: 'A entropia ponderada ficou fora dos limites numéricos esperados.' };
    entropy = Math.max(0, Math.min(maxEntropy, entropy));
    const sparse = count < factorial(dimension);
    const note = [
      sparse ? `Amostra esparsa: ${count} vetores para ${factorial(dimension)} motivos teóricos possíveis.` : '',
      tieTemplates ? `${tieTemplates} vetores com empates exatos; desempate determinístico pela ordem temporal.` : '',
      'Estimativa experimental: convenções numéricas passaram nos testes internos, mas ainda requerem comparação externa.'
    ].filter(Boolean).join(' ');
    return { value: entropy, normalized: entropy / maxEntropy, count, templateCount: count, distinctPatterns: patternWeights.size, positiveWeightPatterns, positiveWeightTemplates, tieTemplates, totalWeight, amplitudeScale, maxEntropy, status: sparse ? 'experimental-sparse' : 'experimental', reason: note, weightDefinition: 'variância populacional do vetor ordinal, dividida por amplitude global comum para estabilidade', tiePolicy: 'empates exatos resolvidos pela ordem temporal original', normalization: 'H_W / ln(d!)', possiblePatterns: factorial(dimension), scaleType: 'observation-count', externalReferenceStatus: 'pending' };
  }

  function factorial(n) { let result = 1; for (let i = 2; i <= n; i += 1) result *= i; return result; }

  function coarseGrainDetailed(values, scale) {
    const checked = validateWpeSeries(values);
    if (!checked.ok) return { values: [], inputLength: checked.values.length, outputLength: 0, discarded: 0, scale, tailPolicy: 'discard-incomplete-final-block', status: checked.status, reason: checked.reason };
    if (!Number.isInteger(scale) || scale < 1 || scale > 20) return { values: [], inputLength: checked.values.length, outputLength: 0, discarded: 0, scale, tailPolicy: 'discard-incomplete-final-block', status: 'invalid-scale', reason: 'A escala deve ser um inteiro entre 1 e 20.' };
    const x = checked.values;
    const count = Math.floor(x.length / scale);
    const discarded = x.length - count * scale;
    if (!count) return { values: [], inputLength: x.length, outputLength: 0, discarded, scale, tailPolicy: 'discard-incomplete-final-block', status: 'insufficient', reason: `A série tem ${x.length} pontos e não forma um bloco completo na escala ${scale}.` };
    const result = new Array(count);
    for (let j = 0; j < count; j += 1) {
      const start = j * scale;
      let amplitudeScale = 0;
      for (let k = 0; k < scale; k += 1) amplitudeScale = Math.max(amplitudeScale, Math.abs(x[start + k]));
      if (amplitudeScale === 0) { result[j] = 0; continue; }
      let sumScaled = 0;
      for (let k = 0; k < scale; k += 1) sumScaled += x[start + k] / amplitudeScale;
      result[j] = amplitudeScale * (sumScaled / scale);
      if (!Number.isFinite(result[j])) return { values: [], inputLength: x.length, outputLength: 0, discarded, scale, tailPolicy: 'discard-incomplete-final-block', status: 'nonfinite-output', reason: 'A média de bloco não pôde ser representada numericamente.' };
    }
    return { values: result, inputLength: x.length, outputLength: result.length, discarded, scale, tailPolicy: 'discard-incomplete-final-block', status: 'ok', reason: '', scaleType: 'observation-count', physicalTimeScale: null };
  }

  // Kept as an array-returning compatibility API. Use coarseGrainDetailed when metadata matters.
  function coarseGrain(values, scale) { return coarseGrainDetailed(values, scale).values; }

  function calculateMSEPoint(checked, scale, dimension, delay) {
    const coarseInfo = checked.ok
      ? coarseGrainDetailed(checked.values, scale)
      : { values: [], inputLength: checked.values.length, outputLength: 0, discarded: 0, scale, tailPolicy: 'discard-incomplete-final-block', status: checked.status, reason: checked.reason };
    const wpe = coarseInfo.status === 'ok'
      ? weightedPermutationEntropy(coarseInfo.values, dimension, delay)
      : { value: null, normalized: null, count: 0, templateCount: 0, distinctPatterns: 0, status: coarseInfo.status, reason: coarseInfo.reason };
    const value = Number.isFinite(wpe.value) ? wpe.value : null;
    const normalized = Number.isFinite(wpe.normalized) ? wpe.normalized : null;
    return {
      scale, n: coarseInfo.outputLength, inputLength: coarseInfo.inputLength,
      discarded: coarseInfo.discarded, tailPolicy: coarseInfo.tailPolicy,
      templateCount: wpe.templateCount ?? wpe.count ?? 0, count: wpe.count ?? 0,
      value, normalized, patterns: wpe.distinctPatterns || 0,
      positiveWeightPatterns: wpe.positiveWeightPatterns || 0,
      positiveWeightTemplates: wpe.positiveWeightTemplates || 0,
      tieTemplates: wpe.tieTemplates || 0, amplitudeScale: wpe.amplitudeScale ?? null,
      status: value !== null ? wpe.status : (wpe.status || coarseInfo.status || 'undefined'),
      reason: wpe.reason || coarseInfo.reason || '', sparse: wpe.status === 'experimental-sparse'
    };
  }

  function summarizeMSE(points, requestedScales, dimension, delay, options = {}) {
    const validScales = points.filter(point => Number.isFinite(point.value)).length;
    const complete = points.length === requestedScales && validScales === requestedScales;
    // Preserves the legacy application's raw-WPE sum only as a provisional convention.
    // V0.22 focuses on SampEn and does not define WPE/CI.
    const CI = complete ? points.reduce((sum, point) => sum + point.value, 0) : null;
    const maxPerScale = Number.isInteger(dimension) && dimension >= 2 && dimension <= 7 ? Math.log(factorial(dimension)) : null;
    const cancelled = Boolean(options.cancelled);
    return {
      points, CI, validScales, requestedScales, dimension, delay,
      maxPerScale, maxCI: Number.isFinite(maxPerScale) ? requestedScales * maxPerScale : null,
      status: cancelled ? 'cancelled-partial' : complete ? (points.some(point => point.sparse) ? 'experimental-sparse' : 'experimental') : 'incomplete',
      ciStatus: cancelled ? 'cancelled-partial' : complete ? 'experimental-definition-unconfirmed' : 'incomplete',
      ciDefinition: 'Soma discreta da WPE bruta (nats) em todas as escalas solicitadas; convenção legada provisória, ainda não homologada como definição científica de CI.',
      ciReferenceStatus: 'not-found-in-v0.22-reference-archive',
      scaleType: 'observation-count', physicalTimeScale: null,
      tailPolicy: 'discard-incomplete-final-block',
      weightDefinition: 'variância populacional por vetor ordinal, com escala global comum para estabilidade numérica',
      tiePolicy: 'empates exatos resolvidos pela ordem temporal original',
      normalization: 'WPE normalizada = H_W / ln(d!); CI provisório usa WPE bruta em nats',
      cancelled,
      reason: cancelled
        ? 'Cálculo cancelado pelo usuário; escalas parciais não são promovidas a CI.'
        : complete
          ? 'WPE estimada nas escalas com dados suficientes. CI continua experimental: sua soma discreta não foi confirmada como definição homologada.'
          : 'CI indisponível: pelo menos uma escala é não estimável; escalas ausentes não são substituídas por zero.'
    };
  }

  function normalizeMSEOptions(options = {}) {
    return {
      scales: Number.isInteger(options.scales) ? Math.max(1, Math.min(20, options.scales)) : 8,
      dimension: Number.isInteger(options.dimension) ? options.dimension : 4,
      delay: Number.isInteger(options.delay) ? options.delay : 1
    };
  }

  function calculateMSE(values, options = {}) {
    const { scales, dimension, delay } = normalizeMSEOptions(options);
    const checked = validateWpeSeries(values);
    const points = [];
    for (let scale = 1; scale <= scales; scale += 1) points.push(calculateMSEPoint(checked, scale, dimension, delay));
    return summarizeMSE(points, scales, dimension, delay);
  }

  // Async scale-by-scale implementation: yields between scales for UI progress and cooperative cancellation.
  async function calculateMSEAsync(values, options = {}, controls = {}) {
    const { scales, dimension, delay } = normalizeMSEOptions(options);
    const checked = validateWpeSeries(values);
    const points = [];
    for (let scale = 1; scale <= scales; scale += 1) {
      if (controls.signal?.aborted || (typeof controls.shouldCancel === 'function' && controls.shouldCancel())) {
        return summarizeMSE(points, scales, dimension, delay, { cancelled: true });
      }
      const point = calculateMSEPoint(checked, scale, dimension, delay);
      points.push(point);
      if (typeof controls.onProgress === 'function') controls.onProgress({ scale, total: scales, point });
      // A macrotask yield lets UI cancellation/progress events run between scales.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (controls.signal?.aborted || (typeof controls.shouldCancel === 'function' && controls.shouldCancel())) {
      return summarizeMSE(points, scales, dimension, delay, { cancelled: true });
    }
    return summarizeMSE(points, scales, dimension, delay);
  }


  return { VERSION, mean, populationStd, sampleEntropy, sampleEntropyConfidenceInterval, datasetQualityDiagnostics, timeSeriesDiagnostics, intrinsicModulation, intrinsicModulationExcessVariance, fisherShannonKDE, fisherShannonGaussianReference, fisherShannonKDEStability, weightedPermutationEntropy, ordinalPattern, coarseGrain, coarseGrainDetailed, calculateMSE, calculateMSEAsync };
});
