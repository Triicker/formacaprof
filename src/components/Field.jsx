// Campo de formulário no estilo do protótipo (pílula cinza-azulada).
export function Input({ label, icon, error, ...props }) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      {icon && <img className="field__icon" src={icon} alt="" />}
      <input className="field__control" placeholder={label} aria-label={label} {...props} />
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

export function Select({ label, options, error, ...props }) {
  return (
    <label className={`field field--select ${error ? 'field--error' : ''}`}>
      <select className="field__control" aria-label={label} {...props}>
        <option value="">{label}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}
