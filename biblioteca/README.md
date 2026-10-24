# Biblioteca do site — BlazarLab 13.12

Esta pasta alimenta a aba **Biblioteca do site** da Galeria Multifonte. O site busca `manifest.json` e só apresenta os conjuntos cadastrados nele.

## Adicionar um conjunto

1. Coloque o arquivo dentro de `dados/` (ou `exemplos/`). Formatos aceitos pelo catálogo: CSV, TSV, TXT delimitado, NPY, NPZ ou ZIP compatível.
2. Adicione uma entrada a `manifest.json` com ID único, título, descrição, caminho relativo, formato, condição sintética e licença/referência.
3. Publique o commit no repositório que serve o laboratório.
4. No site, abra **Galeria Multifonte → Biblioteca do site → Atualizar catálogo**.

Caminhos devem permanecer dentro de `biblioteca/`, sem URLs externas, caminhos absolutos ou `..`. O manifesto aceita no máximo 200 entradas e cada recurso tem limite de 50 MiB.

## Carregar várias fontes

- Marque uma ou mais tabelas de resultados compatíveis e use **Carregar selecionados** para substituir a carga atual ou **Adicionar à carga atual** para acrescentá-las.
- Para as três curvas Swift/BAT em formato largo, a galeria pode carregar várias fontes simultaneamente depois de escolher uma banda comum no seletor **Banda Swift/BAT para comparação multifonte**. A conversão é feita em memória para a banda escolhida, com tempo, RATE, RATE_ERR e origem preservados.
- Não misture, na mesma carga, curvas brutas Swift/BAT e tabelas já agregadas de métricas: suas unidades e granularidades são diferentes. Carregue esses tipos separadamente.
- A sobreposição de curva bruta permite selecionar de 2 a 8 fontes para a mesma banda. Se a série for longa, o gráfico amostra somente o traçado visual em até 4.000 pontos por fonte; as linhas completas continuam na tabela e exportação.
- Para análise completa das oito bandas de uma única curva Swift/BAT, use **Abrir fonte no laboratório principal**. A galeria multifonte foi otimizada para comparar uma banda comum entre várias fontes sem expandir todos os snapshots em milhões de linhas.

Depois de carregar, confira o mapeamento, as unidades e o painel de qualidade antes de gerar os gráficos. A junção de tabelas usa nomes de colunas, não faz alinhamento temporal automático e não preenche valores ausentes.

## Conjuntos Swift/BAT desta versão

A biblioteca contém três extratos compactos de curvas públicas Swift/BAT 157 meses, modalidade Eight Band Snapshot:

- `SWIFT J0017.1+8134` — 70.273 snapshots; contraparte [HB89] 0014+813; BZQ; z=3.3660.
- `SWIFT J0042.9+3016B` — 58.074 snapshots; contraparte 2MASX J00423991+3017515; BZQ; z=0.1408.
- `SWIFT J0413.3+1659` — 45.702 snapshots; contraparte MG1 J041325+1659; BZQ; redshift não informado.

Cada recurso tem uma tabela CSV larga por fonte, 21 colunas e uma linha por snapshot. As oito taxas e oito incertezas seguem as bandas 14–20, 20–24, 24–35, 35–50, 50–75, 75–100, 100–150 e 150–195 keV. Os valores RATE/RATE_ERR foram preservados sem conversão física. `tempo` é relativo em dias; os campos originais de tempo permanecem em segundos. Veja `metadados/SWIFT_BAT_157M_CONVERSAO.md` para detalhes, verificações e links de origem.

## CSV de resultados avançados

O CSV completo da análise mantém campos de observações e resultados derivados. WPE por escala tem registro próprio; valores ausentes permanecem vazios em vez de serem substituídos por zero. Fisher–Shannon por KDE continua experimental, e o CI de WPE permanece provisório até homologação de sua definição.

## Privacidade

**Tudo que for adicionado aqui será servido publicamente pelo site.** Inclua somente dados públicos, sintéticos ou autorizados para redistribuição. Os dados privados devem ser abertos na aba **Meus dados locais**, que não os envia a um backend. O GitHub Pages é estático e não oferece armazenamento privado para uploads.

`exemplos/demo_multifonte_SINTETICO.csv` é demonstrativo e não representa observações astronômicas reais.
