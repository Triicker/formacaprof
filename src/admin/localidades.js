// Regiões, UFs e municípios oficiais (IBGE). A lista de municípios (~84 KB) só é baixada quando o formulário precisa.
// A API confere região × UF de novo (backend/src/institutions/regioes.ts).

export const REGIOES = {
  Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};

export const NOMES_UF = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso',
  PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};

export const regiaoDaUf = (uf) => Object.keys(REGIOES).find((r) => REGIOES[r].includes(uf)) ?? '';

let cache;
/** Municípios agrupados por UF: { BA: ['Abaíra', ...], ... }. */
export function carregarMunicipios() {
  cache ??= import('./municipios.json').then((m) => m.default);
  return cache;
}
