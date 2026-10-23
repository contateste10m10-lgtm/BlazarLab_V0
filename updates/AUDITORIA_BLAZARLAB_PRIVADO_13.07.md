# Auditoria — BlazarLab Privado 13.07 Lite

**Data:** 23/10/2026  
**Objetivo:** corrigir o contrato do botão **Baixar CSV inicial**, para que a exportação da curva carregada possa ser importada na galeria multifonte avançada com o esquema solicitado.

## Resumo

A exportação inicial passa a emitir exatamente 10 colunas, nesta ordem:

```csv
fonte,janela,banda,tempo,fluxo,sampen,classe_fonte,variabilidade_robusta,modulation_index_percent,n_pontos
```

O exportador usa o mapeamento atual de tempo e das bandas. Cada linha de dados representa um par finito de tempo e fluxo de uma banda selecionada. A serialização ocorre em blocos de 2.500 linhas e inclui BOM UTF-8 para compatibilidade com planilhas.

## Semântica dos campos

- `fonte`: nome da fonte, rótulo informado na interface ou identificador do arquivo como fallback.
- `janela`: vazia; o arquivo descreve a curva completa, sem segmentação temporal em janelas.
- `banda`: rótulo da banda mapeada.
- `tempo`, `fluxo`: observação original após validação numérica; pares em que um dos campos não é finito são omitidos e contabilizados no status do exportador.
- `sampen`: resumo por banda, escrito apenas na primeira observação válida quando existe análise atual com valor numérico. Fica vazio antes do cálculo ou quando indisponível.
- `classe_fonte`: `SINTÉTICO` para a demonstração sintética; para dados reais sem classe declarada, `Não classificada`. O programa não infere classe astrofísica.
- `variabilidade_robusta`: percentual robusto por banda, calculado como `100 × 1,4826 × MAD / |mediana|`, quando definido, e escrito apenas na primeira observação válida da banda.
- `modulation_index_percent`: resumo por banda, escrito apenas na primeira observação quando existe uma estimativa numérica válida e status `OK`. Um resultado de fronteira/candidato a limite superior não é exportado como detecção numérica.
- `n_pontos`: número de pares finitos tempo-fluxo da banda, escrito na primeira observação válida da banda.

A colocação dos resumos por banda em apenas uma linha evita repetir uma estatística da fonte milhares de vezes e distorcer histogramas ou dispersões baseados em registros. As colunas de SampEn e modulação podem ficar vazias até que a análise principal esteja pronta. O importador distingue a mera existência da coluna de valores numéricos efetivamente disponíveis.

## Compatibilidade com o modo avançado

- A área do botão explica o esquema e pode ser usada como ponte para a galeria multifonte.
- O mapeamento automático reconhece os dez nomes de coluna, incluindo `n_pontos` em um campo de metadado próprio.
- `n_pontos` não é consumido como tamanho de bolha.
- A importação preserva `n_pontos` como resumo/meta; o usuário pode revisar ou alterar o mapeamento antes de gerar a galeria.
- A função de exportação usada pelo atalho de curva para a galeria utiliza o mesmo contrato de 10 colunas.

## Limites que precisam permanecer visíveis

Este CSV de 10 colunas é um formato de intercâmbio para a galeria avançada, não uma cópia integral do arquivo científico original. Ele **não inclui incerteza de fluxo por observação**, de modo que não substitui o arquivo original para reproduzir o ajuste de modulação intrínseca. A ausência de `janela` é intencional; não são inventadas janelas. Tempos repetidos são preservados, sem fusão, e lacunas não são interpoladas. Valores de métricas indisponíveis permanecem vazios, não viram zero.

A 13.07 altera o contrato de exportação e sua integração com a galeria; não declara uma nova homologação matemática de Fisher–Shannon ou MSE-WPE/CI. As limitações experimentais já documentadas na 13.06 permanecem.

## Testes executados

Sete suítes passaram na cópia extraída do kit:

1. `tests/ui-refinement-smoke.cjs`
2. `tests/scientific-validation.cjs`
3. `tests/mse-wpe-validation.cjs`
4. `tests/data-quality-validation.cjs`
5. `tests/import-provenance-contract.cjs`
6. `tests/package-structure.cjs`
7. `tests/prepared-csv-advanced-contract.cjs`

A nova suíte de exportação extrai e executa as funções reais de construção/download num harness isolado, com 10.000 registros em duas bandas. Verifica o cabeçalho exato, as dez colunas em cada linha, métricas não calculadas vazias, um resumo por banda, o mapeamento independente de `n_pontos` e a não exportação de um candidato a limite superior como detecção.

Também passaram `node --check` para `blazarlab.js`, `laboratorio-loader.js`, `assets/laboratory/app.js`, `assets/laboratory/analysis-core.js` e `assets/laboratory/analysis-worker.js`.

## Limitação de verificação

A tentativa de fluxo completo pela interface em Chromium foi bloqueada pela política do ambiente (`ERR_BLOCKED_BY_ADMINISTRATOR` ao navegar para `localhost`). Por isso, o contrato de exportação foi exercitado diretamente com as funções reais num harness Node.js, mas não se afirma que o clique e a reimportação tenham sido validados integralmente no Chromium nesta rodada. O teste de contrato e o teste estrutural passaram; uma verificação visual no navegador do usuário continua recomendada.

## Arquivos entregues

- `BlazarLab_Privado_13.07_Lite_CSV-Avancado.zip` — aplicação enxuta.
- `BlazarLab_Privado_13.07_Kit-de-validacao.zip` — testes e documentação reproduzível.
- Este relatório, também incluído na pasta `updates/` do kit.
