# BlazarLab Privado 13.06 Lite — relatório de auditoria

**Data:** 23/10/2026  
**Base:** BlazarLab Privado 13.05 Lite  
**Escopo:** qualidade dos dados importados, cadência temporal, máscaras de elegibilidade por método, leitura FITS BINTABLE suportada e proveniência local.

## Resumo

A 13.06 adiciona uma camada de diagnóstico entre o mapeamento de colunas e o cálculo. Ela preserva a ordem/valores da tabela interpretada, não interpola lacunas nem funde duplicatas, distingue contagens brutas de candidatos por método e disponibiliza um manifesto JSON da configuração de análise. O pacote Lite contém o aplicativo e os recursos necessários; os testes e materiais de auditoria ficam separados no kit.

## Implementado

### Qualidade por banda

- Resumo de linhas tabulares, tempos finitos, cobertura temporal global, cadência mediana, MAD dos intervalos e contagem de alertas.
- Tabela diagnóstica de 18 colunas por banda: registros brutos; pares finitos tempo–fluxo; linhas sem tempo e sem fluxo válido; indicadores de elegibilidade preliminar de SampEn e Fisher–Shannon; pares com incerteza válida; vetores estimáveis na escala máxima de WPE; cadência mediana/MAD; maior lacuna; cobertura; tempos duplicados; recuos cronológicos; fluxos negativos; incertezas ausentes/inválidas; mensagens explicativas.
- Diagnóstico heurístico de lacunas configurável entre 1,5× e 10× a mediana. Uma lacuna sinalizada não significa que uma observação deveria necessariamente existir ali.
- Duplicação/reutilização de colunas de fluxo e incerteza, sobreposição entre papéis, nomes de colunas repetidos/genéricos e unidades declaradas incompatíveis são alertados.
- Valores de fluxo negativos permanecem no conjunto importado: são sinalizados, não removidos por regra genérica.
- Para arquivos maiores que 100.000 linhas, os contadores de registros e elegibilidade permanecem exatos, enquanto a estimativa de cadência usa uma amostra sistemática explicitada nos diagnósticos.

### Preservação temporal e importação

- Os diagnósticos cronológicos trabalham em cópias/amostras; não ordenam ou alteram `state.dataRows`.
- Linhas com células vazias ou inválidas continuam representadas quando correspondem ao formato tabular reconhecido. Linhas não tabulares/linhas em branco são contabilizadas nas estatísticas do leitor quando aplicável; os bytes originais permanecem retidos na sessão, antes de qualquer descompressão.
- Datas ISO passam por verificação de calendário e horário. Datas `YYYY-MM-DD` e datetimes com fuso explícito podem ser normalizados para dias desde a época Unix, desde que a coluna temporal não misture coordenadas numéricas com timestamps ISO.
- Se a mesma coluna mistura valores numéricos nativos e tokens ISO, os valores ISO não são convertidos: uma conversão nesse cenário poderia misturar MJD/JD/outro sistema com dias desde a época Unix. O conflito é mostrado no painel e no manifesto.
- Datetimes sem fuso explícito e tokens ISO inválidos permanecem indisponíveis, com motivo registrado. Nenhum fuso é presumido.
- O leitor FITS procura BINTABLE compatível nas primeiras 30 HDUs; suporta coluna multibanda vetorial e múltiplas colunas escalares de medidas; campos `A` de largura fixa são uma só coluna, não várias cópias.
- Quando encontrados e compatíveis, `TNULLn` é aplicado a dados inteiros antes da escala, `TSCALn`/`TZEROn` são aplicados a valores numéricos, e unidades/metadados temporais como `TIMESYS`, `MJDREF`, `TIMEUNIT` e metadados por coluna são registrados.
- Valores temporais FITS numéricos permanecem no sistema/unidade nativos; não há rebasing automático de MJD/JD, conversão de escalas temporais, promessa de suporte universal a FITS ASCII ou a todas as representações/arrays possíveis.

### Proveniência

- Fingerprint calculado localmente sobre os bytes originais do arquivo antes de descompactar gzip. SHA-256 é usado quando WebCrypto está disponível; o fallback FNV-1a-32 é identificado pelo nome e não é apresentado como SHA-256.
- O manifesto JSON contém versão, identificação e fingerprint do arquivo, estatísticas de importação, mapeamento/colunas, unidades declaradas, metadados FITS reconhecidos, diagnósticos por banda, parâmetros e notas de transformação.
- O manifesto **não contém os valores observacionais brutos**. A geração não envia o arquivo nem o manifesto a um servidor.
- O manifesto deixa explícito que candidatos de elegibilidade não garantem uma estimativa finita ou cientificamente válida. A incerteza ausente pode impedir a modulação sem invalidar automaticamente outros métodos.

## Testes automatizados executados

Os seis testes abaixo passaram no estado final do código:

1. `tests/ui-refinement-smoke.cjs` — estrutura dos quatro pilares, paleta por banda e elementos da interface.
2. `tests/scientific-validation.cjs` — regressão dos quatro pilares científicos da versão anterior.
3. `tests/mse-wpe-validation.cjs` — equivalência independente de WPE, escala única, coarse-graining, valores extremos, escalas esparsas, cancelamento e CI experimental.
4. `tests/data-quality-validation.cjs` — contagem independente de dados ausentes, cadência/MAD/lacunas, duplicatas, mapeamento, fluxos negativos preservados, amostragem e não mutação dos registros.
5. `tests/import-provenance-contract.cjs` — helpers reais de ISO testados isoladamente, proteção contra mistura de coordenadas temporais e contratos de layout FITS.
6. `tests/package-structure.cjs` — IDs únicos, quatro painéis avançados, tabela de resultados com 21 colunas, tabela de qualidade com 18 colunas e CSV com 44 campos alinhados.

Também passaram `node --check` em `blazarlab.js`, `laboratorio-loader.js`, `assets/laboratory/app.js`, `assets/laboratory/analysis-core.js` e `assets/laboratory/analysis-worker.js`.

Benchmark descritivo do cálculo MSE/WPE (não é um critério universal de aprovação), neste ambiente:

| Pontos | Tempo observado | Variação de heap observada |
|---:|---:|---:|
| 1.000 | 16,86 ms | +0,23 MiB |
| 5.000 | 38,87 ms | +0,13 MiB |
| 15.000 | 69,32 ms | +0,82 MiB |

## Validação não concluída / limitações

- A inspeção interativa em Chromium não pôde ser completada: a política do ambiente bloqueou tanto `127.0.0.1`/`localhost` quanto URLs `file://`. Por isso, a responsividade e a aparência devem ser conferidas no navegador do usuário; não declaro validação visual completa.
- Os testes em Node verificam propriedades, contratos e estrutura, mas não substituem um teste de interação real em desktop/celular.
- A conversão de unidades de fluxo/erro não é automática. Unidades ausentes ou incompatíveis precisam ser confirmadas na documentação da fonte.
- A implementação de CI da 13.05 permanece experimental até a definição metodológica original ser confirmada. Estimativas Fisher–Shannon por KDE e a calibração inferencial da modulação também mantêm suas limitações anteriores; esta versão não as homologa.
- A leitura FITS é deliberadamente limitada a BINTABLEs compatíveis reconhecidas nas primeiras 30 HDUs e não deve ser descrita como suporte a todas as variantes FITS.

## Como reproduzir

Extraia o `BlazarLab_Privado_13.06_Kit-de-validacao.zip`, abra um terminal na raiz e execute:

```sh
node tests/ui-refinement-smoke.cjs
node tests/scientific-validation.cjs
node tests/mse-wpe-validation.cjs
node tests/data-quality-validation.cjs
node tests/import-provenance-contract.cjs
node tests/package-structure.cjs
node tests/mse-wpe-benchmark.cjs
```

Para visualizar a aplicação, extraia o ZIP Lite e, na sua própria máquina, sirva a pasta com `python -m http.server 8000` e abra `http://localhost:8000/`. A aplicação é local; não publique arquivos observacionais reais nem o pacote privado no site público.
