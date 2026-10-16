// Chamadas dos painéis de gestão. Toda autorização é do backend: estas funções só organizam as chamadas.
import { apiRequest as req } from '../services/httpApi';

export const qs = (params = {}) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return s ? `?${s}` : '';
};

export const adminApi = {
  // ---------- 4A: administração básica ----------
  dashboard: (p) => req('GET', `/admin/dashboard${qs(p)}`),
  institutions: (p) => req('GET', `/admin/institutions${qs(p)}`),
  institution: (id) => req('GET', `/admin/institutions/${id}`),
  createInstitution: (d) => req('POST', '/institutions', d),
  updateInstitution: (id, d) => req('PATCH', `/institutions/${id}`, d),
  organizations: () => req('GET', '/organizations'),
  createOrganization: (d) => req('POST', '/organizations', d),

  members: (instId, p) => req('GET', `/institutions/${instId}/members${qs(p)}`),
  updateMember: (instId, membershipId, d) => req('PATCH', `/institutions/${instId}/members/${membershipId}`, d),
  invitations: (instId) => req('GET', `/institutions/${instId}/invitations`),
  invite: (instId, d) => req('POST', `/institutions/${instId}/invitations`, d),
  resendInvitation: (instId, id) => req('POST', `/institutions/${instId}/invitations/${id}/resend`),
  revokeInvitation: (instId, id) => req('DELETE', `/institutions/${instId}/invitations/${id}`),
  allInvitations: (p) => req('GET', `/admin/invitations${qs(p)}`),

  coordinators: (p) => req('GET', `/admin/coordinators${qs(p)}`),
  assignCoordinator: (instId, userId) => req('POST', `/admin/institutions/${instId}/coordinators`, { userId }),

  users: (p) => req('GET', `/users${qs(p)}`),
  user: (id) => req('GET', `/users/${id}`),
  updateUser: (id, d) => req('PATCH', `/users/${id}`, d),
  revokeSessions: (id) => req('POST', `/users/${id}/sessions/revoke`),
  // 401 aqui significa "senha atual incorreta", não sessão expirada.
  setPlatformRole: (id, d) => req('PUT', `/users/${id}/platform-role`, d, { silencioso401: true }),

  audit: (p) => req('GET', `/audit-logs${qs(p)}`),

  // ---------- 4B: conteúdos, mídia e liberação ----------
  collections: () => req('GET', '/admin/collections'),
  collection: (id) => req('GET', `/admin/collections/${id}`),
  createCollection: (d) => req('POST', '/admin/collections', d),
  updateCollection: (id, d) => req('PATCH', `/admin/collections/${id}`, d),
  createModule: (colId, d) => req('POST', `/admin/collections/${colId}/modules`, d),
  updateModule: (id, d) => req('PATCH', `/admin/modules/${id}`, d),
  deleteModule: (id) => req('DELETE', `/admin/modules/${id}`),
  reorderModules: (colId, ids) => req('PUT', `/admin/collections/${colId}/modules/order`, { ids }),
  createLesson: (modId, d) => req('POST', `/admin/modules/${modId}/lessons`, d),
  updateLesson: (id, d) => req('PATCH', `/admin/lessons/${id}`, d),
  deleteLesson: (id) => req('DELETE', `/admin/lessons/${id}`),
  reorderLessons: (modId, ids) => req('PUT', `/admin/modules/${modId}/lessons/order`, { ids }),
  setAccess: (instId, colId, d) => req('PUT', `/admin/institutions/${instId}/collections/${colId}/access`, d),

  media: (p) => req('GET', `/admin/media${qs(p)}`),
  registerExternal: (d) => req('POST', '/admin/media/external', d),
  updateMedia: (id, d) => req('PATCH', `/admin/media/${id}`, d),
  deleteMedia: (id) => req('DELETE', `/admin/media/${id}`),
  uploadMedia: (file, fields, onProgress) => enviarArquivo('/admin/media/upload', file, fields, onProgress),
  replaceMedia: (id, file, onProgress) => enviarArquivo(`/admin/media/${id}/replace`, file, {}, onProgress),

  // ---------- 4C: relatórios, histórico e correções (administração) ----------
  reportEnrollments: (p) => req('GET', `/admin/reports/enrollments${qs(p)}`),
  reportCertificates: (p) => req('GET', `/admin/reports/certificates${qs(p)}`),
  reportParticipation: (p) => req('GET', `/admin/reports/participation${qs(p)}`),
  exportEnrollments: (p) => baixar(`/admin/reports/enrollments${qs({ ...p, format: 'csv' })}`),
  enrollment: (id) => req('GET', `/admin/enrollments/${id}`),
  correctProgress: (id, d) => req('POST', `/admin/enrollments/${id}/progress-corrections`, d),
  revokeCertificate: (id, justification) => req('POST', `/admin/certificates/${id}/revoke`, { justification }),
};

/** Chamadas da coordenação: sempre na instituição da URL (o backend confere o vínculo). */
export const coordApi = {
  dashboard: (inst) => req('GET', `/institutions/${inst}/dashboard`),
  teachers: (inst, p) => req('GET', `/institutions/${inst}/teachers${qs(p)}`),
  collections: (inst) => req('GET', `/institutions/${inst}/collections`),
  catalog: () => req('GET', '/collections'),
  collectionEnrollments: (inst, colId) => req('GET', `/institutions/${inst}/collections/${colId}/enrollments`),
  enroll: (inst, d) => req('POST', `/institutions/${inst}/enrollments`, d),
  setEnrollment: (inst, id, status) => req('PATCH', `/institutions/${inst}/enrollments/${id}`, { status }),
  enrollmentProgress: (inst, id) => req('GET', `/institutions/${inst}/enrollments/${id}/progress`),
  requestAccess: (inst, colId, message) => req('POST', `/institutions/${inst}/collections/${colId}/access-requests`, message ? { message } : {}),
  members: (inst, p) => req('GET', `/institutions/${inst}/members${qs(p)}`),
  updateMember: (inst, id, d) => req('PATCH', `/institutions/${inst}/members/${id}`, d),
  invitations: (inst) => req('GET', `/institutions/${inst}/invitations`),
  resendInvitation: (inst, id) => req('POST', `/institutions/${inst}/invitations/${id}/resend`),
  revokeInvitation: (inst, id) => req('DELETE', `/institutions/${inst}/invitations/${id}`),
  reportEnrollments: (inst, p) => req('GET', `/institutions/${inst}/reports/enrollments${qs(p)}`),
  reportCertificates: (inst, p) => req('GET', `/institutions/${inst}/reports/certificates${qs(p)}`),
  reportParticipation: (inst, p) => req('GET', `/institutions/${inst}/reports/participation${qs(p)}`),
  exportEnrollments: (inst, p) => baixar(`/institutions/${inst}/reports/enrollments${qs({ ...p, format: 'csv' })}`),
};

/** Download autenticado (cookie de sessão) de um arquivo gerado pela API, ex.: CSV. */
async function baixar(path) {
  const res = await fetch(`${(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')}${path}`, { credentials: 'same-origin' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Não foi possível gerar o arquivo.');
  }
  const nome = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'relatorio.csv';
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Upload multipart com progresso (XHR). Mesma sessão em cookie e o cabeçalho CSRF exigido pela API. */
function enviarArquivo(path, file, fields, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(fields ?? {})) if (v !== '' && v != null) fd.append(k, v);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Protection', '1');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* sem corpo */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      const msg = Array.isArray(data?.message) ? data.message[0] : data?.message;
      reject(new Error(xhr.status === 413 ? 'Arquivo grande demais para envio pela API.' : (msg || 'Falha no envio do arquivo.')));
    };
    xhr.onerror = () => reject(new Error('Falha de conexão durante o envio.'));
    xhr.send(fd);
  });
}

/**
 * Executa uma alteração que pode afetar pessoas matriculadas. Se a API pedir confirmação
 * (409 IMPACT_CONFIRMATION_REQUIRED), chama `pedirConfirmacao(impacto, mensagem)`, que deve
 * devolver a justificativa (ou null para cancelar), e repete a chamada com a confirmação.
 */
export async function comConfirmacaoDeImpacto(fn, pedirConfirmacao) {
  try {
    return await fn({});
  } catch (e) {
    if (e.code !== 'IMPACT_CONFIRMATION_REQUIRED') throw e;
    const justificativa = await pedirConfirmacao(e.detalhes?.impact ?? {}, e.message);
    if (!justificativa) return null;
    return fn({ confirmImpact: true, justification: justificativa });
  }
}
