// 68 -> "1:08"
export function formatarDuracao(segundos) {
  if (!segundos) return '';
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
