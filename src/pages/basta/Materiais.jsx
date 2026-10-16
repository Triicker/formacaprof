import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BastaHeader from '../../components/BastaHeader';
import SectionTitle from '../../components/SectionTitle';
import { useBasta } from '../../layouts/BastaLayout';
import { api } from '../../services/api';

export default function Materiais() {
  const { progresso, slug, base } = useBasta();
  const [modulos, setModulos] = useState(null);

  useEffect(() => { api.getModulos(slug).then(setModulos); }, [slug]);

  return (
    <div className="basta-page">
      <BastaHeader />
      <SectionTitle color="purple">Materiais pedagógicos</SectionTitle>
      <div className="book-grid">
        {modulos?.map((m) => {
          const p = progresso?.porModulo.find((x) => x.slug === m.slug);
          return (
            <Link key={m.slug} to={`${base}/materiais/${m.slug}`} className="book-card">
              <span className="book-card__label">{m.titulo}</span>
              <div className="book-card__frame">
                <img src={m.livro} alt={`Livro – ${m.titulo}`} />
              </div>
              {p && <span className="book-card__progress">{p.assistidos} de {p.total} aulas</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
