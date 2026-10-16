/** Regiões do IBGE e suas UFs. A mesma tabela existe no frontend (src/admin/localidades.js). */
export const REGIOES: Record<string, readonly string[]> = {
  Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};

export const NOMES_REGIOES = Object.keys(REGIOES);
