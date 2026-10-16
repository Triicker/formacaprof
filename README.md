# Formação para Professores

Plataforma web de formação de professores da Ética Editora, com a coleção **BASTA!**. Funciona em celular e desktop.

| Parte | Tecnologia | Onde roda |
|---|---|---|
| Site (professores, coordenação, administração) | React 18 + Vite + React Router | Cloudflare Pages |
| Proxy `/api/*` | Cloudflare Pages Function (`functions/api/[[path]].js`) | Cloudflare Pages |
| API | NestJS 11 + Prisma 6 ([`backend/`](backend/README.md)) | Render (Web Service, Docker) |
| Banco | PostgreSQL 17 | Render (Postgres) |
| Vídeos | arquivos externos (Firebase, `midiasave-5c064.web.app`) | entregues pela API só a quem tem acesso |

```
Navegador ──► Cloudflare Pages (site + /api proxy) ──► Render: API ──► Render: PostgreSQL
              mesmo domínio: cookie de sessão first-party
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/DEPLOY-RENDER.md](docs/DEPLOY-RENDER.md) | **Passo a passo** para criar o banco e a API no Render, ligar o Cloudflare Pages e testar |
| [backend/README.md](backend/README.md) | API: rodar localmente, testes, modelo de dados, regras de acesso, endpoints, segurança |
| [docs/VALIDACAO-USERFLOW.md](docs/VALIDACAO-USERFLOW.md) | Validação das telas contra o userflow original |

## Modos do frontend (`VITE_API_MODE`)

- **`mock`** (padrão): demonstração sem backend. Os dados ficam no `localStorage` do navegador.
- **`http`**: usa a API real, com login, convites, instituições, catálogo, progresso, certificados e os painéis.

## Rodar localmente

**Só a demonstração:**

```bash
npm install
npm run dev        # http://localhost:5173
```

Login: **ana@etica.com / 123456**. Para voltar ao estado inicial, use o menu "Olá, Prof. …" → **Resetar dados de demonstração**.

**Com a API real:** suba o backend como em [backend/README.md](backend/README.md#rodar-localmente) e rode:

```bash
VITE_API_MODE=http npm run dev    # o Vite encaminha /api para localhost:3000
```

Usuários do seed local (senha `professor123`): `admin@etica.dev` (administração), `coordenacao@etica.dev` (coordenação) e `ana@etica.com` (professora).

**Build de produção:** `npm run build` gera `dist/`.

## Perfis

| Perfil | O que faz | Onde |
|---|---|---|
| Professor(a) | Assiste às aulas das coleções em que está matriculado, acompanha o progresso, envia feedback e emite o certificado | `/inicio`, `/basta`, `/colecoes/:slug` |
| Coordenação | Convida professores, matricula nas coleções liberadas, acompanha o progresso, pede liberação de coleções, exporta relatórios da instituição | `/coordenacao` |
| Administração geral | Instituições, usuários, coordenadores, coleções (editor e publicação), biblioteca de mídia, liberação por instituição, relatórios, correções e auditoria | `/admin` |

Os painéis só aparecem no modo `http`. A checagem de papel no site só organiza a interface: **toda autorização é feita pela API**.

## Telas e rotas

| Tela | Rota |
|---|---|
| Login, recuperação e redefinição de senha | `/login`, `/recuperar-senha`, `/redefinir-senha` |
| Aceite de convite (cadastro no modo `http`) | `/convite` |
| Cadastro (só no modo demonstração) | `/cadastro`, `/cadastro/sucesso` |
| Boas-vindas (primeiro acesso) | `/boas-vindas` |
| Escolha de instituição (mais de um vínculo) / sem vínculo | `/escolher-instituicao`, `/sem-vinculo` |
| Início (coleções) | `/inicio` |
| Início da coleção BASTA | `/basta` |
| Conheça o projeto + vídeo | `/basta/conheca`, `/basta/conheca/:id` |
| Materiais → nível → vídeo | `/basta/materiais`, `/basta/materiais/:nivel`, `/basta/materiais/:nivel/:id` |
| Minha formação + certificado | `/basta/minha-formacao`, `/basta/certificado` |
| Feedback | `/basta/feedback`, `/basta/feedback/obrigado` |
| Outras coleções (mesmas páginas) | `/colecoes/:slug/*` (`/colecoes/basta/*` redireciona para `/basta/*`) |
| Painel administrativo | `/admin`, `/admin/instituicoes`, `/admin/usuarios`, `/admin/coordenadores`, `/admin/colecoes`, `/admin/midias`, `/admin/relatorios`, `/admin/auditoria` |
| Painel da coordenação | `/coordenacao`, `/coordenacao/professores`, `/coordenacao/colecoes`, `/coordenacao/relatorios` |

**Layout:** em telas a partir de 960px de largura, as páginas dos professores ocupam a altura da janela, sem rolagem, nas proporções do layout de referência. No celular, a navegação fica numa barra inferior (`MobileTabBar`).

## Estrutura

```
src/
  services/api.js          ← único ponto de acesso a dados (troca mock ↔ http)
  services/httpApi.js      ← cliente da API real (/api/v1, cookie HttpOnly, CSRF)
  services/mockApi.js      ← implementação da demonstração (localStorage)
  services/localContent.js ← catálogo e progresso da demonstração
  mock/seed.js             ← dados da demonstração (coleções, vídeos, escolas, usuária)
  context/                 ← sessão (AuthContext) e avisos (ToastContext)
  layouts/BastaLayout.jsx  ← moldura das páginas de coleção
  pages/                   ← telas dos professores
  admin/                   ← painéis /admin e /coordenacao (ui.jsx, adminApi.js, pages/)
  styles/                  ← app.css, basta.css, admin.css (painéis, escopo .adm)
functions/api/[[path]].js  ← proxy do Cloudflare Pages para a API
public/img                 ← imagens e capas
backend/                   ← API, banco, testes (ver backend/README.md)
render.yaml                ← Blueprint do Render (produção); homologação em deploy/
docs/                      ← deploy e validação
```

## Conteúdo e vídeos

- O catálogo real fica em `backend/content/catalog.json` e é carregado no banco com `npm run seed:content`.
- Os vídeos são os arquivos atuais do Firebase (`video1.mp4` … `video10.mp4`). Os 32 capítulos dos níveis de ensino ainda os reaproveitam e aparecem como "Vídeo provisório".
- Para trocar pelos definitivos não é preciso mexer em código:
  1. Painel → **Biblioteca de mídia** → registrar a URL nova.
  2. **Coleções → BASTA** → editar a aula → escolher a mídia nova.
- Os planos de aula (PDF) existem só na API (`backend/storage/basta`) e são entregues apenas a quem tem acesso. O site não publica PDFs.
