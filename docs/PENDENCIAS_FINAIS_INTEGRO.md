# Pendências Finais ÍNTEGRO

Atualizado em: 2026-07-16

## Bloqueios externos

- Firebase Rules não puderam ser validadas localmente porque `java -version` não está disponível no ambiente.
- Provisionamento seguro de Auth para convites exige backend seguro, Firebase Admin ou Cloud Function. O navegador continua bloqueado para criação Auth insegura.

## P1 ainda abertos

| ID | Pendência | Motivo |
|---|---|---|
| P1-004 | Rules não testadas por emulator | Java indisponível |

## P2 operacionais

| Área | Pendência |
|---|---|
| Auditoria | Tela dedicada criada; pendente homologação manual com dados reais e Rules |
| Captador | Tela dedicada criada; pendente homologação manual com dados reais e Rules |
| Relatórios | Exportação e relatórios precisam homologação manual por tenant/período |
| Notificações | Algumas origens ainda dependem de preenchimento consistente na criação dos documentos |
| Responsividade | Validação visual desktop/tablet/mobile ainda pendente |

## P3/futuro

- Chat interno completo.
- Tela dedicada de auditoria ampla, se aprovada como módulo separado.
- Gestão avançada de contas a pagar/fornecedores fora do ledger oficial.
