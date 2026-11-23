const SAFE_DATA_IMAGE_REGEX = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i;
const IMAGE_EXTENSION_REGEX = /\.(?:png|jpe?g|webp|gif|svg|avif|bmp|ico)(?:[?#].*)?$/i;

export const isSafeDataImageUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  return SAFE_DATA_IMAGE_REGEX.test(url.trim());
};

export const isLocalImageSource = (src: string): boolean => {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith('/api/files/media') || trimmed.startsWith('/chat/api/files/media')) {
    return false;
  }
  return (
    trimmed.startsWith('file:') ||
    trimmed.startsWith('/workspace/') ||
    trimmed.startsWith('/app/') ||
    trimmed.startsWith('/DATA/') ||
    trimmed.startsWith('/root/.gemini/') ||
    trimmed.startsWith('/tmp/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    IMAGE_EXTENSION_REGEX.test(trimmed)
  );
};

export interface ResolveImageUrlOptions {
  subproject?: string;
  apiBase?: string;
  token?: string | null;
}

export const resolveImageUrl = (src: string, options: ResolveImageUrlOptions = {}): string => {
  const trimmed = (src || '').trim();
  if (!trimmed) return '';

  const apiBase = options.apiBase || (
    typeof window !== 'undefined' && window.location.pathname.startsWith('/chat')
      ? '/chat/api'
      : '/api'
  );
  const token = options.token !== undefined
    ? options.token
    : (typeof window !== 'undefined' ? localStorage.getItem('kraken_pin_token') : null);

  if (/^https?:\/\//i.test(trimmed) || /^blob:/i.test(trimmed)) {
    return trimmed;
  }

  if (isSafeDataImageUrl(trimmed)) {
    return trimmed;
  }

  if (/^data:/i.test(trimmed)) {
    // Bloqueia data URLs potencialmente perigosas (ex: data:image/svg+xml, data:text/html)
    return '';
  }

  // Já é uma URL da nossa própria rota de mídia -> normaliza prefixo e anexa token se necessário
  if (trimmed.startsWith('/api/files/media') || trimmed.startsWith('/chat/api/files/media')) {
    const queryIdx = trimmed.indexOf('?');
    const queryPart = queryIdx >= 0 ? trimmed.slice(queryIdx + 1) : '';
    const params = new URLSearchParams(queryPart);
    if (options.subproject && !params.has('subproject')) {
      params.set('subproject', options.subproject);
    }
    if (token && !params.has('token')) {
      params.set('token', token);
    }
    return `${apiBase}/files/media?${params.toString()}`;
  }

  if (isLocalImageSource(trimmed)) {
    let cleanPath = trimmed;
    if (cleanPath.startsWith('file://')) {
      cleanPath = cleanPath.slice(7);
    } else if (cleanPath.startsWith('file:')) {
      cleanPath = cleanPath.slice(5);
    }
    const params = new URLSearchParams();
    params.set('path', cleanPath);
    if (options.subproject) {
      params.set('subproject', options.subproject);
    }
    if (token) {
      params.set('token', token);
    }
    return `${apiBase}/files/media?${params.toString()}`;
  }

  return trimmed;
};

export const formatImageBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
