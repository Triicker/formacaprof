# Formação para Professores (portal web)

Versão web responsiva (mobile + desktop) do app de formação da Ética Editora, com a coleção **BASTA!**.
O frontend funciona em dois modos (`VITE_API_MODE`):

- **`mock`** (padrão): demonstração sem backend. Os dados ficam no `localStorage` do navegador.
- **`http`**: usa a API real em [`backend/`](backend/README.md) (NestJS + PostgreSQL), com login, sessão, convites e instituições.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/
```

Login de demonstração: **ana@etica.com / 123456**. Também é possível criar uma conta nova pelo cadastro (qualquer código de acesso é aceito).
Para voltar ao estado inicial, use o menu "Olá, Prof. …" → **Resetar dados de demonstração**.

## Telas e rotas

| Userflow | Rota |
|---|---|
| 01 Login | `/login` |
| 02 Cadastro + confirmação | `/cadastro`, `/cadastro/sucesso` |
| Recuperar senha (nova) | `/recuperar-senha` |
| 03 Boas-vindas | `/boas-vindas` (só no primeiro login) |
| 04 Início (coleções) | `/inicio` |
| 05 Início BASTA | `/basta` |
| 06/07 Conheça o projeto + vídeo | `/basta/conheca`, `/basta/conheca/:id` |
| 08/09/10 Materiais → nível → vídeo | `/basta/materiais`, `/basta/materiais/:nivel`, `/basta/materiais/:nivel/:id` |
| 11 Minha formação + certificado | `/basta/minha-formacao`, `/basta/certificado` |
| 12 Feedback + obrigado | `/basta/feedback`, `/basta/feedback/obrigado` |

## Estrutura

```
src/
  services/api.js       ← único ponto de acesso a dados (troca mock ↔ http)
  services/mockApi.js   ← implementação local (localStorage)
  services/httpApi.js   ← cliente da API real (/api/v1, cookie HttpOnly, CSRF)
  services/localContent.js ← catálogo + progresso (locais até a Etapa 3)
  mock/seed.js          ← coleções, módulos, vídeos, escolas, usuária demo
  layouts/BastaLayout   ← sidebar no desktop / header no mobile
  pages/                ← uma página por tela
public/img              ← assets copiados de ASSETS/ com nomes limpos
public/docs             ← PDFs de exemplo dos planos de aula
```

Os vídeos (verticais 9:16) vêm de `https://midiasave-5c064.web.app/video1.mp4` … `video10.mp4`, definidos em `MIDIAS` no `src/mock/seed.js`; as capas ficam em `public/img/thumbs/`. "Conheça o projeto" usa os 10; cada módulo de Materiais usa uma sequência diferente deles até existirem vídeos próprios por capítulo. Sem `url`, o player simula a reprodução.

No mobile, a navegação principal fica numa barra inferior (`MobileTabBar`); o botão "Mais" abre as ações secundárias.

## Backend e deploy

A API, o banco, os testes e o passo a passo de deploy (Render + Cloudflare Pages) estão em [backend/README.md](backend/README.md).

- `functions/api/[[path]].js`: proxy do Cloudflare Pages que encaminha `/api/*` para a API no Render. Como fica no mesmo domínio, o cookie de sessão é first-party.
- `render.yaml`: Blueprint da API + PostgreSQL de produção. Homologação: `deploy/render.staging.yaml`.
- No modo `http`, o cadastro é feito **por convite** (`/convite`). Também existem `/redefinir-senha` e `/sem-vinculo`.
- No modo `http`, catálogo, estados dos cards, progresso, feedback e certificado vêm da API e do PostgreSQL. O `src/mock/seed.js` e o `src/services/localContent.js` são usados só no modo `mock`.
- As páginas de coleção são genéricas (`BastaLayout` recebe `slug` e `base`). `/basta/*` continua funcionando e `/colecoes/:slug/*` usa as mesmas páginas; `/colecoes/basta/*` redireciona para `/basta/*`.

Veja também [docs/VALIDACAO-USERFLOW.md](docs/VALIDACAO-USERFLOW.md).
