export default function BrandTitle({ size = 'md' }) {
  return (
    <h1 className={`brand-title brand-title--${size}`}>
      <span className="brand-title__top">Formação para</span>
      <span className="brand-title__bottom">PROFESSORES</span>
    </h1>
  );
}
