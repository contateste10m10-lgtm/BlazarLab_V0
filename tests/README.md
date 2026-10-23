# Kit de validação — BlazarLab Privado 13.08 Lite

Execute na raiz do código extraído com Node.js:

```bash
node tests/ui-refinement-smoke.cjs
node tests/scientific-validation.cjs
node tests/mse-wpe-validation.cjs
node tests/data-quality-validation.cjs
node tests/import-provenance-contract.cjs
node tests/prepared-csv-advanced-contract.cjs
node tests/numpy-multisource-import.cjs
node tests/package-structure.cjs
node tests/mse-wpe-benchmark.cjs
node --check blazarlab.js
node --check laboratorio-loader.js
node --check assets/laboratory/app.js
node --check assets/laboratory/analysis-core.js
node --check assets/laboratory/analysis-worker.js
node --check assets/laboratory/data-library.js
```

## O que cada suíte cobre

- `ui-refinement-smoke.cjs`: estrutura da interface, quatro pilares avançados, cor/banda, tabela, ícones, tela cheia e dependências locais.
- `scientific-validation.cjs`: testes determinísticos para SampEn, Fisher–Shannon, máxima verossimilhança da modulação e WPE/CI, incluindo referências independentes.
- `mse-wpe-validation.cjs`: WPE independente, equivalência em escala única, coarse-graining, casos degenerados, valores extremos, escalas curtas, cancelamento e contrato experimental do CI.
- `data-quality-validation.cjs` e `import-provenance-contract.cjs`: diagnósticos sem mutação dos dados, qualidade temporal, datas ISO, metadados FITS suportados e proveniência.
- `prepared-csv-advanced-contract.cjs`: esquema exato do CSV inicial de dez colunas, resumo por banda, mapeamento de `n_pontos`, escrita em blocos e exportação de 10.000 linhas.
- `numpy-multisource-import.cjs`: `.npy` 1D/2D e estruturado, `.npz` comprimido, metadados escalares, biblioteca ZIP, incompatibilidade de comprimentos, rejeição segura de `dtype=object`, união multifonte e proveniência por arquivo.
- `package-structure.cjs`: IDs, abas/painéis, colunas, paleta, exportações e presença dos controles de biblioteca/NumPy e carregador local.
- `mse-wpe-benchmark.cjs`: observações descritivas de tempo e memória para séries de 1.000, 5.000 e 15.000 pontos; os valores não são limites universais de aprovação.

## Limites

As suítes automatizadas não substituem inspeção visual em dispositivos físicos, confronto externo com EntropyHub, comparação de Fisher–Shannon com software científico de referência ou calibração estatística por simulações. O CI de WPE mantém explicitamente sua convenção provisória. Consulte `BlazarLab_Privado_13.08_AUDITORIA.md` para os detalhes e limites conhecidos.

## Ingestão multifonte e NumPy na 13.08

A galeria aceita vários CSV/TSV/TXT delimitados, arquivos `.npy` e `.npz`, arquivos ZIP com conteúdo compatível e pastas locais em navegadores que suportam `webkitdirectory`. Os esquemas são unidos pelo nome de coluna; não há interpolação, imputação ou alinhamento temporal presumido. Cada linha mantém o identificador de fonte e um campo de proveniência do arquivo. Para vetores alinhados, prefira reunir os arrays com o mesmo comprimento num `.npz`; um `.npy` vetorial isolado recebe `indice_observacao`, que não é tempo físico. `dtype=object`/pickle, ZIP64, ZIP criptografado, arrays com mais de duas dimensões e datetimes NumPy com unidade embutida não são desserializados automaticamente.
