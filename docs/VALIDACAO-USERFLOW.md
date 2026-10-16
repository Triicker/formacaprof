# Validação do userflow: Aplicativo de Formação + BASTA

Análise do PDF `userflow-app2 formação.pdf` (12 telas, mais 3 telas de estado) e dos assets de `ASSETS/`.

## O que está consistente ✅

- Os 12 grupos de assets batem com as telas do userflow (01-Login → 12-Feedback). A pasta 07 está vazia, mas a tela usa os mesmos elementos da 10.
- A navegação principal é coerente: Login → Boas-vindas → Início (coleções) → BASTA → 4 seções.
- O padrão visual está bem definido. A área geral é azul-marinho com laranja. A área BASTA é neon magenta, com uma cor por seção (rosa, roxo, ciano e verde).
- "12 de 32 vídeos" fecha com 4 níveis × 8 capítulos = 32 vídeos.

## Inconsistências encontradas ⚠️

| # | Tela | Problema | Decisão no mock |
|---|------|----------|-----------------|
| 1 | Minha formação | **60% concluído** não bate com **12 de 32 vídeos** (37,5%) nem com **3 de 4 módulos** (75%) | O percentual é calculado a partir dos vídeos (12/32 = 38%) |
| 2 | Minha formação | A definição de "módulo" não está clara | Módulo = nível de ensino (Anos iniciais, Anos finais, Ensino médio, EJA) |
| 3 | Login | "Esqueceu a senha?" não leva a nenhuma tela | Criada a tela `/recuperar-senha` |
| 4 | Confirmação de cadastro | O botão diz "Voltar para o início", mas a seta leva ao Login | Leva ao Login (o usuário ainda não está logado) |
| 5 | Início BASTA | Não há botão para voltar à lista de coleções | Botão voltar no mobile e "← Todas as coleções" na sidebar do desktop |
| 6 | Início BASTA | O destino de "Conheça o Instituto BASTA!" não está definido | Mostra um aviso "link a definir" (configurável em `seed.js`) |
| 7 | Vídeo aberto | O rótulo "Anos finais" aparece acima de "Plano de aula – Anos Iniciais" | O título da seção segue o módulo atual |
| 8 | Minha formação | O botão de certificado aparece com 60%: não está definido quando ele é liberado | Liberado só com 100% (antes disso mostra um aviso) |
| 9 | Geral | Não existe opção de **sair/logout** nem de perfil | Menu na pílula "Olá, Prof. …" com Sair |

## Pontos que dependem do cliente ❓

1. **Código de acesso**: para que serve? Libera coleções específicas? É único por escola? (Hoje o mock aceita qualquer valor.)
2. **Nível de acesso**: quais são os níveis (Professor, Coordenador, Gestor)? Eles mudam o que o usuário vê?
3. **Região e Escola**: de onde vem a lista? É fixa ou importada da secretaria?
4. **Vídeo de boas-vindas**: aparece só no primeiro acesso ou sempre? (Mock: só no primeiro, e pode ser revisto pelo menu.)
5. **Vídeos de "Conheça o projeto"**: contam para o certificado? (Mock: não contam.)
6. **"Marcar como aula assistida"**: deve ser manual ou automático ao fim do vídeo? (Mock: os dois.)
7. **Curtir/compartilhar** no vídeo: o que fazem? Curtir alimenta algum relatório?
8. **Onde os vídeos ficam hospedados**: YouTube não listado, Vimeo, Bunny ou outro serviço? Isso afeta o banco e o player.
9. **Número do WhatsApp** de suporte.
10. **Feedback**: pode ser enviado uma única vez ou várias? Quem tem acesso às respostas (painel admin)?
11. **As outras 9 coleções**: vão seguir a mesma estrutura do BASTA (projeto, materiais, formação, feedback)? Se sim, o banco precisa ser genérico por coleção.
12. **Certificado**: quais dados entram nele (carga horária, CPF, assinatura)? Precisa de código de validação?

## Faltando para a versão com banco de dados

- Painel administrativo (cadastrar vídeos, materiais e escolas; ver feedbacks e progresso).
- Política de senha e e-mail transacional (recuperação de senha).
- Termos de uso e LGPD (o cadastro coleta dados pessoais e escola).
