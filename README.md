<div align="center">
  <img src="public/logos/cr-recursos.png" alt="CR Recursos" width="220" />

  # HUB CR

  **Sistema de gestão da CR Recursos**

  Clientes, processos, prazos, equipe, vendas e financeiro em uma única plataforma.
</div>

---

## Sobre o projeto

O HUB CR é uma aplicação web multiempresa desenvolvida para apoiar a operação e a gestão da CR Recursos. O sistema reúne o atendimento dos clientes, o acompanhamento de processos e prazos, além do controle comercial e financeiro.

### Módulos

| Área | Recursos |
| --- | --- |
| Operação | Clientes, empresas, frota, leads, processos, deferidos, prazos e agenda |
| Gestão | Colaboradores, equipes, vendas, comissões, metas e financeiro |
| Documentos | Anexos, geração de documentos e exportação de relatórios |
| Segurança | Autenticação, perfis de acesso, isolamento por empresa e trilha de auditoria |

## Arquitetura

~~~text
Navegador → Next.js (interface e rotas web) → API Express → PostgreSQL
                                              └→ arquivos persistidos em volume
~~~

- **Frontend:** Next.js 16 e React 18.
- **API:** Node.js e Express.
- **Dados:** PostgreSQL 17, com migrations versionadas.
- **Produção:** frontend hospedado separadamente; API e banco executados em containers.

## Estrutura do repositório

~~~text
app/          interface e rotas Next.js
backend/      API Express, migrations, serviços e testes
docs/         documentação técnica
nginx/        configuração de proxy
ops/          scripts operacionais
public/       imagens e arquivos estáticos
~~~

## Desenvolvimento local

### Pré-requisitos

- Node.js 24.x e npm.
- PostgreSQL acessível pela máquina; o backend usa <code>DATABASE_URL</code>.

### Frontend

Na raiz do repositório, configure as variáveis locais a partir do exemplo. Ajuste a conexão do banco e gere um segredo JWT exclusivo para seu ambiente.

~~~powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
~~~

O frontend fica disponível em <code>http://localhost:3001</code>.

### API

Em outro terminal:

~~~powershell
Copy-Item backend/.env.example backend/.env
Set-Location backend
npm ci
npm run dev
~~~

A API fica disponível em <code>http://localhost:5000</code>. Configure <code>DATABASE_URL</code> e <code>JWT_SECRET</code> em <code>backend/.env</code> antes de iniciar.

## Configuração

Os arquivos <code>.env.example</code> contêm somente valores de exemplo. Nunca coloque credenciais reais neles. Para cada ambiente, configure os segredos fora do GitHub, no ambiente local ou no gerenciador de variáveis da hospedagem.

Variáveis principais:

| Variável | Uso |
| --- | --- |
| <code>DATABASE_URL</code> | Conexão com o PostgreSQL |
| <code>JWT_SECRET</code> | Assinatura dos tokens de autenticação |
| <code>FRONTEND_URL</code> | Origem autorizada para chamadas à API |
| <code>BACKEND_URL</code> / <code>NEXT_PUBLIC_BACKEND_URL</code> | Endereço da API usado pelo frontend |
| <code>RESEND_API_KEY</code> | Opcional: envio de e-mails transacionais |

## Testes e validação

~~~bash
npm run lint
npm run build
npm --prefix backend test
~~~

A suíte do backend cobre autorização, integração, isolamento por empresa, relatórios, e-mail e geração de documentos.

## Banco de dados

As migrations ficam em <code>backend/migrations/</code> e são versionadas junto com o código. Faça backup antes de qualquer operação de produção que altere o schema ou os dados.

## Segurança

- Arquivos <code>.env</code>, tokens, backups, bancos locais, uploads e saídas de build são ignorados pelo Git.
- O arquivo <code>.env.production.example</code> não é distribuído: configure produção diretamente no ambiente seguro de implantação.
- Assinaturas pessoais, modelos contratuais e scripts SQL de reparo específicos são ativos privados e devem ser fornecidos ao ambiente de execução por um canal seguro.
- Use senhas e segredos próprios por ambiente; nunca reutilize os exemplos locais em produção.
