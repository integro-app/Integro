# Correção de compatibilidade visual — v2

## Regressão corrigida

A primeira camada de padronização usava seletores globais e um normalizador automático. Isso alterou componentes que já possuíam identidade própria, especialmente a tela de login, o cabeçalho autenticado, menus e controles dinâmicos.

## Estratégia aplicada

A versão v2 foi reconstruída sobre a base otimizada aprovada. O login foi preservado sem carregar a camada administrativa. Nas páginas autenticadas, os arquivos centrais continuam disponíveis, mas operam em modo estritamente opt-in.

## Garantias

- Nenhum ID ou `onclick` foi removido.
- Nenhuma função operacional, consulta, coleção, permissão ou regra Firebase foi alterada.
- O login voltou ao HTML e CSS da versão otimizada aprovada.
- O loader permaneceu sob os estilos próprios de cada perfil.
- A camada v2 não possui regras para `.sidebar`, `.menu-item`, `.topbar`, `.integro-global-header`, `.login-page` ou `.integro-boot-loader`.
- O cache foi invalidado com a versão `20260805-v2`.

## Próxima fase

A padronização deverá ser feita por módulos homologados, começando por componentes compartilhados de baixo risco: badges, estados vazios, botões de ação secundária e tabelas administrativas. Layout estrutural, login e shell só podem ser alterados mediante aprovação visual explícita.
