import React, { useEffect } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

interface ImageLightboxModalProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({ src, alt, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const caption = alt?.trim() || 'Imagem';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Visualização ampliada: ${caption}`}
      data-testid="image-lightbox-modal"
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-base-100/90 border border-base-300 shadow-lg text-xs text-base-content">
          <span className="truncate font-medium max-w-[60vw]" title={caption}>
            {caption}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={src}
              download={caption}
              className="btn btn-ghost btn-xs gap-1"
              title="Baixar imagem"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Baixar</span>
            </a>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-xs gap-1"
              title="Abrir em nova aba"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Abrir</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-xs btn-circle"
              aria-label="Fechar visualização"
              data-testid="image-lightbox-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <img
          src={src}
          alt={caption}
          className="max-w-full max-h-[76vh] object-contain rounded-xl border border-base-300/60 shadow-2xl bg-base-200/30"
        />
      </div>
    </div>
  );
};
