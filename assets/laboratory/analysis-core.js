/*
 * Multiband Entropy Lab — núcleo científico testável.
 * SampEn segue H_SE = -ln(A/B), distância de Chebyshev e exclusão de auto-pares.
 * O índice de modulação usa a definição intrínseca do artigo de referência.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EntropyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '13.01-experimental';

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
    const average = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
    const sd = intervals.length ? Math.sqrt(intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length) : null;
    const gapLimit = Number.isFinite(median) ? median * gapFactor : null;
    const gaps = Number.isFinite(gapLimit) ? intervals.filter(delta => delta > gapLimit) : [];
    return { nInput: input.length, nFinite: finite.length, nUniqueTimes: unique.length, duplicateCount, orderReversals, intervalCount: intervals.length, medianCadence: median, meanCadence: average, cadenceCv: average > 0 && sd != null ? sd / average : null, gapFactor, gapThreshold: gapLimit, gapCount: gaps.length, maxGap: intervals.length ? intervals[intervals.length - 1] : null, maxGapRatio: Number.isFinite(median) && median > 0 && intervals.length ? intervals[intervals.length - 1] / median : null };
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
   * Intrinsic modulation index, in percent:
   * m = 100 * sqrt(S^2 - mean(error^2)) / mean(flux).
   * S^2 uses sample variance (N-1), matching the user's reference script;
   * the source article gives the formula but does not specify this divisor.
   * Only observations with finite flux and finite non-negative uncertainties
   * enter this estimate. Mean flux is not replaced by its absolute value.
   */
  function intrinsicModulation(points, hasErrorColumn = true) {
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
    const bandwidth = .9 * robustScale * Math.pow(original.length, -.2);
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
    if (!Number.isFinite(area) || area<=0) return { H:null,N_X:null,fisher:null,complexityProduct:null,bandwidth,n:original.length,status:'invalid-density',reason:'A densidade estimada não pôde ser normalizada.' };
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
    if (![H,NX,fisher,product].every(Number.isFinite) || NX<=0 || fisher<0 || product<0) return {H:null,N_X:null,fisher:null,complexityProduct:null,bandwidth,n:original.length,status:'nonfinite',reason:'A integral ou uma grandeza Fisher–Shannon ficou não finita.'};
    return {H,N_X:NX,fisher,complexityProduct:product,bandwidth,n:original.length,gridCount,status:'experimental',reason:'Estimativa por KDE exploratória; comparar com referência independente antes de uso publicado.'};
  }

  function ordinalPattern(values) {
    return values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value || a.index-b.index).map(item=>item.index).join(',');
  }

  // Weighted Permutation Entropy using population variance weights, as in the exploratory V7 chart family.
  function weightedPermutationEntropy(values, dimension = 4, delay = 1) {
    const x = finiteSeries(values);
    if (!Number.isInteger(dimension) || dimension < 2 || dimension > 7) return {value:null,normalized:null,count:0,distinctPatterns:0,status:'invalid-dimension',reason:'A dimensão ordinal deve ser um inteiro entre 2 e 7.'};
    if (!Number.isInteger(delay) || delay < 1 || delay > 10) return {value:null,normalized:null,count:0,distinctPatterns:0,status:'invalid-delay',reason:'O atraso deve ser um inteiro entre 1 e 10.'};
    const count=x.length-(dimension-1)*delay;
    if(count<1) return {value:null,normalized:null,count:Math.max(0,count),distinctPatterns:0,status:'insufficient',reason:'Poucos pontos para formar padrões ordinais nesta escala.'};
    const patternWeights=new Map(); let totalWeight=0;
    for(let i=0;i<count;i++){
      const vector=[]; for(let k=0;k<dimension;k++) vector.push(x[i+k*delay]);
      const center=mean(vector); let sum=0;
      for(const value of vector) sum+=(value-center)**2;
      const weight=sum/dimension;
      const key=ordinalPattern(vector);
      patternWeights.set(key,(patternWeights.get(key)||0)+weight);
      totalWeight+=weight;
    }
    if(!Number.isFinite(totalWeight)||totalWeight<=0) return {value:null,normalized:null,count,distinctPatterns:patternWeights.size,totalWeight,status:'zero-weight',reason:'Soma dos pesos igual a zero; WPE não estimável nesta escala.'};
    let entropy=0;
    for(const weight of patternWeights.values()){const p=weight/totalWeight;if(p>0)entropy-=p*Math.log(p);}
    const maxEntropy=Math.log(factorial(dimension));
    if(!Number.isFinite(entropy)||entropy<0||entropy>maxEntropy+1e-10) return {value:null,normalized:null,count,distinctPatterns:patternWeights.size,totalWeight,status:'invalid-entropy',reason:'A entropia ponderada saiu dos limites numéricos esperados.'};
    return {value:entropy,normalized:entropy/maxEntropy,count,distinctPatterns:patternWeights.size,totalWeight,maxEntropy,status:'experimental',reason:'WPE ponderada exploratória; convenções de pesos e empates devem ser validadas independentemente.'};
  }

  function factorial(n){let result=1;for(let i=2;i<=n;i++)result*=i;return result;}
  function coarseGrain(values, scale) {
    const x=finiteSeries(values);
    if(!Number.isInteger(scale)||scale<1) return [];
    const count=Math.floor(x.length/scale),result=new Array(count);
    for(let j=0;j<count;j++){let sum=0;for(let k=0;k<scale;k++)sum+=x[j*scale+k];result[j]=sum/scale;}
    return result;
  }
  function calculateMSE(values, options = {}) {
    const scales=Number.isInteger(options.scales)?Math.max(1,Math.min(20,options.scales)):8;
    const dimension=Number.isInteger(options.dimension)?options.dimension:4;
    const delay=Number.isInteger(options.delay)?options.delay:1;
    const points=[];
    for(let scale=1;scale<=scales;scale++){
      const coarse=coarseGrain(values,scale);
      const wpe=weightedPermutationEntropy(coarse,dimension,delay);
      points.push({scale,n:coarse.length,value:Number.isFinite(wpe.value)?wpe.value:null,normalized:Number.isFinite(wpe.normalized)?wpe.normalized:null,patterns:wpe.distinctPatterns||0,templateCount:wpe.count||0,status:Number.isFinite(wpe.value)?'experimental':wpe.status,reason:wpe.reason||''});
    }
    const valid=points.filter(point=>Number.isFinite(point.value)).length;
    // The project's exploratory CI is the discrete sum of raw WPE (nats) across all requested scales.
    // Missing/invalid scales are not treated as zero.
    const CI=valid===scales?points.reduce((sum,point)=>sum+point.value,0):null;
    return {points,CI,validScales:valid,requestedScales:scales,dimension,delay,maxPerScale:Math.log(factorial(dimension)),maxCI:scales*Math.log(factorial(dimension)),status:valid===scales?'experimental':'incomplete',reason:valid===scales?'CI exploratório: soma discreta de WPE em nats nas escalas válidas.':'CI indisponível: ao menos uma escala não pôde ser estimada.'};
  }

  return { VERSION, mean, populationStd, sampleEntropy, sampleEntropyConfidenceInterval, timeSeriesDiagnostics, intrinsicModulation, fisherShannonKDE, weightedPermutationEntropy, coarseGrain, calculateMSE };
});
