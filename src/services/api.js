// Ponto único de acesso a dados. As telas importam apenas daqui.
// VITE_API_MODE=mock  -> dados locais no navegador (padrão, demonstração)
// VITE_API_MODE=http  -> API real (backend/), via /api/v1 no mesmo domínio
import { mockApi } from './mockApi';
import { httpApi } from './httpApi';

export const API_MODE = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock';
export const api = API_MODE === 'http' ? httpApi : mockApi;
