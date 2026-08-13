# ÍNTEGRO — Operações em tempo real (v4)

## Objetivo

Toda operação financeira confirmada passa a usar `lancamentos_financeiros` como fonte oficial de atualização da interface. Solicitações ainda pendentes continuam em `solicitacoes`.

Operações cobertas:

- venda;
- pagamento/recebimento de parcela;
- ingresso;
- gasto;
- retirada;
- recolhimento;
- ajuste, regularização e estorno quando permitidos.

## Escopo de visibilidade

| Perfil | Dados recebidos em tempo real |
|---|---|
| Master Local | Todo o tenant |
| Gerente | Todo o tenant, conforme a matriz atual de acesso |
| Financeiro | Todo o tenant |
| Administrativo | Todo o tenant, somente nas telas autorizadas |
| Auditor | Todo o tenant em leitura |
| Supervisor | Somente equipes vinculadas ao usuário |
| Vendedor | Somente lançamentos próprios |

Nenhum dado de outro `clientePlataformaId` entra no cache do usuário.

## Arquitetura

O serviço `js/services/realtime-operations-service.js` mantém apenas dois fluxos lógicos:

1. `lancamentos_financeiros`: operações confirmadas;
2. `solicitacoes`: movimentações pendentes e seus estados.

Quando um lançamento novo ou alterado chega, o serviço busca somente os documentos relacionados necessários para atualizar a tela compatível, como venda, pagamento, parcela, cliente e caixa. Isso evita abrir listeners permanentes em todas as coleções.

Os caches e o `State` são atualizados e a interface recebe o evento:

```text
integro-operacoes-tempo-real-atualizadas
```

O Dashboard e o Financeiro recalculam a tela usando os caches, sem repetir uma consulta completa ao Firestore.

## Diagnóstico

No console autenticado:

```javascript
IntegroOperacoesTempoReal.diagnostic()
```

O retorno informa perfil, tenant, equipes, quantidade de listeners, partes ativas e último erro.

## Publicação necessária

O funcionamento completo depende da publicação conjunta de:

- Hosting;
- `firestore.rules`;
- `firestore.indexes.json`.

Enquanto as Rules e os índices novos não forem publicados, algumas consultas podem usar o fallback sem ordenação ou ser recusadas pelas regras antigas.
