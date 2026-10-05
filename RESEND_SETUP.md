# Resend no CR Recursos

Este projeto usa o Resend exclusivamente no backend para e-mails transacionais. A chave não deve ser adicionada ao frontend, a variáveis `NEXT_PUBLIC_*`, ao banco ou ao repositório.

## Arquitetura implementada

```text
evento de protocolo
  -> email_outbox (PostgreSQL)
  -> worker com lock SKIP LOCKED
  -> ResendEmailProvider
  -> provider_email_id salvo
  -> POST /api/webhooks/resend (corpo bruto + assinatura)
  -> status e histórico do processo atualizados
```

O fluxo SMTP/Nodemailer anterior está desativado. `backend/services/mailService.js` existe apenas como bloqueio explícito de compatibilidade e não envia mensagens. Todos os novos envios passam por `backend/services/emailService.js`.

## 1. Criar a conta

1. Acesse o [painel do Resend](https://resend.com/signup) e crie/acesse a conta da empresa.
2. Ative MFA na conta administrativa.
3. Não compartilhe a chave de API em conversas, tickets ou capturas de tela.

## 2. Adicionar o domínio ou subdomínio

No Resend, abra **Domains > Add Domain** e cadastre, preferencialmente, um subdomínio exclusivo, por exemplo `envios.crrecursos.com.br`. O remetente final poderá ser algo como `notificacoes@envios.crrecursos.com.br`.

Não use Gmail, Outlook ou Hotmail como remetente. O e-mail da Camila pode ser usado em `EMAIL_REPLY_TO` para receber as respostas.

## 3. Inserir os registros DNS

Copie para o provedor DNS **exatamente** os registros DKIM, SPF e MX mostrados pelo Resend. Não adapte nomes, destinos, prioridades ou valores e não crie registros com base em exemplos deste documento.

Se o DNS usa Cloudflare, confira no painel do Resend se cada registro deve permanecer como **DNS only**. A referência oficial é [Resend — Domains](https://resend.com/docs/dashboard/domains/introduction).

## 4. Verificar o domínio

Depois da propagação, use **Verify DNS Records** no Resend. Somente depois de o painel informar o domínio como verificado configure:

```env
EMAIL_DOMAIN_VERIFIED=true
```

Enquanto estiver pendente, mantenha `EMAIL_AUTOMATION_ENABLED=false`. A tela **Configurações > E-mails** mostrará “Domínio pendente de verificação”.

## 5. Criar a chave

Em **API Keys**, crie uma chave com permissão apenas de envio e, se a conta permitir, restrita ao domínio de envio. Salve-a uma única vez no gerenciador de secrets/arquivo `.env` da VPS:

```env
RESEND_API_KEY=re_...
```

Nunca grave a chave no Git. A aplicação apenas informa se ela está configurada e devolve uma máscara, nunca o valor.

## 6. Configurar as variáveis

No `.env` privado do backend/VPS:

```env
EMAIL_PROVIDER=resend
EMAIL_AUTOMATION_ENABLED=false
EMAIL_DOMAIN_VERIFIED=true

EMAIL_FROM_NAME=CR Recursos
EMAIL_FROM_ADDRESS=notificacoes@SUBDOMINIO-VERIFICADO
EMAIL_REPLY_TO=EMAIL-REAL-DA-CAMILA
EMAIL_TEST_RECIPIENT=DESTINATARIO-AUTORIZADO

RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...

APP_URL=https://hub.crrecursos.com.br
EMAIL_WORKER_ENABLED=true
EMAIL_WORKER_INTERVAL_MS=10000
EMAIL_BATCH_SIZE=10
EMAIL_MAX_ATTEMPTS=5
EMAIL_PROCESSING_TIMEOUT_MINUTES=10
```

Substitua os marcadores somente pelos valores reais do ambiente. Não use os textos de exemplo literalmente.

### Teste antes da verificação do domínio

Para um teste técnico limitado, mantenha a automação desligada e use temporariamente os endereços oficiais de teste:

```env
EMAIL_AUTOMATION_ENABLED=false
EMAIL_DOMAIN_VERIFIED=false
EMAIL_FROM_NAME=CR Recursos
EMAIL_FROM_ADDRESS=onboarding@resend.dev
EMAIL_TEST_RECIPIENT=delivered@resend.dev
```

Essa configuração aparece como “Somente testes” e não libera envio a clientes reais. Outros cenários oficiais disponíveis são `bounced@resend.dev`, `complained@resend.dev` e `suppressed@resend.dev`; consulte [Testing Resend emails](https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing).

## 7. Cadastrar o webhook

No Resend, crie um webhook HTTPS apontando para:

```text
https://api-hub.crrecursos.com.br/api/webhooks/resend
```

Assine pelo menos estes eventos:

- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.failed`
- `email.bounced`
- `email.complained`
- `email.suppressed`

Copie o signing secret fornecido pelo webhook para `RESEND_WEBHOOK_SECRET`. O endpoint valida os cabeçalhos Svix contra o corpo bruto; uma assinatura inválida não altera o banco.

## 8. Fazer o teste seguro

1. Execute a migration `gestao_14_email_outbox.sql`.
2. Reinicie o backend.
3. Entre como Master ou Administrativo.
4. Abra **Configurações > E-mails**.
5. Confirme o provedor, remetente, domínio, chave e webhook.
6. Clique em **Enviar e-mail de teste**. O destino é exclusivamente `EMAIL_TEST_RECIPIENT`.
7. Confirme o ID `email_...` no sistema e no painel do Resend.
8. Confirme que o webhook altera o registro de “Aceito pelo Resend” para “Entregue”.

“Aceito” não equivale a “entregue”; a confirmação de entrega vem do webhook.

## 9. Ativar os envios automáticos

Depois que o domínio, chave, remetente, reply-to e webhook estiverem validados:

```env
EMAIL_AUTOMATION_ENABLED=true
```

Reinicie o backend e faça um único teste controlado criando um protocolo com anexo para um cliente de teste autorizado. O gatilho atual é:

| Evento | Destinatário | Template | Momento | Idempotência |
|---|---|---|---|---|
| Protocolo com arquivo criado ou novo arquivo anexado | E-mail cadastrado do cliente do processo | `protocol_available` (HTML + texto e anexo) | Depois de o protocolo ser salvo | tenant + evento + processo + destinatário + versão do protocolo/arquivo |

Uma falha do e-mail não desfaz o protocolo. A tentativa fica visível na outbox e no histórico do processo.

## 10. Rollback

Para interromper imediatamente novos gatilhos sem perder histórico:

```env
EMAIL_AUTOMATION_ENABLED=false
EMAIL_WORKER_ENABLED=false
```

Reinicie o backend. Não remova tabelas nem registros: eles formam a trilha operacional. Não reative SMTP/Nodemailer em paralelo, pois isso elimina a proteção central contra duplicidade. Para reativar, corrija a causa, ligue primeiro o worker, valide o teste administrativo e só então ligue a automação.

## Operação e falhas

- Falhas temporárias de rede, HTTP 429 e 5xx recebem atraso progressivo e até cinco tentativas por padrão.
- Erros permanentes de configuração/validação não entram em repetição automática.
- Bounce, denúncia de spam e suppression bloqueiam novos envios ao mesmo endereço dentro do tenant.
- A proteção única no PostgreSQL e a idempotency key do Resend evitam duplicidade em clique duplo, reinício e concorrência entre workers.
- O histórico não armazena chave, corpo completo ou documentos pessoais nos eventos de auditoria.
