// Título de seção com sublinhado colorido (padrão das telas BASTA).
export default function SectionTitle({ children, color = 'pink', as: Tag = 'h2' }) {
  return <Tag className={`section-title section-title--${color}`}>{children}</Tag>;
}
