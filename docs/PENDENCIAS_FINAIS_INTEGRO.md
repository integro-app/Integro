# Pendências Finais ÍNTEGRO

Atualizado em: 2026-07-16

## Bloqueios externos

- Deploy e publicação de Rules não foram executados por regra do projeto.
- Provisionamento seguro de Auth para convites exige backend seguro, Firebase Admin ou Cloud Function. O navegador continua bloqueado para criação Auth insegura.

## P1 ainda abertos

| ID | Pendência | Motivo |
|---|---|---|
| P1-004 | Rules não testadas por emulator | Corrigido: `npm.cmd run test:rules` passou com 16 testes |

## P2 operacionais

| Área | Pendência |
|---|---|
| Auditoria | Homologada tecnicamente; pendente evidência manual com dados reais |
| Captador | Homologado tecnicamente; pendente evidência manual com dados reais |
| Relatórios | Homologados tecnicamente nos cenários automatizados; pendente evidência manual por tenant/período |
| Notificações | Pendentes de evidência manual com documentos reais gerados nos fluxos |
| Responsividade | Scripts e CSS não quebram estaticamente; pendente evidência visual desktop/tablet/mobile |

## P3/futuro

- Chat interno completo.
- Tela dedicada de auditoria ampla, se aprovada como módulo separado.
- Gestão avançada de contas a pagar/fornecedores fora do ledger oficial.

## Rodada final de utilizacao real - 2026-07-16

- Corrigido feedback operacional: alerta nativo removido do codigo HTML/JS e substituido por `notificarIntegro()`.
- Corrigido recurso ausente do logo em `master-local.html`, evitando erro de console por asset local inexistente.
- Validado: scripts inline das 8 telas, sintaxe dos JS alterados, `npm.cmd test` 101/101, `npm.cmd run test:rules` 16/16 e `git diff --check`.
- Pendencia externa real: navegador embutido bloqueou `localhost` e `file://`, portanto screenshots/console real nos viewports 1440x900, 1366x768, 768x1024, 390x844 e 360x800 ainda precisam ser coletados em navegador permitido ou ambiente publicado.
- Sem P0/P1 automatizados restantes. A pendencia que impede declarar utilizacao plena e a evidencia visual real por viewport.

## Homologacao publicada - bloqueio seguro 2026-07-16

- `.firebaserc` possui somente `default: integro-novo`.
- Nao ha projeto separado de homologacao configurado como alias local.
- Publicacao de Hosting, Firestore Rules, Firestore Indexes e Storage Rules nao foi executada.
- Evidencia: `docs/evidencias-homologacao/BLOQUEIO_PUBLICACAO_HOMOLOGACAO_2026-07-16.md`.
- Testes antes do bloqueio: `npm.cmd test` 101/101, `npm.cmd run test:rules` 16/16 e `git diff --check` aprovado.
