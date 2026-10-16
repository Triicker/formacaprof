import { MediaAsset } from '@prisma/client';

type AssetRef = Pick<MediaAsset, 'id' | 'storageProvider' | 'storageKey' | 'visibility'> | null | undefined;

/**
 * URL entregue ao frontend. Arquivos públicos estáticos (capas, miniaturas) vão direto;
 * todo o resto passa pelo portão /media/:id, que confere a permissão a cada requisição.
 * Links externos de vídeo nunca aparecem nas respostas da API.
 */
export function mediaUrl(asset: AssetRef): string | null {
  if (!asset) return null;
  if (asset.storageProvider === 'static' && asset.visibility === 'public') return asset.storageKey;
  return `/api/v1/media/${asset.id}`;
}

export const MEDIA_REF_SELECT = { id: true, storageProvider: true, storageKey: true, visibility: true } as const;

export function isProvisional(metadata: unknown): boolean {
  return !!metadata && typeof metadata === 'object' && (metadata as { editorial?: string }).editorial === 'placeholder';
}
