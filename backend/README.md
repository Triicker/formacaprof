# API — Formação para Professores

API da plataforma, em NestJS 11 + Prisma 6 + PostgreSQL 17. Ela cuida de:
- autenticação, instituições, vínculos e convites (Etapa 2);
- catálogo de coleções, direito institucional, matrículas, progresso e certificados (Etapa 3).
O frontend React (raiz do repositório) a consome pelo caminho `/api/v1`, **no mesmo domínio do site**.

```
Navegador ──► Cloudflare Pages (React + functions/api/[[path]].js) ──► Render (esta API) ──► PostgreSQL (Render)
              mesmo domínio: cookie de sessão first-party           X-Proxy-Secret        rede privada
```

## Rodar localmente

Não é preciso Docker. O `npm run db:local` sobe um PostgreSQL 17 real com os binários oficiais, via `embedded-postgres`.

```bash
cd backend
npm install
cp .env.example .env            # DATABASE_URL já aponta para localhost:5433
npm run db:local                # terminal 1: PostgreSQL local (deixe rodando)
npx prisma migrate deploy       # aplica as migrations
npm run build
npm run seed:dev                # usuários + catálogo + BASTA liberado/matrículas (bloqueado fora de development/test)
npm run start:local             # API em http://localhost:3000 — docs em /api/docs
```

No frontend, rode `VITE_API_MODE=http npm run dev`. O Vite encaminha `/api` para `localhost:3000`.

Usuários do seed (senha `professor123`, ou o valor de `DEMO_PASSWORD`):

| E-mail | Perfil |
|---|---|
| `admin@etica.dev` | administrador geral |
| `coordenacao@etica.dev` | coordenadora da EM Carolina de Jesus |
| `ana@etica.com` | professora da EM Carolina de Jesus |
| `bruno@etica.dev` | professor da EE Machado de Assis (escola sem direito ao BASTA) |

No seed, a EM Carolina de Jesus tem direito ao BASTA, e Ana e a coordenação estão matriculadas. Ana começa com 12 de 32 aulas concluídas, como na demonstração.

Com `MAIL_DRIVER=log`, os links de convite e de redefinição de senha aparecem no console da API.

## Testes

```bash
npm test
```

São 98 testes: unitários e de integração HTTP, todos contra um **PostgreSQL real e descartável**.

- O `test/global-setup.ts` sobe um cluster em diretório temporário e porta livre e aplica as migrations do zero.
- Isso prova que as migrations são reproduzíveis em um banco vazio.
- Um teste também confirma que o `schema.prisma` não diverge das migrations.

| Arquivo | Cobre |
|---|---|
| `auth.e2e-spec.ts` | login válido/inválido, mensagem genérica, bloqueio por tentativas, conta desativada, logout com revogação, cookie reutilizado, sessão expirada, CSRF (cabeçalho e Origin), recuperação/redefinição de senha (uso único, expiração, revogação de sessões), segredo do proxy |
| `authorization.e2e-spec.ts` | professor em endpoint de coordenador/admin, usuário sem instituição, coordenador em outra instituição (inclusive trocando o id na URL), tentativa de redirecionar convite pelo corpo, elevação do próprio papel, desativação de vínculo com efeito imediato, instituição inativa, admin sem acesso a hashes/tokens |
| `invitations.e2e-spec.ts` | fluxo completo admin → coordenador → professor, convite expirado/revogado/reutilizado, aceites simultâneos, token adulterado, papel/instituição vindos só do convite, convite substituído, conta existente em segunda instituição, duplicidade de e-mail e de vínculo |
| `catalog.e2e-spec.ts` | Etapa 3: estados dos cards, instituição com e sem direito, professor matriculado e não matriculado, coordenador tentando liberar coleção não contratada, aula/mídia/PDF por URL direta, progresso em matrícula alheia ou com aula de outra coleção, percentual enviado pelo cliente, coordenador em matrícula de outra escola, despublicação, arquivamento, suspensão/revogação/expiração do direito, matrícula revogada, vínculo desativado, certificado antes/depois da conclusão, verificação pública, feedback, contexto com duas instituições, seed idempotente |
| `unit.spec.ts` | validação de configuração de produção, tokens, `AccessPolicy`, drift entre schema e migrations |

## Modelo de dados

```mermaid
erDiagram
  organizations ||--o{ institutions : "agrupa (opcional)"
  institutions ||--o{ memberships : tem
  users ||--o{ memberships : tem
  users ||--o{ platform_roles : "papel global"
  institutions ||--o{ invitations : recebe
  users ||--o{ invitations : "cria / aceita"
  users ||--o{ sessions : abre
  users ||--o{ password_reset_tokens : solicita
  users ||--o{ audit_logs : executa
  institutions ||--o{ audit_logs : contexto

  organizations { uuid id PK; text name; text slug UK; enum status }
  institutions { uuid id PK; uuid organization_id FK; text name; text slug UK; text external_id UK; text region; text city; char2 state; enum status }
  users { uuid id PK; text name; text email UK "minúsculo (CHECK)"; text password_hash "Argon2id"; enum status; ts email_verified_at; ts last_login_at; ts welcome_seen_at; int failed_login_count; ts locked_until }
  memberships { uuid id PK; uuid user_id FK; uuid institution_id FK; enum role "professor|coordinator"; enum status; uk user_institution "UNIQUE(user_id, institution_id)" }
  platform_roles { uuid id PK; uuid user_id FK; enum role "platform_admin"; uuid granted_by FK }
  invitations { uuid id PK; uuid institution_id FK; text email; enum role; char64 token_hash UK; uuid created_by FK; ts expires_at; ts accepted_at; ts revoked_at }
  sessions { uuid id PK; uuid user_id FK; char64 token_hash UK; ts expires_at; ts revoked_at; ts last_used_at }
  password_reset_tokens { uuid id PK; uuid user_id FK; char64 token_hash UK; ts expires_at; ts used_at }
  audit_logs { uuid id PK; uuid actor_user_id FK; uuid institution_id FK; text action; text entity_type; text entity_id; jsonb metadata }
```

Migration: `prisma/migrations/20261016173741_init`. Além das tabelas, chaves, índices e FKs, ela cria estes CHECKs:
- e-mail normalizado (em `users` e `invitations`);
- UF com 2 letras maiúsculas;
- formato de slug;
- convite não pode estar aceito e revogado ao mesmo tempo;
- contador de falhas de login não negativo.

## Endpoints (`/api/v1`)

A documentação OpenAPI fica em `/api/docs` e `/api/docs/openapi.json`. Ela é desligada em produção por padrão.
Toda escrita exige o cabeçalho `X-CSRF-Protection: 1`; o Swagger UI já o envia.

| Método | Rota | Quem pode |
|---|---|---|
| POST | `/auth/login` | público (10/min por IP + bloqueio da conta após 5 falhas) |
| POST | `/auth/logout` | autenticado |
| GET | `/auth/me` | autenticado |
| POST | `/auth/forgot-password` | público (5 a cada 15 min) |
| POST | `/auth/reset-password` | público, com token |
| GET / PATCH | `/users/me` | autenticado (PATCH: só `name` e `welcomeSeen`) |
| GET | `/users` · PATCH `/users/:id` (status) | administrador geral |
| GET / POST | `/organizations` | administrador geral |
| GET | `/institutions` | admin: todas; demais: as próprias |
| POST | `/institutions` · PATCH `/institutions/:id` | administrador geral |
| GET | `/institutions/:id` | admin ou membro ativo |
| GET | `/institutions/:id/members` | admin ou coordenador da instituição |
| PATCH | `/institutions/:id/members/:membershipId` | admin; coordenador só ativa/desativa **professores** da própria escola |
| POST / GET | `/institutions/:id/invitations` | admin (professor/coordenador); coordenador (só professor, só a própria escola) |
| DELETE | `/institutions/:id/invitations/:invitationId` | idem acima |
| POST | `/invitations/preview` | público, com token |
| POST | `/invitations/accept` | público, com token; cria conta/vínculo/sessão |
| GET | `/audit-logs` | administrador geral |
| GET | `/health` | público (health check do Render) |

Não existe endpoint que conceda o papel `platform_admin`. Ele só é concedido pelo script de bootstrap.

## Etapa 3: catálogo, direito institucional, matrículas e progresso

Migration: `prisma/migrations/20261016181312_catalog_access_progress`.

```mermaid
erDiagram
  media_assets ||--o{ collections : "capa/miniatura"
  media_assets ||--o{ lessons : "mídia/miniatura"
  collections ||--o{ modules : tem
  modules ||--o{ lessons : tem
  institutions ||--o{ institution_collection_access : "direito (só admin concede)"
  collections ||--o{ institution_collection_access : ""
  memberships ||--o{ enrollments : "FK composta (user_id, institution_id)"
  collections ||--o{ enrollments : ""
  enrollments ||--o{ lesson_progress : ""
  lessons ||--o{ lesson_progress : ""
  enrollments ||--o{ feedbacks : ""
  enrollments ||--o| certificates : ""

  media_assets { uuid id PK; text key UK "id estável p/ seed"; enum storage_provider "static|external|local"; text storage_key; text external_url "https"; enum visibility "public|protected"; jsonb metadata }
  collections { uuid id PK; text slug UK; text title; enum status "draft|published|archived"; int display_order; jsonb theme_config }
  modules { uuid id PK; uuid collection_id FK; text slug; enum kind "presentation|curriculum"; enum status; uk collection_slug }
  lessons { uuid id PK; uuid module_id FK; text slug "ids das rotas antigas"; enum lesson_type "video|reading|document|activity"; int duration_seconds; bool required_for_completion; enum status; jsonb metadata "editorial: placeholder" }
  institution_collection_access { uuid id PK; enum status "active|suspended|revoked"; ts expires_at; ts revoked_at; uk institution_collection }
  enrollments { uuid id PK; uuid institution_id; uuid user_id; uuid collection_id; enum status "active|revoked"; ts completed_at; uk institution_user_collection }
  lesson_progress { uuid id PK; enum status "in_progress|completed"; int watched_seconds; enum completion_source "manual|player"; bool liked; uk enrollment_lesson }
  certificates { uuid id PK; uuid enrollment_id UK; text verification_code UK; jsonb metadata "retrato na emissão" }
```

A migration também cria CHECKs de integridade:
- formatos de slug;
- duração positiva e `watched_seconds` não negativo;
- `completed` se e somente se `completed_at` estiver preenchido;
- `revoked` se e somente se `revoked_at` estiver preenchido;
- notas de feedback entre 1 e 5;
- mídia externa só por `https`; mídia estática sempre pública; `storage_key` sem `..`.

**Regra de acesso de quem estuda.** Exige as quatro condições ao mesmo tempo, conferidas em `src/entitlements/entitlements.service.ts`:
1. coleção `published`;
2. direito institucional `active` e não expirado;
3. vínculo ativo com a instituição;
4. matrícula `active`.

O coordenador com direito institucional ativo e o administrador geral podem **ver** o conteúdo para acompanhar a formação. Registrar progresso exige matrícula.

**Estado dos cards (`GET /me/collections`).** É calculado no servidor:
- `coming_soon`: coleção não publicada;
- `locked`: com `reason` e `message`, e para coordenadores `institution.hasAccess`/`canEnroll`;
- `available`: com `progress`.

**Regra de conclusão.** É híbrida e calculada só no servidor:
- Contam as aulas `required_for_completion` publicadas, em módulos publicados.
- A aula fica concluída pelo botão "marcar como assistida" (`source: manual`) ou pelo fim do vídeo (`source: player`).
- O cliente envia apenas fatos (`completed`, `watchedSeconds`, `liked`). Percentuais e totais são rejeitados (`forbidNonWhitelisted`).
- `watchedSeconds` é limitado à duração da aula e nunca regride.
- `enrollments.completed_at` acompanha a regra.

**Certificado.** `POST /me/enrollments/:id/certificate` só emite se, no momento da chamada, houver acesso efetivo e a regra de conclusão estiver satisfeita. A chamada é idempotente. O código (`FP-XXXX-XXXX`) pode ser verificado publicamente em `GET /certificates/verify/:code`, sem expor e-mail.

**Mídias.** O banco guarda só referências.
- Capas e miniaturas: `static`/`public`, URL direta.
- Vídeos: `external`. A API entrega `/api/v1/media/:id`, que confere a permissão e redireciona (302) para o arquivo externo.
- PDFs: `local`, em `storage/`, entregues pela própria API após a autorização.
- Respostas da API nunca trazem o link externo dos vídeos.

**Conteúdo do BASTA** (`content/catalog.json`, gerado do antigo `src/mock/seed.js`):
- 10 coleções: BASTA publicada, as demais em rascunho ("Em breve").
- BASTA tem 5 módulos: "Conheça o projeto" (10 vídeos, não obrigatórios) e 4 níveis de ensino com 8 capítulos obrigatórios e um plano de aula cada.
- **Os 32 capítulos reaproveitam os vídeos de apresentação e os planos de aula são PDFs de exemplo.** Ficam marcados com `metadata.editorial = "placeholder"`, e a tela mostra "Vídeo provisório" e "(versão provisória)". Não são aulas definitivas.

```bash
npm run seed:content              # importa o catálogo: só cria o que falta (seguro em produção; nunca apaga/sobrescreve)
npm run seed:content -- --update  # também atualiza itens existentes com o conteúdo do arquivo
```

### Endpoints da Etapa 3 (`/api/v1`)

| Método | Rota | Quem pode |
|---|---|---|
| GET | `/collections` · `/collections/:slug` | autenticado (vitrine; sem links de mídia protegida) |
| GET | `/collections/:slug/modules` · `/modules/:id/lessons` · `/lessons/:id` | acesso efetivo (ou coordenador com direito / admin) |
| GET | `/media/:id` | público: autenticado; protegido: quem pode ver uma aula que usa a mídia |
| GET | `/platform/welcome-video` | autenticado |
| GET | `/me/collections?institutionId=` | autenticado (contexto obrigatório com mais de um vínculo) |
| GET | `/me/enrollments` · `/me/enrollments/:id/progress` | dono da matrícula |
| PUT | `/me/lessons/:id/progress` | dono de matrícula ativa na coleção da aula |
| POST | `/me/enrollments/:id/feedback` | dono, com acesso efetivo |
| POST | `/me/enrollments/:id/certificate` · GET `/me/certificates[/:id]` | dono |
| GET | `/certificates/verify/:code` | público (30/min) |
| GET | `/institutions/:id/collections` | coordenador da instituição / admin |
| GET | `/institutions/:id/collections/:collectionId/enrollments` | idem (individual + consolidado) |
| POST | `/institutions/:id/enrollments` · PATCH `/institutions/:id/enrollments/:enrollmentId` | idem; exige direito institucional ativo |
| GET | `/institutions/:id/enrollments/:enrollmentId/progress` | idem (aulas pendentes) |
| POST | `/institutions/:id/collections/:collectionId/access-requests` | coordenador: **pede** liberação (auditoria), não concede |
| GET / PATCH | `/admin/collections[/:id]` | administrador geral (publicar/despublicar/arquivar) |
| GET | `/admin/institutions/:id/collection-access` | administrador geral |
| PUT | `/admin/institutions/:id/collections/:collectionId/access` | administrador geral (`active`/`suspended`/`revoked`, `expiresAt`) |

## Etapa 4: painéis de administração e coordenação

Interfaces em `/admin` (só administrador geral) e `/coordenacao` (vínculo ativo de coordenação; com mais de um, o topo mostra um seletor de instituição). A checagem de papel no React só organiza a interface: cada chamada é autorizada no backend.

### Regras importantes

- **Versionamento curricular:** certificados são retratos imutáveis. Uma matrícula com certificado válido mantém `completedAt` mesmo que a coleção ganhe aulas obrigatórias novas. Alterações que afetam pessoas matriculadas (despublicar, arquivar, mudar aula obrigatória, suspender ou revogar acesso com matrículas ativas) retornam `409 IMPACT_CONFIRMATION_REQUIRED` com o objeto `impact`. Para prosseguir, a chamada é repetida com `confirmImpact: true` e `justification`.
- **Auditoria somente-inclusão:** o trigger `audit_logs_append_only` bloqueia `UPDATE` e `DELETE` em `audit_logs`, inclusive para o próprio usuário da aplicação. Usuários e instituições nunca são apagados, só desativados.
- **Correções de progresso:** só o administrador geral faz, por aula, com justificativa obrigatória. A origem fica como `admin_correction` e a auditoria guarda o antes e o depois. O percentual é sempre recalculado pelo servidor.
- **Papel global:** conceder ou remover administrador geral exige a senha atual de quem faz e uma justificativa. Não é possível remover o próprio papel nem o último administrador.
- **Mídia:**
  - Os uploads são validados pelo conteúdo real do arquivo (magic bytes), não pela extensão: PNG, JPEG, WebP, PDF, MP4 e WebM. SVG é recusado.
  - Os arquivos são gravados em `STORAGE_DIR/uploads/AAAA/MM/<uuid>` e servidos por `/api/v1/media/:id`, com autorização.
  - Vídeos são registrados como **URL externa**. O upload de vídeo pela API vem desligado (`MEDIA_MAX_VIDEO_MB=0`), e o upload direto para R2 (`POST /admin/media/direct-upload`) responde 501 até ser configurado.
  - Uma mídia em uso não pode ser excluída. "Substituir" mantém o histórico nos metadados.
- **CSV:** sai com BOM UTF-8 e CRLF (abre direto no Excel). Células que começam com `= + - @` recebem `'` para evitar injeção de fórmula. O limite é de 50 mil linhas, e cada exportação gera `report.exported` na auditoria.

### Endpoints da Etapa 4 (`/api/v1`)

| Área | Endpoints |
|---|---|
| Painel | `GET /admin/dashboard` (`institutionId`, `from`, `to`) |
| Instituições | `GET /admin/institutions`, `GET /admin/institutions/:id`, `POST /admin/institutions/:id/coordinators`, `GET /admin/coordinators`, `GET /admin/invitations`, `POST /institutions/:id/invitations/:invitationId/resend` |
| Usuários | `GET /users`, `GET/PATCH /users/:id`, `POST /users/:id/sessions/revoke`, `PUT /users/:id/platform-role` |
| Coleções | `GET/POST /admin/collections`, `GET/PATCH /admin/collections/:id`, `GET /admin/collections/:id/impact` |
| Módulos e aulas | `POST /admin/collections/:id/modules`, `PUT /admin/collections/:id/modules/order`, `PATCH/DELETE /admin/modules/:id`, `POST /admin/modules/:id/lessons`, `PUT /admin/modules/:id/lessons/order`, `PATCH/DELETE /admin/lessons/:id` |
| Mídia | `GET /admin/media`, `POST /admin/media/upload` (multipart), `POST /admin/media/external`, `POST /admin/media/direct-upload` (501), `PATCH/DELETE /admin/media/:id`, `POST /admin/media/:id/replace` |
| Liberação | `GET /admin/institutions/:id/collection-access`, `PUT /admin/institutions/:id/collections/:collectionId/access` (`status`, `expiresAt`, `justification`, `confirmImpact`) |
| Relatórios (admin) | `GET /admin/reports/enrollments` (`format=csv`), `GET /admin/reports/certificates`, `GET /admin/reports/participation` |
| Matrículas (admin) | `GET /admin/enrollments/:id`, `POST /admin/enrollments/:id/progress-corrections`, `POST /admin/certificates/:id/revoke` |
| Coordenação | `GET /institutions/:id/dashboard`, `GET /institutions/:id/teachers`, `GET /institutions/:id/reports/{enrollments,certificates,participation}` (+ os endpoints de matrícula da Etapa 3) |
| Auditoria | `GET /audit-logs` (`action`, `actionPrefix`, `institutionId`, `actorUserId`, `entityType`, `entityId`, `subjectUserId`, `from`, `to`, paginação) |

Listas paginadas aceitam `page`, `pageSize` (até 100) e devolvem `{ items, total, page, pageSize, pages }`.

### Migrations da Etapa 4

- `20261016194850_audit_append_only_and_corrections`: adiciona `admin_correction` ao enum `completion_source` e cria o trigger somente-inclusão em `audit_logs`.

### Variáveis novas

| Variável | Padrão | Uso |
|---|---|---|
| `STORAGE_DIR` | `./storage` | raiz dos arquivos locais. Os uploads vão para `uploads/`. No Render, um disco persistente montado em `/app/storage/uploads` (já no `render.yaml`) |
| `MEDIA_MAX_IMAGE_MB` | `5` | limite de imagem |
| `MEDIA_MAX_PDF_MB` | `25` | limite de PDF |
| `MEDIA_MAX_VIDEO_MB` | `0` | `0` desliga upload de vídeo pela API |
| `MEDIA_DIRECT_UPLOAD` | `none` | `r2` reservado para upload direto (ainda não implementado) |

### Como usar o painel administrativo

1. **Instituições → Nova instituição.** Depois, em "Coordenação", convide a coordenação por e-mail ou vincule uma pessoa já cadastrada.
2. **Instituição → Coleções.** Libere a coleção (com validade opcional). Suspender ou revogar com matrículas ativas pede justificativa.
3. **Coleções → editor.** Edite dados e tema, módulos e aulas (com reordenação) e a mídia de cada aula (escolhida na biblioteca). Use "Pré-visualizar" antes de publicar.
4. **Biblioteca de mídia.** Envie capas e PDFs, ou registre um vídeo por URL. Para trocar um vídeo, registre a URL nova e escolha essa mídia na aula. A referência antiga fica no histórico.
5. **Relatórios.** Filtre, exporte CSV e clique no nome para abrir o histórico da matrícula, onde ficam as correções e a revogação de certificado.
6. **Auditoria.** Filtre por tipo de evento, ação, instituição e período. Os pedidos de liberação feitos pela coordenação aparecem como "Liberação solicitada".

A coordenação, em `/coordenacao`, convida professores, matricula nas coleções liberadas, acompanha o progresso (com as aulas pendentes), revoga ou reativa matrículas, pede liberação de coleções e exporta os relatórios da própria instituição.

## Segurança: decisões principais

- **Senhas:** guardadas com Argon2id (19 MiB, t=2, p=1). Se o e-mail não existe, o login executa uma verificação fictícia, para que o tempo de resposta não revele quais contas existem.
- **Sessão:** um token opaco de 256 bits vai no cookie `__Host-fp_session` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`). O banco guarda só o SHA-256 do token. A sessão expira em `SESSION_TTL_HOURS` e é revogada no logout, ao redefinir a senha e quando o administrador desativa a conta.
- **CSRF:** toda escrita exige o cabeçalho `X-CSRF-Protection`, além de `Origin` dentro de `APP_ORIGINS` quando o navegador o envia.
- **Tokens de convite e redefinição:** são de uso único (consumo atômico com `UPDATE ... WHERE accepted_at IS NULL`), expiram e são guardados só como hash. A API nunca devolve o token; ele chega ao convidado apenas por e-mail.
- **Autorização:**
  - No servidor, por ação e por recurso: `src/access/access-policy.service.ts`.
  - Vínculos e instituições inativos deixam de valer já na requisição seguinte.
  - Os DTOs rejeitam campos não previstos (`forbidNonWhitelisted`), o que impede elevar o próprio papel ou trocar a instituição de um convite.
- **Proxy obrigatório:** com `PROXY_SECRET` configurado, a API recusa chamadas que não vêm do proxy do Pages. Isso também impede falsificar `X-Forwarded-For`, que alimenta o limite por IP.
- **Configuração:** em staging/produção a API **não sobe** se faltar HTTPS em `APP_URL`, se o cookie não estiver como `Secure` ou se o e-mail não for SMTP. O driver `log` imprimiria tokens no log, por isso é bloqueado nesses ambientes.

## Ambientes

| | Desenvolvimento | Homologação | Produção |
|---|---|---|---|
| Frontend | `npm run dev` (Vite) | projeto Pages de homologação (ou preview branch) | projeto Pages `formacaprof` |
| API | `npm run start:local` | `formacaprof-api-staging` (`deploy/render.staging.yaml`) | `formacaprof-api` (`render.yaml`) |
| Banco | `npm run db:local` | `formacaprof-staging-db` | `formacaprof-db` |
| `NODE_ENV` | development | staging | production |
| E-mail | `log` | `smtp` | `smtp` |

## Deploy

### 1. Render (API + banco)

1. No Render: **New → Blueprint**, escolha o repositório e use o `render.yaml` da raiz (para homologação, aponte para `deploy/render.staging.yaml`).
2. Preencha as variáveis marcadas como `sync: false`:
   - `APP_URL`: URL do Pages, ex. `https://formacaprof.pages.dev`;
   - `MAIL_FROM`, `SMTP_HOST`, `SMTP_USER` e `SMTP_PASS`: de qualquer provedor SMTP (Resend, Brevo, SES…).
3. O `preDeployCommand` roda `npx prisma migrate deploy` antes de cada deploy, aplicando as migrations versionadas. **Nunca use `prisma db push` em produção.**
   - No plano gratuito do Render não há pre-deploy. Nesse caso, troque o comando de start por `npm run start:migrate`.
4. Copie o valor gerado de `PROXY_SECRET` (aba Environment do serviço). Ele vai para o Cloudflare no passo 2.
5. Crie o primeiro administrador geral pelo **Shell** do serviço:
   ```bash
   ADMIN_EMAIL=admin@eticaeditora.com.br ADMIN_NAME="Administração Ética" ADMIN_PASSWORD='<senha forte, 12+>' npm run admin:bootstrap
   ```
   O script recusa executar se já existir um administrador. A senha não fica salva em lugar nenhum além do hash.
6. Ainda no Shell, carregue o catálogo (coleção BASTA, módulos, aulas e as referências dos vídeos atuais):
   ```bash
   npm run seed:content
   ```
   O comando só cria o que falta, então pode ser repetido sem risco. Ele nunca apaga nem sobrescreve. A coleção é importada como está em `content/catalog.json`. Confira no painel se ela está publicada.
7. Teste de ponta a ponta:
   1. Entre como administrador em `/admin`.
   2. Crie uma instituição, libere a coleção para ela e convide uma coordenação (o e-mail precisa chegar pelo SMTP).
   3. A coordenação aceita o convite, convida um professor e o matricula.
   4. O professor assiste e conclui; confira o certificado.
   5. Exporte o CSV e veja os eventos em Auditoria.

Confira no painel se os nomes de plano do `render.yaml` (`starter`, `basic-256mb`) existem na sua conta.

### 2. Cloudflare Pages (frontend + proxy)

Em **Settings → Variables and Secrets** do projeto Pages:

| Variável | Valor | Tipo |
|---|---|---|
| `VITE_API_MODE` | `http` | texto (usado no build) |
| `API_ORIGIN` | `https://formacaprof-api.onrender.com` (sem barra final) | texto |
| `PROXY_SECRET` | mesmo valor do Render | **secret** |

Faça um novo deploy. A função `functions/api/[[path]].js` passa a atender `/api/*` (`public/_routes.json`), e o restante continua sendo o SPA.

Isso só funciona em projeto **Pages**. Num projeto **Worker**, a pasta `functions/` é ignorada.

Enquanto `VITE_API_MODE=mock`, o site segue funcionando como demonstração, sem backend.

## Riscos e pendências conhecidos

- **Vídeos externos não são protegíveis de fato.** A API só revela o endereço a quem tem acesso, mas o arquivo em `midiasave-5c064.web.app` é público para quem já tem o link. Proteção real exige um storage com URLs assinadas e de curta duração (S3/R2), já previsto no modelo.
- **PDFs de exemplo ainda estão em `public/docs`** no frontend, usados pelo modo de demonstração. No modo `http` eles vêm da API com autorização. Antes de subir PDFs reais, remova os de `public/docs`, ou o Cloudflare Pages continuará servindo os arquivos publicamente.
- **Conteúdo provisório:** os 32 capítulos do BASTA e os planos de aula são placeholders (ver acima). Precisam de validação editorial e dos arquivos definitivos.
- **Coleções além do BASTA:** a estrutura é genérica (`/colecoes/:slug`, mesmas páginas e serviços), mas só existe o tema/layout `basta`. Uma coleção publicada com outro `theme_config.layout` mostra "Coleção em preparação" até ganhar o próprio tema.
- **Uploads no disco do Render:**
  - O disco é de uma única instância e impede deploy sem interrupção (zero-downtime).
  - Para escalar horizontalmente ou proteger vídeos com URL assinada, migre para R2/S3. O provedor já está previsto em `storage_provider`, e o endpoint `direct-upload` está reservado.
  - Depois do primeiro deploy, faça um upload de teste pelo painel. Se ele falhar com erro de permissão (a imagem roda como usuário `node`), ajuste o dono do diretório montado.
- **Pedidos de liberação** chegam ao administrador pela auditoria e pela atividade recente. Ainda não há notificação por e-mail.
- **Conclusão por sinal do cliente:** o servidor valida pertencimento, matrícula e tempo assistido, mas não tem como provar que o vídeo foi realmente visto. A conclusão híbrida (botão ou fim do player) é uma decisão de produto registrada.
- **Desempenho:** `/me/collections` e as listas de coordenação calculam o progresso por matrícula. Para turmas grandes (centenas de matrículas por coleção), convém agregar em SQL ou guardar um resumo.
- **Envio de e-mail sem fila:** se o SMTP falhar, o convite fica criado e a resposta traz `emailSent: false`. Basta criar o convite de novo, o que invalida o anterior.
- **Limite por IP em memória:** o `@nestjs/throttler` guarda os contadores por instância. Com várias instâncias, use um storage compartilhado (Redis). O bloqueio por conta fica no banco e já vale entre instâncias.
- **Bloqueio de conta:** a resposta 429 aparece só para contas que existem, após as falhas. É um vazamento mínimo, aceito em troca de proteger contas reais contra força bruta.
- **Dependências de desenvolvimento:**
  - O `npm audit` aponta o `braces` (via Jest), que não vai para produção.
  - O `deepmerge-ts` e o `js-yaml` foram forçados para versões corrigidas via `overrides`.
- **Não testado nesta máquina:** a imagem Docker e o deploy no Render (não há Docker instalado aqui). A proxy function do Cloudflare não foi executada no ambiente da Cloudflare; o mesmo fluxo foi testado com o proxy do Vite.
