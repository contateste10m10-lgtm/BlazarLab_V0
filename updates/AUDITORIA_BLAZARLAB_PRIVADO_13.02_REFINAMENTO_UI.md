# BlazarLab Privado 13.02 Lite — auditoria de refinamento da interface

**Data:** 23/10/2026  
**Base:** `BlazarLab_Privado_13.02_Lite`  
**Escopo:** interface de resultados e modos avançados; não altera o núcleo matemático deliberadamente.

## Alterações aplicadas

1. **Espaço vazio no primeiro painel de resultados:** os itens do grid passam a alinhar pelo próprio conteúdo, então a área do gráfico não estica até acompanhar a altura da tabela.
2. **Tabela de resultados:** o estado vazio agora usa `colspan="15"`, igual ao total de colunas. A tabela mantém uma largura mínima para não comprimir 15 colunas em texto ilegível, rola horizontalmente e mantém a banda visível durante a rolagem.
3. **Navegação interna:** os quatro destinos receberam índices, alvos maiores, estilo de seleção e atualização da seção atual por observação de rolagem, com alternativa por clique.
4. **Interpretação da modulação:** o espaço livre recebeu um esquema de três passos — variância observada, incerteza de medição e variância intrínseca — seguido por estados interpretativos.
5. **Nitidez dos gráficos:** Chart.js usa DPR mínimo de 2 e máximo de 3, e os rótulos/títulos dos eixos ficam maiores e com fonte de sistema.
6. **Tela cheia dos gráficos:** a barra de ferramentas agora inclui um controle de tela cheia. O painel expande em sobreposição sem depender da API nativa de tela cheia; `Esc` e o mesmo controle fecham a visualização. O gráfico é redimensionado após a transição.
7. **Exploração avançada por método:** seletor em abas para Sample Entropy, Fisher–Shannon e MSE-WPE/CI. Cada aba mostra gráficos correspondentes e um guia de interpretação. As abas aceitam setas, Home e End pelo teclado e redimensionam gráficos que estavam dentro de painéis ocultos.
8. **Disponibilidade por banda:** os estados deixaram de ser parágrafos longos e agora são cartões com indicadores distintos para SampEn, modulação, Fisher–Shannon e WPE/CI.
9. **Remoção solicitada:** o cartão independente “Referência para Sample Entropy” saiu da área de metodologia do laboratório. As referências gerais do site não foram removidas.
10. **Temas:** os novos controles acompanham as cores de destaque azul, rosa e Ouro Estelar, em temas claro e escuro.

## Verificações executadas

- `node --check assets/laboratory/app.js` — passou.
- `node --check assets/laboratory/analysis-core.js` — passou.
- Parsing CSS com `tinycss2` — 0 erros de sintaxe reportados.
- Verificação estrutural de HTML — 271 IDs no fragmento; nenhuma duplicata.
- Ligações de acessibilidade: 3 abas e 3 painéis, todos associados pelos seus IDs.
- Canvases de resultado avançado — IDs únicos para os seis gráficos conferidos.
- Tabela — 15 cabeçalhos, `colspan="15"` no estado vazio.
- Todas as dependências locais citadas pelo carregador existem dentro do pacote.
- Referências relativas `url(...)` verificadas no CSS — nenhuma ausência encontrada.
- O cartão independente de referência foi removido.

## Limite desta auditoria

A navegação automatizada do Chromium foi bloqueada pelo ambiente com `ERR_BLOCKED_BY_ADMINISTRATOR` tanto em endereço local quanto em arquivo local. Portanto, **não afirmo que concluí uma validação visual interativa no navegador** nesta execução. As verificações acima são estáticas; o comportamento visual deve ser revisado ao abrir o site/pacote no navegador habitual.

## Arquivo de teste incluído

Execute `node tests/ui-refinement-smoke.cjs` a partir desta pasta para repetir as verificações estruturais principais.
