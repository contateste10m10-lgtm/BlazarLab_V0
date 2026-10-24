# Swift/BAT 157 meses — preparação para BlazarLab 13.12

## O que foi feito

Os três arquivos FITS `.lc` fornecidos no ZIP original foram lidos sem modificar o arquivo original e convertidos em CSVs largos, um registro por snapshot. Cada CSV é distribuído dentro de um ZIP por fonte para reduzir o recurso transferido. Os arquivos FITS originais, com 77 colunas e tamanhos muito maiores, não são incorporados ao pacote Lite.

## Esquema final

Cada CSV contém exatamente 21 colunas, nesta ordem:

- `tempo`: dias relativos ao menor valor `TIME` válido daquela fonte, isto é, `(TIME - min(TIME))/86400`.
- `tempo_original_s`: `TIME` do FITS original, em segundos.
- `tempo_fim_original_s`: `TIME_STOP`, em segundos.
- `exposicao_s`: `EXPOSURE`, em segundos.
- `fonte`: identificador SWIFT do catálogo.
- Oito colunas `rate_*_keV` na ordem das bandas 14–20, 20–24, 24–35, 35–50, 50–75, 75–100, 100–150 e 150–195 keV.
- Oito colunas `error_*_keV` na mesma ordem.

Contraparte, classe, redshift, link oficial, checksum e tamanho ficam no `biblioteca/manifest.json`, em vez de repetirem-se em dezenas de milhares de linhas. SNR foi omitido para manter o recurso compacto; nenhuma taxa ou incerteza foi reamostrada, interpolada ou agregada.

## Proveniência e controles

| Fonte | Classe / contraparte | z | Snapshots | RATE negativos mantidos | SHA-256 FITS original | Catálogo |
|---|---|---:|---:|---:|---|---|
| SWIFT J0017.1+8134 | BZQ / [HB89] 0014+813 | 3.3660 | 70.273 | 278.632 | `823e2112ca423c3bc0de14550faaf23c25ca74e659b03143401b7075f2e7c7b5` | https://swift.gsfc.nasa.gov/results/bs157mon/9 |
| SWIFT J0042.9+3016B | BZQ / 2MASX J00423991+3017515 | 0.1408 | 58.074 | 232.345 | `102a86464c983e48be5c5312f6d1d47cc4f53001786cabeaf7e1e83331e90bbd` | https://swift.gsfc.nasa.gov/results/bs157mon/30 |
| SWIFT J0413.3+1659 | BZQ / MG1 J041325+1659 | Não informado | 45.702 | 181.122 | `ec8f050a6c777eee37e2599ee9fcfcea36f18a632ceca488716e8fadc7988c10` | https://swift.gsfc.nasa.gov/results/bs157mon/210 |

Verificações feitas contra os FITS originais: os números de registros coincidem com `NAXIS2`, os 8 valores `RATE` e os 8 `RATE_ERR` da primeira linha foram comparados diretamente em cada fonte, a ordem temporal não apresenta inversões e o CSV final mantém os valores exportados de taxa/erro da conversão anterior sem nova transformação numérica. Os valores negativos foram preservados.

As unidades dos campos RATE/RATE_ERR permanecem conforme o cabeçalho do FITS recebido (`count/s`); não é feita conversão para fluxo físico. `TIME` e `TIME_STOP` são preservados em segundos. Como o arquivo não apresenta metadados temporais absolutos suficientes para identificar com segurança a época/sistema temporal, `tempo` é um eixo relativo por fonte, não MJD nem UTC. Não compare diretamente `tempo=0` de fontes distintas como se fosse uma época simultânea.

A codificação numérica segue a conversão original para CSV em 12 algarismos significativos para taxas/erros, portanto não é uma cópia textual byte a byte dos campos FITS. O SHA-256 dos FITS originais acima permite rastrear o arquivo de entrada; o hash e o tamanho do ZIP publicado são registrados no manifesto.

## Como carregar no laboratório

1. Abra Galeria Multifonte → **Biblioteca do site** → Atualizar catálogo.
2. Para comparar várias fontes na galeria, marque duas ou três fontes Swift/BAT, selecione uma banda comum no controle **Banda Swift/BAT para comparação multifonte** e clique **Carregar selecionados** ou **Adicionar à carga atual**. A aplicação converte cada tabela larga para uma vista tabular da banda selecionada em memória; conserva taxa, erro, tempo original e fonte.
3. Na galeria, confira `tempo`, `fluxo`/RATE, `sigma`, `fonte` e `banda`; depois gere a galeria e use a sobreposição bruta para marcar de 2 a 8 fontes.
4. Para uma análise completa das oito bandas de uma curva, selecione uma fonte e clique **Abrir fonte no laboratório principal**. O importador sugere tempo, oito taxas e oito erros; confira o mapeamento antes de calcular.
5. Use **Calcular se necessário + integrar os quatro métodos** para enviar a sessão ao modo avançado diretamente, sem baixar/reimportar CSV.

O laboratório principal calcula uma curva larga por vez porque cada fonte tem milhões de células em oito bandas; a galeria foi projetada para comparação simultânea de uma banda comum. Não misture curvas brutas com tabelas de métricas na mesma carga.

## Referências

- Catálogo Swift/BAT 157 meses: https://swift.gsfc.nasa.gov/results/bs157mon/
- Descrição das oito bandas: https://heasarc.gsfc.nasa.gov/W3Browse/catalog/swbat157m.html

A publicação pela biblioteca torna os arquivos acessíveis publicamente. Confira os termos/regras da fonte oficial antes de redistribuir. Este documento registra o processamento feito, mas não substitui a verificação científica dos métodos de análise.
