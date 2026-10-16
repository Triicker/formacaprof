// Dropdown no estilo "barra suspensa neon" do protótipo.
export default function NeonSelect({ value, options, onChange, label = 'Selecionar nível de ensino' }) {
  return (
    <label className="neon-select">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
