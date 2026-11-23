import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { ChatImageAttachment } from '../types/chat.js';
import { isPathAllowed } from './filesService.js';

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_MEDIA_READ_BYTES = 20 * 1024 * 1024; // 20 MB

export const ALLOWED_UPLOAD_IMAGE_MIMES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
};

export const getUploadsDirectory = (): string => {
  if (process.env.KRAKEN_UPLOADS_DIR && process.env.KRAKEN_UPLOADS_DIR.trim()) {
    return path.resolve(process.env.KRAKEN_UPLOADS_DIR.trim());
  }
  return path.resolve(process.cwd(), 'data', 'uploads');
};

export const detectImageMimeFromMagicBytes = (buffer: Buffer): string | null => {
  if (!buffer || buffer.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: GIF87a ou GIF89a
  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'image/gif';
    }
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
};

export const sanitizeSegment = (input: string, fallback: string): string => {
  const cleaned = input.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.+/g, '.').replace(/^[._-]+|[._-]+$/g, '');
  return cleaned ? cleaned.slice(0, 80) : fallback;
};

export interface SaveUploadedImageInput {
  filename?: string;
  mimeType?: string;
  dataBase64: string;
  conversationId?: string;
}

export class ImageUploadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ImageUploadError';
    this.statusCode = statusCode;
  }
}

export const saveUploadedImage = async (input: SaveUploadedImageInput): Promise<ChatImageAttachment> => {
  const rawBase64 = typeof input.dataBase64 === 'string' ? input.dataBase64.trim() : '';
  if (!rawBase64) {
    throw new ImageUploadError('Conteúdo da imagem (dataBase64) é obrigatório.', 400);
  }

  let declaredMime = (input.mimeType || '').trim().toLowerCase();
  let base64Payload = rawBase64;

  const dataUrlMatch = rawBase64.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    if (!declaredMime) {
      declaredMime = dataUrlMatch[1].trim().toLowerCase();
    }
    base64Payload = dataUrlMatch[2].trim();
  }

  if (declaredMime && !ALLOWED_UPLOAD_IMAGE_MIMES[declaredMime]) {
    throw new ImageUploadError(
      `Formato de imagem não suportado (${declaredMime}). Use PNG, JPEG, WebP ou GIF.`,
      400
    );
  }

  // Estimativa rápida antes de alocar buffer grande
  const estimatedBytes = Math.ceil((base64Payload.length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_UPLOAD_BYTES + 1024) {
    throw new ImageUploadError('Imagem excede o limite máximo permitido de 10MB.', 413);
  }

  const buffer = Buffer.from(base64Payload, 'base64');
  if (!buffer.length) {
    throw new ImageUploadError('Dados base64 inválidos ou vazios.', 400);
  }

  if (buffer.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImageUploadError('Imagem excede o limite máximo permitido de 10MB.', 413);
  }

  const detectedMime = detectImageMimeFromMagicBytes(buffer);
  if (!detectedMime || !ALLOWED_UPLOAD_IMAGE_MIMES[detectedMime]) {
    throw new ImageUploadError(
      'Arquivo inválido: o conteúdo binário não corresponde a uma imagem PNG, JPEG, WebP ou GIF válida.',
      400
    );
  }

  const normalizedDeclared = declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime;
  if (normalizedDeclared && normalizedDeclared !== detectedMime) {
    throw new ImageUploadError(
      `Tipo MIME declarado (${declaredMime}) diverge do conteúdo real da imagem (${detectedMime}).`,
      400
    );
  }

  const ext = ALLOWED_UPLOAD_IMAGE_MIMES[detectedMime];
  const id = randomUUID();
  const safeConvDir = sanitizeSegment(input.conversationId || 'shared', 'shared');
  const uploadsRoot = getUploadsDirectory();
  const targetDir = path.join(uploadsRoot, safeConvDir);

  if (!fsSync.existsSync(targetDir)) {
    await fs.mkdir(targetDir, { recursive: true });
  }

  const originalName = (input.filename || `imagem.${ext}`).trim();
  const baseNameWithoutExt = path.basename(originalName, path.extname(originalName));
  const safeBaseName = sanitizeSegment(baseNameWithoutExt, 'imagem');
  const storedFileName = `${id}-${safeBaseName}.${ext}`;
  const fullPath = path.resolve(targetDir, storedFileName);

  await fs.writeFile(fullPath, buffer);

  return {
    id,
    name: originalName || `${safeBaseName}.${ext}`,
    mimeType: detectedMime,
    size: buffer.length,
    path: fullPath,
    url: `/api/files/media?path=${encodeURIComponent(fullPath)}`
  };
};

export const sanitizeChatAttachments = (raw: unknown): ChatImageAttachment[] => {
  if (!Array.isArray(raw)) return [];
  const valid: ChatImageAttachment[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<ChatImageAttachment>;
    const filePath = typeof candidate.path === 'string' ? candidate.path.trim() : '';
    if (!filePath || !isPathAllowed(filePath)) continue;

    const ext = path.extname(filePath).toLowerCase();
    const mimeFromExt = MEDIA_MIME_BY_EXTENSION[ext];
    const mimeType = typeof candidate.mimeType === 'string' && candidate.mimeType.startsWith('image/')
      ? candidate.mimeType
      : (mimeFromExt || 'image/png');

    valid.push({
      id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : randomUUID(),
      name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : path.basename(filePath),
      mimeType,
      size: typeof candidate.size === 'number' && Number.isFinite(candidate.size) && candidate.size >= 0 ? candidate.size : 0,
      path: path.resolve(filePath),
      url: `/api/files/media?path=${encodeURIComponent(path.resolve(filePath))}`
    });
  }

  return valid;
};

export const buildPromptWithAttachments = (
  prompt: string,
  attachments: ChatImageAttachment[]
): string => {
  const trimmedPrompt = (prompt || '').trim();
  if (!attachments || attachments.length === 0) {
    return trimmedPrompt;
  }

  const lines = attachments.map(
    (att, idx) => `${idx + 1}. ${att.name} (${att.mimeType}): ${att.path}`
  );
  const attachmentsBlock = [
    '[IMAGENS ANEXADAS PELO USUÁRIO]:',
    ...lines,
    'Use a ferramenta read_file no(s) caminho(s) acima para visualizar a(s) imagem(ns) antes de responder.'
  ].join('\n');

  if (!trimmedPrompt) {
    return `${attachmentsBlock}\n\nAnalise a(s) imagem(ns) anexada(s) pelo usuário e responda de forma útil.`;
  }

  return `${trimmedPrompt}\n\n${attachmentsBlock}`;
};

export const getMediaMimeType = (filePath: string): string | null => {
  const ext = path.extname(filePath).toLowerCase();
  return MEDIA_MIME_BY_EXTENSION[ext] || null;
};
