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
};
