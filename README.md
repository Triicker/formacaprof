# Formação para Professores (portal web)

Versão web responsiva (mobile + desktop) do app de formação da Ética Editora, com a coleção **BASTA!**.
Esta é a **versão mockada**: todos os dados ficam no `localStorage` do navegador, sem backend.

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
  services/httpApi.js   ← contrato de endpoints para o backend real
  mock/seed.js          ← coleções, módulos, vídeos, escolas, usuária demo
  layouts/BastaLayout   ← sidebar no desktop / header no mobile
  pages/                ← uma página por tela
public/img              ← assets copiados de ASSETS/ com nomes limpos
public/docs             ← PDFs de exemplo dos planos de aula
```

Os vídeos (verticais 9:16) vêm de `https://midiasave-5c064.web.app/video1.mp4` … `video10.mp4`, definidos em `MIDIAS` no `src/mock/seed.js`; as capas ficam em `public/img/thumbs/`. "Conheça o projeto" usa os 10; cada módulo de Materiais usa uma sequência diferente deles até existirem vídeos próprios por capítulo. Sem `url`, o player simula a reprodução.

No mobile, a navegação principal fica numa barra inferior (`MobileTabBar`); o botão "Mais" abre as ações secundárias.

## Próximo passo: backend

1. Implementar os endpoints listados em `src/services/httpApi.js`.
2. Definir `VITE_API_MODE=http` e `VITE_API_URL` no Render.
3. As tabelas sugeridas seguem o `seed.js`: `usuarios`, `regioes`, `escolas`, `colecoes`, `modulos`, `videos`, `progresso`, `curtidas`, `feedbacks`.

## Deploy no Render

O `render.yaml` publica o site como Static Site, com rewrite de SPA (`/* → /index.html`).

Veja também [docs/VALIDACAO-USERFLOW.md](docs/VALIDACAO-USERFLOW.md).
