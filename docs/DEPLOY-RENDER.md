# Deploy no Render: passo a passo

Guia para colocar a API e o banco no Render e o site no Cloudflare Pages, e começar a testar com dados reais.

```
Navegador ──► Cloudflare Pages (site + /api proxy) ──► Render: Web Service (API) ──► Render: Postgres
```

Nesta fase:
- **Vídeos:** continuam os atuais, hospedados no Firebase (`midiasave-5c064.web.app`). Ainda não há Cloudflare R2.
- **Planos de aula (PDF):** vêm dentro da imagem da API e só são entregues a quem tem acesso.
- **Capas e PDFs enviados pelo painel:** ficam num disco do Render.

Ordem: **1. Postgres → 2. Web Service → 3. Primeiro acesso (Shell) → 4. Cloudflare Pages → 5. Teste**.

---

## Antes de começar

Tenha em mãos:

1. **O código no GitHub.** O Render lê o repositório `triicker/formacaprof`. Use o branch `plataforma-etapas`, ou a `main`/`master` depois do merge.
2. **Uma conta SMTP para enviar e-mails.** Os convites e a recuperação de senha dependem dela, e a API **não sobe** em produção sem SMTP. Opções:
   - **Brevo** (plano gratuito): `smtp-relay.brevo.com`, porta `587`. O usuário e a senha ficam em "SMTP & API".
   - **Gmail** com senha de app: `smtp.gmail.com`, porta `587`. O usuário é o e-mail; a senha é a de app gerada na conta Google, com verificação em duas etapas ativa.
   - **Resend**: `smtp.resend.com`, porta `587`. O usuário é `resend` e a senha é a API key. Exige um domínio verificado.
3. **Um segredo para o proxy (`PROXY_SECRET`).** Gere no seu computador:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   Guarde o valor. Ele vai no Render e no Cloudflare.
4. **O endereço do site no Pages,** por exemplo `https://formacaprof.pages.dev`.

**Planos:** o Shell, o pre-deploy e o disco persistente **não existem no plano Free** do Render. Para testar de verdade, use **Starter** no Web Service e **Basic** no Postgres. O Postgres Free expira depois de 30 dias.

---

## 1. Criar o banco: New → **Postgres**

| Campo | Valor |
|---|---|
| Name | `formacaprof-db` |
| Database | `formacaprof` |
| User | `formacaprof` |
| Region | escolha uma e **use a mesma no Web Service** (ex.: *Virginia (US East)*) |
| PostgreSQL Version | **17** |
| Plan | Basic (ex.: `basic-256mb`) |

Clique em **Create Database** e espere o status ficar *Available*.

Na página do banco, em **Connections**, copie a **Internal Database URL**: ela começa com `postgresql://` e o host não tem `.render.com`. É a rede privada entre os serviços.

> Não é preciso liberar acesso externo (*Access Control*). A API conecta pela rede interna. As migrations e os seeds rodam pelo Shell do próprio serviço.

---

## 2. Criar a API: New → **Web Service**

### 2.1 Origem e build

1. Em **Git Provider**, escolha o repositório `triicker/formacaprof`.
2. Preencha:

| Campo | Valor |
|---|---|
| Name | `formacaprof-api` (vira `https://formacaprof-api.onrender.com`) |
| Branch | `plataforma-etapas` (ou a principal depois do merge) |
| Region | **a mesma do banco** |
| Root Directory | `backend` |
| Language / Runtime | **Docker** |
| Dockerfile Path | `./Dockerfile` (o painel mostra como `backend/ ./Dockerfile`) |
| Docker Build Context Directory | `.` (aparece como `backend/ .`) |
| Instance Type | Starter |

### 2.2 Variáveis de ambiente (Environment Variables)

| Chave | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | a **Internal Database URL** do passo 1 |
| `APP_URL` | URL do site, ex. `https://formacaprof.pages.dev` (com `https`, sem barra final) |
| `TRUST_PROXY` | `2` |
| `PROXY_SECRET` | o segredo gerado em "Antes de começar" |
| `SWAGGER_ENABLED` | `false` |
| `MAIL_DRIVER` | `smtp` |
| `MAIL_FROM` | ex. `Formação para Professores <nao-responda@seudominio.com.br>` (remetente aceito pelo seu SMTP) |
| `SMTP_HOST` | ex. `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | usuário do SMTP |
| `SMTP_PASS` | senha/chave do SMTP |
| `MEDIA_MAX_IMAGE_MB` | `5` |
| `MEDIA_MAX_PDF_MB` | `25` |
| `MEDIA_MAX_VIDEO_MB` | `0` (os vídeos são cadastrados por URL, não enviados) |

Pontos de atenção:
- **Não** defina `PORT`: o Render injeta a dele e a API usa essa.
- **Não** defina `COOKIE_SECURE`: em produção ele já é `true`.
- Se o site também for usado num domínio próprio, adicione `APP_ORIGINS` com as duas origens separadas por vírgula. Exemplo: `https://formacaprof.pages.dev,https://formacao.eticaeditora.com.br`.

### 2.3 Advanced

| Campo | Valor |
|---|---|
| Health Check Path | `/api/v1/health` |
| Pre-Deploy Command | `npx prisma migrate deploy` |
| Auto-Deploy | *On Commit* (opcional) |

O **Pre-Deploy** aplica as migrations versionadas no banco **antes** de cada versão nova entrar no ar. Nunca use `prisma db push` nem `migrate reset` em produção.

### 2.4 Disco persistente (Advanced → **Add Disk**)

| Campo | Valor |
|---|---|
| Name | `formacaprof-uploads` |
| Mount Path | `/app/storage/uploads` |
| Size | `1` GB |

O disco guarda só o que é enviado pelo painel (capas, PDFs). Sem ele, esses arquivos somem a cada deploy. Os planos de aula que já vêm na imagem (`storage/basta`) não são afetados.

Clique em **Create Web Service**. O primeiro build leva alguns minutos. Quando o log mostrar a API ouvindo e o status ficar *Live*, teste:

```
https://formacaprof-api.onrender.com/api/v1/health
```

A resposta esperada é `{"status":"ok"}`, o que confirma que a API subiu e alcança o banco. Qualquer outra rota chamada diretamente, como `/api/v1/auth/me`, responde **403**. Isso é o esperado: com `PROXY_SECRET`, a API só aceita chamadas que passam pelo proxy do Pages. Se aparecer erro de configuração no log, veja **Problemas comuns** no fim.

---

## 3. Primeiro acesso: aba **Shell** do Web Service

Rode, um por vez:

```bash
# 1) Cria o primeiro administrador geral. Recusa se já existir um.
ADMIN_EMAIL=seu-email@eticaeditora.com.br ADMIN_NAME="Administração Ética" ADMIN_PASSWORD='uma-senha-forte-de-12+' npm run admin:bootstrap

# 2) Carrega o catálogo: coleção BASTA, módulos, aulas, vídeos atuais do Firebase e planos de aula.
npm run seed:content
```

- O `seed:content` só **cria o que falta**. Pode ser rodado de novo sem apagar nem sobrescrever nada.
- A senha do administrador fica só como hash no banco. Ela não é salva em outro lugar e não aparece em log.
- **Não rode `npm run seed:dev`** em produção. Ele cria usuários de demonstração e é bloqueado fora de desenvolvimento.

---

## 4. Ligar o site: **Cloudflare Pages**

No projeto Pages, em **Settings → Variables and Secrets** (ambiente *Production*):

| Variável | Valor | Tipo |
|---|---|---|
| `VITE_API_MODE` | `http` | Text |
| `API_ORIGIN` | `https://formacaprof-api.onrender.com` (sem barra final) | Text |
| `PROXY_SECRET` | **o mesmo** valor do Render | **Secret** |

Depois, em **Deployments**, faça um novo deploy (*Retry deployment*, ou um push no branch do Pages). O `VITE_API_MODE` é lido no build, então sem um build novo o site continua no modo demonstração.

Para conferir, abra no navegador:
- `https://formacaprof.pages.dev/api/v1/health` deve responder `{"status":"ok"}`. Isso prova que o proxy chega à API.
- `https://formacaprof.pages.dev/api/v1/auth/me` deve responder **401** ("Sessão expirada…"), e não 403. Isso prova que o `PROXY_SECRET` é igual nos dois lados.

> O proxy (`functions/api/[[path]].js`) só funciona num projeto do tipo **Pages**. Num projeto *Worker*, a pasta `functions/` é ignorada.

---

## 5. Roteiro de teste com dados reais

1. Entre em `https://formacaprof.pages.dev/login` com o administrador do passo 3. Pelo menu do usuário, abra **Painel administrativo** (`/admin`).
2. **Coleções:** confira se a coleção BASTA está *Publicada*. Use **Pré-visualizar** para ver as aulas e os vídeos.
3. **Instituições → Nova instituição:** crie uma escola de teste.
4. Na escola, aba **Coleções**: **libere** a BASTA (a validade é opcional).
5. Na escola, aba **Coordenação**: **convide** um e-mail seu. O e-mail precisa chegar; se não chegar, confira o SMTP.
6. Abra o link do convite numa janela anônima, crie a senha e entre. Pelo menu, abra **Painel da coordenação** (`/coordenacao`).
7. Na coordenação, em **Professores**, convide outro e-mail como professor. Aceite o convite e, de volta à coordenação, use **Matricular** na BASTA.
8. Como professor: assista e conclua as aulas, depois gere o **certificado**.
9. Como coordenação, em **Relatórios**: confira o progresso e use **Exportar CSV**.
10. Como administrador, em **Auditoria**: devem aparecer os convites, a liberação, a matrícula, a conclusão e a exportação.

---

## Atualizações depois do primeiro deploy

- **Código novo:** faça push no branch configurado. Com *Auto-Deploy*, o Render faz build, roda as migrations (pre-deploy) e troca a versão.
- **Trocar os vídeos pelos definitivos:**
  1. Painel → **Biblioteca de mídia** → *Registrar vídeo externo* (URL `https` e duração).
  2. Painel → **Coleções → BASTA → Módulos e aulas** → editar a aula → escolher a mídia nova.

  Não é preciso mexer em código nem em banco. O progresso e os certificados de quem já concluiu ficam preservados.
- **Backups:** o Postgres pago do Render tem backups automáticos (*Recovery*). Antes de mudanças grandes, gere um export manual na página do banco.

---

## Problemas comuns

| Sintoma | Causa e correção |
|---|---|
| Deploy falha com `APP_URL deve usar https` | `APP_URL` sem `https://` |
| `Em staging/produção, MAIL_DRIVER deve ser "smtp"` ou `SMTP_HOST é obrigatório` | Faltam variáveis do SMTP (passo 2.2) |
| `PROXY_SECRET deve ter pelo menos 32 caracteres` | Gere de novo com o comando de "Antes de começar" |
| Site em `/api/...` responde `503 API não configurada` | Falta `API_ORIGIN` no Pages, ou o deploy do Pages não foi refeito |
| Site em `/api/...` responde `403` | `PROXY_SECRET` diferente entre Render e Pages |
| Login ou qualquer ação responde "Requisição bloqueada pela proteção CSRF" | O endereço aberto no navegador não está em `APP_URL`/`APP_ORIGINS` (ex.: domínio próprio ou URL de preview do Pages). Adicione-o em `APP_ORIGINS` |
| Upload de capa/PDF falha com erro de permissão | O disco do passo 2.4 não está montado em `/app/storage/uploads`, ou o usuário `node` da imagem não tem escrita nele. Confira o *Mount Path*. Se persistir, peça o ajuste do Dockerfile |
| Convite criado, mas o e-mail não chega | Remetente (`MAIL_FROM`) não autorizado no provedor SMTP. O painel mostra o convite como pendente e permite **Reenviar** |
| Primeiro acesso depois de um tempo parado fica lento | Só no plano Free (o serviço "dorme"). No Starter isso não acontece |

## Alternativa: Blueprint

Em vez dos passos 1 e 2 manuais, **New → Blueprint** lê o `render.yaml` da raiz do repositório e cria o banco, a API, as variáveis fixas e o disco de uma vez. Ainda é preciso preencher, no painel:
- `APP_URL`;
- `MAIL_FROM`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`.

O `PROXY_SECRET` é gerado pelo Render; copie o valor para o Pages. Os passos 3 a 5 são os mesmos. Para homologação há `deploy/render.staging.yaml`.
