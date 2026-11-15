import { useState, useEffect } from 'react';

export interface ViewportState {
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const getViewportWidth = (): number => {
  if (typeof window === 'undefined') return 1280;
  return window.innerWidth;
};

/**
 * Hook reativo para detectar os breakpoints responsivos do KrakenBridge-Web:
 * - Mobile: < 768px (< md)
 * - Tablet: 768px .. 1023px (md .. < lg)
 * - Desktop: >= 1024px (>= lg)
 */
export const useViewport = (): ViewportState => {
  const [width, setWidth] = useState<number>(() => getViewportWidth());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateWidth = () => {
      setWidth(window.innerWidth);
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);

    const mqMobile = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 767px)') : null;
    const mqDesktop = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)') : null;

    mqMobile?.addEventListener?.('change', updateWidth);
    mqDesktop?.addEventListener?.('change', updateWidth);

    return () => {
      window.removeEventListener('resize', updateWidth);
      mqMobile?.removeEventListener?.('change', updateWidth);
      mqDesktop?.removeEventListener?.('change', updateWidth);
    };
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024
  };
};
