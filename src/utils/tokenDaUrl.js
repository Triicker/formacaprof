import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/** Lê ?token= uma única vez e o remove da barra de endereço (não fica no histórico nem vaza em links). */
export function useTokenDaUrl() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') || '');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (params.has('token')) navigate(pathname, { replace: true });
  }, [params, navigate, pathname]);
  return token;
}
