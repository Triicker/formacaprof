import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import VideoPlayer from '../../components/VideoPlayer';
import { adminApi } from '../adminApi';
import { Async, Badge, PageHeader, Tabs, useAsync } from '../ui';

/**
 * Prévia da jornada como o professor verá, incluindo rascunhos (sinalizados). Usa o mesmo player
 * da área de formação; as mídias passam pelo portão /media/:id (o administrador tem acesso).
 */
export default function AdminPrevia() {
  const { id } = useParams();
  const state = useAsync(() => adminApi.collection(id), [id]);
  const [moduloId, setModuloId] = useState(null);
  const [aulaId, setAulaId] = useState(null);

  return (
    <Async state={state}>
      {(col) => {
        const modulo = col.modules.find((m) => m.id === moduloId) ?? col.modules[0];
        const aula = modulo?.lessons.find((l) => l.id === aulaId) ?? modulo?.lessons[0];
        return (
          <>
            <PageHeader breadcrumb={<Link to={`/admin/colecoes/${id}`}>← Voltar ao editor</Link>} title={`Prévia: ${col.title}`}
              description="Itens em rascunho ou arquivados aparecem sinalizados e não ficam visíveis aos professores." />
            {!modulo ? <p className="adm-empty">A coleção ainda não tem módulos.</p> : (
              <>
                <Tabs value={modulo.id} onChange={(v) => { setModuloId(v); setAulaId(null); }}
                  tabs={col.modules.map((m) => ({ value: m.id, label: `${m.title}${m.status !== 'published' ? ' (não publicado)' : ''}` }))} />
                <div className="adm-grid adm-grid--2">
                  <section className="adm-card">
                    {aula ? (
                      <>
                        <div className="adm-card__head">
                          <h2>{aula.title}</h2>
                          <span style={{ display: 'flex', gap: 6 }}>{aula.provisional && <Badge tone="warning">Provisório</Badge>}<Badge status={aula.status} /></span>
                        </div>
                        {aula.lessonType === 'video' && aula.mediaUrl && (
                          <div style={{ background: '#0a1832', borderRadius: 12, padding: 16 }}>
                            <VideoPlayer key={aula.id} video={{ id: aula.id, url: aula.mediaUrl, capa: aula.thumbnailUrl, titulo: aula.title }} />
                          </div>
                        )}
                        {aula.lessonType === 'document' && aula.mediaUrl && <a className="adm-btn adm-btn--primary" href={aula.mediaUrl} target="_blank" rel="noreferrer">Abrir documento</a>}
                        {!aula.mediaUrl && <p className="adm-notice">Aula sem mídia vinculada.</p>}
                        {aula.description && <p>{aula.description}</p>}
                      </>
                    ) : <p className="adm-empty">Módulo sem aulas.</p>}
                  </section>
                  <section className="adm-card">
                    <h2>Aulas do módulo</h2>
                    <ol className="adm-list">
                      {modulo.lessons.map((l) => (
                        <li key={l.id}>
                          <button type="button" className="adm-link-btn" aria-current={l.id === aula?.id} onClick={() => setAulaId(l.id)}>{l.title}</button>
                          <span style={{ display: 'flex', gap: 6 }}>
                            <Badge tone={l.requiredForCompletion ? 'info' : 'neutral'}>{l.requiredForCompletion ? 'Obrigatória' : 'Complementar'}</Badge>
                            {l.status !== 'published' && <Badge status={l.status} />}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              </>
            )}
          </>
        );
      }}
    </Async>
  );
}
