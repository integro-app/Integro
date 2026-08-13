# ÍNTEGRO — Hotfix de Interface v14

Data: 06/08/2026
Base: `Integro-GitHub-Interface-Unificada-20260806-v13.zip`

## Correções aplicadas a partir dos prints

1. **Submenus repetidos em Operação e Minha conta**
   - Corrigida a busca da barra já existente.
   - A rotina agora remove duplicidades herdadas e mantém somente uma barra por tela.
   - A barra é posicionada uma única vez no topo do módulo, sem empurrar o conteúdo para baixo indefinidamente.

2. **Seletor do Dashboard quebrado e estreito**
   - O antigo dropdown passou a ocupar toda a largura como barra horizontal.
   - Removidos título auxiliar, descrições e check visual que deformavam o seletor.
   - Mantidas as perspectivas permitidas e o destaque da opção ativa.

3. **Valores auxiliares dos cards aparecendo como `R$ ...`**
   - O tamanho grande ficou restrito ao valor principal.
   - Valores internos de Novas, Renovadas, Gastos e Retiros voltaram a caber nos cards.

4. **Movimentações e Financeiro abrindo a mesma visão**
   - `Movimentações` abre diretamente a aba **Lançamentos**.
   - `Financeiro` abre diretamente o **Resumo**.
   - O item ativo da sidebar acompanha corretamente cada acesso.

5. **Colunas Origem e Caixa sobrepostas no ledger**
   - Aplicado layout fixo e larguras próprias para as colunas.
   - Identificadores longos ficam contidos com reticências, sem invadir a coluna seguinte.

6. **Consulta inicial de Clientes por data**
   - O parser agora reconhece Timestamp do Firestore, epoch, ISO (`aaaa-mm-dd`) e formato brasileiro (`dd/mm/aaaa`).
   - Evitado o deslocamento de um dia causado por datas ISO interpretadas em UTC.

## Arquivos principais alterados

- `js/integro-interface-v14.js`
- `css/integro-interface-v14.css`
- `js/unified-navigation.js`
- `master-local.html`
- shells dos perfis para carregamento da camada v14
- `tests/interface-v14.test.js`
- `package.json` e `package-lock.json`

## Validações

- 308 testes automatizados aprovados.
- Integridade HTML aprovada em 8 telas, sem avisos.
- 86 scripts inline com sintaxe aprovada.
- 95 arquivos JavaScript externos com sintaxe aprovada.
- Superfície pública do Firebase Hosting aprovada.
- Sintaxe de `functions/index.js` aprovada.

## Observação

Nenhuma regra de permissão, regra do Firestore, contrato de serviço financeiro ou fluxo transacional foi removido. O hotfix atua na navegação, renderização e apresentação dos dados.
