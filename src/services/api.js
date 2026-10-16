// Ponto único de acesso a dados. As telas importam apenas daqui.
// VITE_API_MODE=mock  -> dados locais (padrão)
// VITE_API_MODE=http  -> backend real (a implementar em httpApi.js)
import { mockApi } from './mockApi';
import { httpApi } from './httpApi';

export const api = import.meta.env.VITE_API_MODE === 'http' ? httpApi : mockApi;
