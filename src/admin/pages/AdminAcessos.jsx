import { Badge, Table } from '../ui';

const ESTADO = { active: 'Liberado', suspended: 'Suspenso', revoked: 'Revogado', expired: 'Expirado', none: 'Bloqueado' };

/** Direitos de uso de cada coleção pela instituição. */
export function AcessosColecoes({ institution }) {
  return (
    <section className="adm-card">
      <h2>Coleções da instituição</h2>
      <Table
        rowKey={(r) => r.collection.id}
        rows={institution.collectionAccess}
        columns={[
          { key: 'c', label: 'Coleção', render: (r) => <span className="adm-cell-main"><b>{r.collection.title}</b><small>{r.collection.status === 'published' ? 'Publicada' : 'Em preparação'}</small></span> },
          { key: 's', label: 'Direito', render: (r) => <Badge status={r.state === 'none' ? 'none' : r.state}>{ESTADO[r.state]}</Badge> },
          { key: 'm', label: 'Matrículas ativas', num: true, render: (r) => r.activeEnrollments },
        ]}
      />
    </section>
  );
}
