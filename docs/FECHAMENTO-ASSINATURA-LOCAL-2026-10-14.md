# Assinatura e bloqueio — validação local

Status: OK no backend/Rules testados; interface ponta a ponta: NÃO VALIDADO.

- Planos semanais e mensais; cobrança da plataforma separada do financeiro operacional.
- Cinco dias completos de tolerância; bloqueio no início do sexto dia após o vencimento (America/Sao_Paulo).
- Empresa bloqueada mantém identidade própria e acesso de responsáveis ao portal assinatura.html.
- Master Global confirma pagamento manualmente. Não há integração com gateway.
- Pagamentos e geração de faturas transacionais, idempotentes e isolados por empresa.
- Quitação remove bloqueio de assinatura; bloqueios administrativos independentes são preservados.
- Firestore/Storage impedem operação/anexos da empresa bloqueada. Functions operacionais validam empresa.
- Tenants legados sem documento de empresa mantêm compatibilidade.

Validações locais: 767 testes Node; 106 testes de Rules (incluindo empresas ativas e legado); 9 testes integrados de clientes e bloqueio; 14 verificações de Functions financeiras e 12 verificações de assinatura em emuladores.
HTML: 9 páginas; 93 scripts inline; sintaxe JavaScript e superfície pública verificadas.

Nenhum deploy, push, alteração remota de Rules ou migração de produção executado.
Próximo bloco: homologação autenticada das interfaces e regressão final por perfil.
