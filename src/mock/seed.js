// Dados iniciais da versão mockada. A estrutura espelha as tabelas
// previstas para o banco (usuarios, colecoes, modulos, videos, progresso, feedbacks).

export const REGIOES = [
  { id: 'norte', nome: 'Regional Norte' },
  { id: 'sul', nome: 'Regional Sul' },
  { id: 'leste', nome: 'Regional Leste' },
  { id: 'oeste', nome: 'Regional Oeste' },
  { id: 'centro', nome: 'Regional Centro' },
];

export const ESCOLAS = [
  { id: 'e1', regiaoId: 'norte', nome: 'EM Prof. Maria José' },
  { id: 'e2', regiaoId: 'norte', nome: 'EE Dom Pedro II' },
  { id: 'e3', regiaoId: 'sul', nome: 'EM Cecília Meireles' },
  { id: 'e4', regiaoId: 'sul', nome: 'EE Rui Barbosa' },
  { id: 'e5', regiaoId: 'leste', nome: 'EM Paulo Freire' },
  { id: 'e6', regiaoId: 'leste', nome: 'EE Anísio Teixeira' },
  { id: 'e7', regiaoId: 'oeste', nome: 'EM Monteiro Lobato' },
  { id: 'e8', regiaoId: 'oeste', nome: 'EE Darcy Ribeiro' },
  { id: 'e9', regiaoId: 'centro', nome: 'EM Carolina de Jesus' },
  { id: 'e10', regiaoId: 'centro', nome: 'EE Machado de Assis' },
];

export const NIVEIS_ACESSO = [
  { id: 'professor', nome: 'Professor(a)' },
  { id: 'coordenador', nome: 'Coordenador(a) pedagógico(a)' },
  { id: 'gestor', nome: 'Gestor(a) escolar' },
];

export const COLECOES = [
  { slug: 'reforco-escolar', titulo: 'Reforço Escolar Gamificado', capa: '/img/col-reforco-escolar.png', disponivel: false },
  { slug: 'paz-nas-escolas', titulo: 'Paz nas Escolas', capa: '/img/col-paz-nas-escolas.png', disponivel: false },
  { slug: 'basta', titulo: 'BASTA! De violência contra a mulher', capa: '/img/col-basta.png', disponivel: true },
  { slug: 'feminicidio-zero', titulo: 'Feminicídio Zero', capa: '/img/col-feminicidio-zero.png', disponivel: false },
  { slug: 'afro-indigena', titulo: 'Vivenciando a Cultura Afro-brasileira e Indígena', capa: '/img/col-afro-indigena.png', disponivel: false },
  { slug: 'transito', titulo: 'Vivenciando a Educação no Trânsito', capa: '/img/col-transito.png', disponivel: false },
  { slug: 'energia-eletrica', titulo: 'Uso Inteligente e Consciente da Energia Elétrica', capa: '/img/col-energia-eletrica.png', disponivel: false },
  { slug: 'dengue', titulo: 'Campanha Nacional de Combate à Dengue', capa: '/img/col-dengue.png', disponivel: false },
  { slug: 'empreendedorismo', titulo: 'Empreendedorismo na Adolescência', capa: '/img/col-empreendedorismo.png', disponivel: false },
  { slug: 'educacao-ambiental', titulo: 'Vivenciando a Educação Ambiental', capa: '/img/col-educacao-ambiental.png', disponivel: false },
];

// Vídeos hospedados (verticais 9:16, ~1 min). A capa é um quadro extraído de cada vídeo.
const MIDIA_URL = 'https://midiasave-5c064.web.app';
const MIDIAS = [
  { titulo: 'O maior clamor social', duracao: 68 },
  { titulo: 'Objetivo principal', duracao: 75 },
  { titulo: 'Metas fundamentais', duracao: 72 },
  { titulo: 'Ecossistema BASTA!', duracao: 69 },
  { titulo: 'Os três pilares', duracao: 79 },
  { titulo: 'A base legal', duracao: 89 },
  { titulo: 'A metodologia', duracao: 74 },
  { titulo: 'Professor mediador', duracao: 65 },
  { titulo: 'Adaptado à idade', duracao: 68 },
  { titulo: 'Meninas e meninos', duracao: 69 },
].map((m, i) => ({
  ...m,
  url: `${MIDIA_URL}/video${i + 1}.mp4`,
  thumb: `/img/thumbs/video${i + 1}.jpg`,
  capa: `/img/thumbs/video${i + 1}.jpg`,
}));

export const VIDEO_BOAS_VINDAS = { id: 'boas-vindas', ...MIDIAS[0] };

// Vídeos institucionais ("Conheça o projeto") — não contam para o certificado.
export const VIDEOS_PROJETO = MIDIAS.map((m, i) => ({
  ...m,
  id: `p${i + 1}`,
  titulo: `${String(i + 1).padStart(2, '0')} – ${m.titulo}`,
}));

const CAPITULOS = [
  'Nem tudo é fácil de identificar',
  'Dores que parecem incuráveis',
  'Ser sensível é normal',
  'E quem é o normal?',
  'O silêncio também fala',
  'Rede de apoio',
  'Construindo respeito',
  'Basta! Um novo começo',
];

// Cada nível de ensino é um módulo com 8 capítulos: 4 × 8 = 32 vídeos (como no layout).
export const MODULOS = [
  { slug: 'anos-iniciais', titulo: 'Anos iniciais', subtitulo: 'Anos iniciais (1º ao 5º ano)', livro: '/img/livro-anos-iniciais.png' },
  { slug: 'anos-finais', titulo: 'Anos finais', subtitulo: 'Anos finais (6º ao 9º ano)', livro: '/img/livro-anos-finais.png' },
  { slug: 'ensino-medio', titulo: 'Ensino médio', subtitulo: 'Ensino médio (1ª à 3ª série)', livro: '/img/livro-ensino-medio.png' },
  { slug: 'eja', titulo: 'EJA', subtitulo: 'EJA (Educação de Jovens e Adultos)', livro: '/img/livro-eja.png' },
].map((m, mi) => ({
  ...m,
  // Enquanto não há vídeos próprios por capítulo, cada módulo usa uma sequência diferente dos 10 vídeos.
  videos: CAPITULOS.map((c, i) => {
    const { titulo, ...midia } = MIDIAS[(mi * 3 + i) % MIDIAS.length];
    return { ...midia, id: `${m.slug}-${i + 1}`, titulo: `Capítulo ${i + 1} – ${c}` };
  }),
}));

export const BASTA = {
  slug: 'basta',
  institutoUrl: null, // link do Instituto BASTA! — a definir
};

export const USUARIO_DEMO = {
  id: 'u-demo',
  nome: 'Ana Maria',
  email: 'ana@etica.com',
  senha: '123456',
  regiaoId: 'centro',
  escolaId: 'e9',
  nivelAcesso: 'professor',
  codigoAcesso: 'ETICA2026',
  viuBoasVindas: false,
};

// Progresso inicial da usuária demo: 12 vídeos assistidos (mesmo número do layout).
export const PROGRESSO_DEMO = [
  ...MODULOS[0].videos.slice(0, 8),
  ...MODULOS[1].videos.slice(0, 4),
].map((v) => v.id);
