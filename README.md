<div align="center">
  <img src="public/logos/cr-recursos.png" alt="CR Recursos" width="200" />

  # HUB CR

  **Plataforma de gestão da CR Recursos**

  Operação, relacionamento com clientes e gestão comercial em um só sistema.
</div>

---

## Sobre o projeto

O HUB CR é uma aplicação web multiempresa que organiza processos operacionais e administrativos da CR Recursos. A plataforma reúne informações de clientes e empresas, acompanhamento de demandas e prazos, além de ferramentas para apoiar equipes, vendas e financeiro.

## Funcionalidades

| Área | Recursos |
| --- | --- |
| Operação | Clientes, empresas, frota, processos, deferidos, prazos e agenda |
| Comercial | Leads, contratos, vendas, comissões e metas |
| Gestão | Colaboradores, equipes, indicadores e financeiro |
| Documentos e relatórios | Anexos, geração de documentos e exportação de relatórios |
| Administração | Perfis de acesso, isolamento por empresa e trilha de auditoria |

A API aplica o contexto da empresa nas operações para separar os dados de cada tenant. Recursos como autenticação, limites de requisição e validação de entrada apoiam o uso seguro dos módulos.

## Arquitetura e tecnologias

~~~text
Navegador → Next.js / React → API REST em Node.js / Express → PostgreSQL
                                               └────────────→ arquivos persistidos
~~~

- **Frontend:** Next.js 16, React 18 e JavaScript.
- **Backend:** Node.js, Express e API REST.
- **Banco de dados:** PostgreSQL 17, com migrations SQL versionadas.
- **Documentos e relatórios:** geração de arquivos e envio de e-mails transacionais.

## Estrutura do repositório

~~~text
app/          Interface e rotas Next.js
backend/      API Express, migrations, serviços e testes
docs/         Documentação técnica
nginx/        Configuração de proxy
ops/          Scripts operacionais
public/       Imagens e arquivos estáticos
~~~

## Executar localmente

### Requisitos

- Node.js 24.x e npm.
- PostgreSQL acessível pela máquina.

### Frontend

Na raiz do projeto, prepare as variáveis locais e instale as dependências:

~~~powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
~~~

O frontend fica disponível em http://localhost:3001. Ajuste as URLs e segredos de desenvolvimento em .env.local.

### API

Em outro terminal:

~~~powershell
Copy-Item backend/.env.example backend/.env
Set-Location backend
npm ci
npm run dev
~~~

A API inicia em http://localhost:5000. Configure DATABASE_URL e JWT_SECRET em backend/.env antes de iniciar. As migrations versionadas estão em backend/migrations/.

## Variáveis de ambiente

Os arquivos de exemplo usam valores locais fictícios. Ajuste-os apenas nos arquivos locais ou no ambiente seguro da hospedagem.

| Variável | Onde | Finalidade |
| --- | --- | --- |
| DATABASE_URL | Backend | Conexão com PostgreSQL |
| JWT_SECRET | Backend | Assinatura dos tokens de autenticação |
| FRONTEND_URL | Backend | Origem autorizada para CORS |
| BACKEND_URL | Frontend | Destino do proxy de API do Next.js |
| RESEND_API_KEY | Backend | Opcional: envio de e-mails |

## Validação

~~~bash
npm run lint
npm run build
npm --prefix backend test
~~~

A suíte da API inclui testes de autorização, integração, isolamento entre empresas, relatórios, e-mail e geração de documentos.

## Segurança

Não publique credenciais, tokens ou arquivos de ambiente. Use segredos próprios por ambiente e faça backup antes de operações que alterem o banco de dados.
