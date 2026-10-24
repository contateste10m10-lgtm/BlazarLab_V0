# Biblioteca do site — BlazarLab 13.11

Esta pasta alimenta a aba **Biblioteca do site** da Galeria Multifonte. O site busca `manifest.json` e mostra somente os conjuntos cadastrados ali.

## Adicionar um dataset

1. Coloque o arquivo dentro de `dados/` (ou `exemplos/`). Formatos suportados: CSV, TSV, TXT delimitado, NPY, NPZ ou ZIP compatível.
2. Edite `manifest.json` e adicione um objeto a `datasets`. Exemplo:

```json
{
  "id": "meu-conjunto-swift",
  "title": "SWIFT — conjunto público",
  "description": "O que os dados representam, instrumento, faixa temporal e unidades.",
  "path": "dados/meu_conjunto.csv",
  "format": "csv",
  "synthetic": false,
  "defaultSelected": false,
  "license": "Informe licença ou referência de origem",
  "tags": ["SWIFT", "curva de luz"]
}
```

O `id` deve ser único e conter apenas letras, números, `-` ou `_`. `path` é relativo a esta pasta e precisa apontar para um arquivo dentro de `biblioteca/`. Não use URLs externas, caminhos absolutos ou `..`. Atualize a aba no site usando **Atualizar catálogo** depois que o commit for publicado.

## Escolher dados no site

A pessoa que usa o laboratório abre a aba, marca um ou mais conjuntos, e escolhe **Carregar selecionados** para substituir a carga atual ou **Adicionar à carga atual** para acrescentar datasets. Depois, confere o mapeamento e gera a galeria. Cada linha ganha um campo de proveniência do arquivo.

## Privacidade e permissões

**Tudo que é cadastrado aqui é servido publicamente pelo site.** Inclua somente dados públicos, sintéticos ou que você tenha autorização de divulgar. Para dados privados/restritos, não faça commit: carregue-os usando a aba **Meus dados locais**. O GitHub Pages é estático e não armazena uploads privados.

`exemplos/demo_multifonte_SINTETICO.csv` é deliberadamente sintético e pode ser publicado para demonstrar a interface.


## Caminho de carregamento

A aba da biblioteca lê este manifesto por HTTP/HTTPS e carrega apenas os datasets marcados pelo usuário. **Carregar selecionados** substitui a carga multifonte em memória; **Adicionar à carga atual** combina os selecionados com as fontes já carregadas. A junção é pelo nome do campo, não por timestamp. Confira o mapeamento e a qualidade antes de calcular.

O fluxo **Meus dados locais** é separado: anexar arquivos, pasta ou ZIP pelo navegador não publica esses arquivos. A biblioteca hospedada, em contrapartida, é pública.

## CSV completo do modo avançado

O exportador completo mantém, nesta ordem, as 26 colunas: `fonte`, `janela`, `banda`, `tempo`, `fluxo`, `sampen`, `classe_fonte`, `variabilidade_robusta`, `modulation_index_percent`, `n_pontos`, `sigma`, `r_absoluto`, `H_X_nats_KDE_experimental`, `entropy_power_NX_KDE_experimental`, `Fisher_information_KDE_experimental`, `Fisher_Shannon_product_experimental`, `WPE_nats`, `CI_WPE_sum_nats_experimental`, `WPE_valid_scales`, `WPE_escala`, `tipo_registro`, `status_modulacao`, `limite_superior_modulacao_percent`, `modulacao_ic68_inferior_percent`, `modulacao_ic68_superior_percent` e `erro_fluxo`. Ausências ficam vazias, não são zeros.


## Conjuntos Swift/BAT incorporados na 13.11

Foram preparados três extratos compactos das curvas oficiais **Eight Band Snapshot** do catálogo Swift/BAT de 157 meses. Cada ZIP contém uma tabela CSV em formato largo, com uma linha por snapshot e oito pares de colunas `rate_*_keV` / `error_*_keV`. O catálogo registra título, contraparte, classe, redshift, referência pública, hash SHA-256 e tamanho do recurso.

- `SWIFT J0017.1+8134` — contraparte `[HB89] 0014+813`; BZQ; z=3.3660; 70.273 snapshots.
- `SWIFT J0042.9+3016B` — contraparte `2MASX J00423991+3017515`; BZQ; z=0.1408; 58.074 snapshots.
- `SWIFT J0413.3+1659` — contraparte `MG1 J041325+1659`; BZQ; redshift não informado; 45.702 snapshots.

A ordem dos oito pares segue as bandas de energia 14–20, 20–24, 24–35, 35–50, 50–75, 75–100, 100–150 e 150–195 keV descritas no catálogo HEASARC. `tempo` é um eixo relativo em dias, calculado como `(TIME - mínimo TIME válido)/86400`; o `TIME` original em segundos e `TIME_STOP` são mantidos em colunas separadas. O FITS fornecido não explicita uma época/sistema temporal suficiente para convertê-los automaticamente a MJD ou UTC, então nenhuma conversão absoluta é alegada. Os valores e erros das colunas RATE/RATE_ERR são copiados sem conversão física de unidade; o cabeçalho fornecido declara `count`, e isso fica documentado no manifesto/metadados. Valores RATE negativos são preservados e não tratados genericamente como inválidos.

Os recursos comprimidos são carregados sob demanda. Como cada curva tem dezenas de milhares de snapshots, comece carregando **uma fonte por vez** e retire outras fontes da carga se a memória do navegador ficar alta. Selecione `tempo` como coluna temporal, as oito colunas `rate_*` como taxas e as oito `error_*` como incertezas; o algoritmo pode sugerir esse mapeamento, mas confira antes de calcular.

Os conjuntos estão listados nas páginas oficiais NASA/Swift-BAT: https://swift.gsfc.nasa.gov/results/bs157mon/9 ; https://swift.gsfc.nasa.gov/results/bs157mon/30 ; https://swift.gsfc.nasa.gov/results/bs157mon/210 . As faixas de energia são descritas no catálogo HEASARC: https://heasarc.gsfc.nasa.gov/W3Browse/catalog/swbat157m.html . A licença/termos específicos não foram incorporados nos arquivos recebidos; consulte os avisos do arquivo de origem e cite a referência oficial ao redistribuir.


## Curvas Swift/BAT em formato largo

Os três produtos Swift/BAT nesta versão são tabelas largas de curvas de luz: cada linha é um snapshot, e cada uma das oito bandas tem suas próprias colunas `rate_*_keV` e `error_*_keV`. No catálogo, selecione uma dessas fontes e use **Abrir fonte no laboratório principal**. Confira o mapeamento sugerido e clique em Calcular; depois use o atalho **Calcular se necessário + integrar os quatro métodos** para encaminhar curva e resultados à galeria avançada diretamente da memória. Não use **Carregar selecionados** da galeria para tratar uma curva larga como uma tabela de uma só banda. Por segurança de memória, carregue uma fonte por vez.


Consulte `metadados/SWIFT_BAT_157M_CONVERSAO.md` para ver o esquema de 21 colunas, as bandas e as decisões de conversão dos três extratos Swift/BAT.
