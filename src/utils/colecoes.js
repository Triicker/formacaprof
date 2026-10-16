// Rota-base de uma coleção. BASTA mantém /basta (links antigos); as demais usam /colecoes/:slug.
export const baseDaColecao = (slug) => (slug === 'basta' ? '/basta' : `/colecoes/${slug}`);

/** Primeira coleção liberada com aula pendente → link "Continuar de onde parou". */
export function linkContinuar(colecoes) {
  const c = colecoes?.find((x) => x.status === 'available' && x.progresso?.proximo);
  if (!c) return null;
  const { modulo, videoId } = c.progresso.proximo;
  return `${baseDaColecao(c.slug)}/materiais/${modulo}/${videoId}`;
}
