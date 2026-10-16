import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { InstitutionSelect } from './shared';
import { Async, Badge, Field, Filters, fmtData, Loading, PageHeader, Pager, Progress, Table, Tabs, useAsync, useFilters } from './ui';

const SITUACAO = { completed: 'Concluída', in_progress: 'Em andamento', not_started: 'Não iniciada' };
const situacao = (r) => (r.completedAt ? 'completed' : r.progress?.requiredCompleted ? 'in_progress' : 'not_started');

/**
 * Relatórios compartilhados entre administração (todas as instituições) e coordenação (uma instituição).
 * `api` = { enrollments, certificates, participation, exportCsv }; `institutions` habilita filtros globais.
 * Paginação, filtros e ordenação são feitos no backend.
 */
export default function Relatorio({ titulo, descricao, api, colecoes = [], institutions, organizations, linkMatricula }) {
  const toast = useToast();
  const [f, setF] = useFilters({ aba: 'matriculas', page: '1' });
  const [exportando, setExportando] = useState(false);
  const comuns = { collectionId: f.collectionId, from: f.from, to: f.to && `${f.to}T23:59:59` };
  const filtros = {
    ...comuns, q: f.q, status: f.status, completion: f.completion, periodField: f.periodField, sort: f.sort,
    ...(institutions ? { institutionId: f.institutionId, organizationId: f.organizationId } : {}),
  };
  const deps = [f.aba, f.collectionId, f.from, f.to, f.q, f.status, f.completion, f.periodField, f.sort, f.institutionId, f.organizationId, f.page];
  // Cada resultado leva a aba de origem: durante a troca, o dado anterior não é renderizado com o formato errado.
  const state = useAsync(() => buscar().then((dados) => ({ aba: f.aba, dados })), deps);
  function buscar() {
    if (f.aba === 'participacao') return api.participation({ ...comuns, ...(institutions ? { institutionId: f.institutionId, organizationId: f.organizationId } : {}) });
    if (f.aba === 'certificados') return api.certificates({ ...comuns, q: f.q, ...(institutions ? { institutionId: f.institutionId, organizationId: f.organizationId } : {}), page: f.page, pageSize: 20 });
    return api.enrollments({ ...filtros, page: f.page, pageSize: 20 });
  }

  async function exportar() {
    setExportando(true);
    try { await api.exportCsv(filtros); } catch (e) { toast(e.message); }
    setExportando(false);
  }

  return (
    <>
      <PageHeader title={titulo} description={descricao}
        actions={f.aba === 'matriculas' && <button type="button" className="adm-btn" onClick={exportar} disabled={exportando}>{exportando ? 'Gerando…' : 'Exportar CSV'}</button>} />
      <Tabs value={f.aba} onChange={(v) => setF({ aba: v })} tabs={[{ value: 'matriculas', label: 'Matrículas e progresso' }, { value: 'participacao', label: 'Participação por período' }, { value: 'certificados', label: 'Certificados' }]} />
      <Filters>
        {institutions && <Field label="Instituição"><InstitutionSelect value={f.institutionId} onChange={(v) => setF({ institutionId: v })} options={institutions} /></Field>}
        {organizations && (
          <Field label="Rede/organização">
            <select value={f.organizationId ?? ''} onChange={(e) => setF({ organizationId: e.target.value })}>
              <option value="">Todas</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Coleção">
          <select value={f.collectionId ?? ''} onChange={(e) => setF({ collectionId: e.target.value })}>
            <option value="">Todas</option>{colecoes.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
        {f.aba !== 'participacao' && <Field label="Buscar"><input type="search" defaultValue={f.q} placeholder="Nome ou e-mail" onKeyDown={(e) => e.key === 'Enter' && setF({ q: e.currentTarget.value })} onBlur={(e) => e.currentTarget.value !== (f.q ?? '') && setF({ q: e.currentTarget.value })} /></Field>}
        {f.aba === 'matriculas' && (
          <>
            <Field label="Situação">
              <select value={f.completion ?? ''} onChange={(e) => setF({ completion: e.target.value })}>
                <option value="">Todas</option><option value="completed">Concluída</option><option value="in_progress">Em andamento</option><option value="not_started">Não iniciada</option>
              </select>
            </Field>
            <Field label="Matrícula">
              <select value={f.status ?? ''} onChange={(e) => setF({ status: e.target.value })}>
                <option value="">Todas</option><option value="active">Ativas</option><option value="revoked">Revogadas</option>
              </select>
            </Field>
            <Field label="Período por">
              <select value={f.periodField ?? ''} onChange={(e) => setF({ periodField: e.target.value })}><option value="">Data de matrícula</option><option value="completedAt">Data de conclusão</option></select>
            </Field>
            <Field label="Ordenar">
              <select value={f.sort ?? ''} onChange={(e) => setF({ sort: e.target.value })}><option value="">Mais recentes</option><option value="name">Nome</option><option value="completedAt">Conclusão</option></select>
            </Field>
          </>
        )}
        <Field label="De"><input type="date" value={f.from ?? ''} onChange={(e) => setF({ from: e.target.value })} /></Field>
        <Field label="Até"><input type="date" value={f.to ?? ''} onChange={(e) => setF({ to: e.target.value })} /></Field>
      </Filters>

      <Async state={state}>
        {({ aba, dados: d }) => {
          if (aba !== f.aba) return <Loading />;
          if (f.aba === 'participacao') {
            const max = Math.max(1, ...d.months.map((m) => m.enrollments + m.lessonsCompleted));
            return (
              <Table caption="Participação por mês" rowKey={(m) => m.month} rows={d.months} columns={[
                { key: 'm', label: 'Mês', render: (m) => m.month.split('-').reverse().join('/') },
                { key: 'e', label: 'Matrículas', num: true, render: (m) => m.enrollments },
                { key: 'l', label: 'Aulas concluídas', num: true, render: (m) => m.lessonsCompleted },
                { key: 'c', label: 'Certificados', num: true, render: (m) => m.certificates },
                { key: 'g', label: 'Atividade', render: (m) => <Progress value={Math.round(((m.enrollments + m.lessonsCompleted) / max) * 100)} label={`Atividade relativa de ${m.month}`} /> },
              ]} />
            );
          }
          if (f.aba === 'certificados') {
            return (
              <Table caption="Certificados" rows={d.items} columns={[
                { key: 'n', label: 'Pessoa', render: (c) => <span className="adm-cell-main"><b>{c.user.name}</b><small>{c.user.email}</small></span> },
                ...(institutions ? [{ key: 'i', label: 'Instituição', render: (c) => c.institution }] : []),
                { key: 'c', label: 'Coleção', render: (c) => c.collection },
                { key: 'k', label: 'Código', render: (c) => <code>{c.verificationCode}</code> },
                { key: 'd', label: 'Emitido', render: (c) => fmtData(c.issuedAt) },
                { key: 's', label: 'Situação', render: (c) => (c.revokedAt ? <Badge status="revoked" /> : <Badge tone="success">Válido</Badge>) },
              ]} footer={<Pager page={d.page} pages={d.pages} total={d.total} onPage={(p) => setF({ page: String(p) })} />} />
            );
          }
          return (
            <Table caption="Matrículas" rowKey={(r) => r.enrollmentId} rows={d.items} columns={[
              { key: 'n', label: 'Pessoa', render: (r) => <span className="adm-cell-main"><b>{linkMatricula ? <Link to={linkMatricula(r.enrollmentId)}>{r.user.name}</Link> : r.user.name}</b><small>{r.user.email}</small></span> },
              ...(institutions ? [{ key: 'i', label: 'Instituição', render: (r) => r.institution.name }] : []),
              { key: 'c', label: 'Coleção', render: (r) => r.collection.title },
              { key: 'p', label: 'Progresso', render: (r) => <span style={{ display: 'grid', gap: 4, minWidth: 110 }}><small>{r.progress?.requiredCompleted ?? 0}/{r.progress?.requiredTotal ?? 0} · {r.progress?.percent ?? 0}%</small><Progress value={r.progress?.percent ?? 0} /></span> },
              { key: 's', label: 'Situação', render: (r) => <Badge status={situacao(r)}>{SITUACAO[situacao(r)]}</Badge> },
              { key: 'm', label: 'Matrícula', render: (r) => <Badge status={r.status} /> },
              { key: 'd', label: 'Matriculado', render: (r) => fmtData(r.enrolledAt) },
              { key: 'k', label: 'Certificado', render: (r) => (r.certificate && !r.certificate.revokedAt ? <code>{r.certificate.verificationCode}</code> : '—') },
            ]} footer={<Pager page={d.page} pages={d.pages} total={d.total} onPage={(p) => setF({ page: String(p) })} />} />
          );
        }}
      </Async>
    </>
  );
}
