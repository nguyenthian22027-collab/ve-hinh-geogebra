import React, { useEffect, useRef, useCallback } from 'react';

interface GeoGebraBoardProps {
  onReady: () => void;
}

const GeoGebraBoard: React.FC<GeoGebraBoardProps> = ({ onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appletRef = useRef<any>(null);
  const isReadyCalledRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleReady = useCallback(() => {
    if (isReadyCalledRef.current) return;
    isReadyCalledRef.current = true;

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    console.log('[GGB] Engine ready');
    try {
      if (window.ggbApplet) {
        window.ggbApplet.setGridVisible(true);
        window.ggbApplet.setAxesVisible(true, true);
      }
    } catch (e) {
      console.warn('[GGB] Could not configure defaults:', e);
    }

    onReady();
  }, [onReady]);

  useEffect(() => {
    if (appletRef.current) return;

    // Register global callbacks GeoGebra will call
    (window as any).ggbOnInit = () => handleReady();
    (window as any).ggbAppletOnLoad = () => handleReady();

    const startPolling = () => {
      let waited = 0;
      pollRef.current = setInterval(() => {
        waited += 500;

        const applet = window.ggbApplet;
        if (
          applet &&
          typeof applet.evalCommand === 'function' &&
          typeof applet.reset === 'function' &&
          typeof applet.setVisible === 'function'
        ) {
          handleReady();
          return;
        }

        // After 30s give up polling (but don't call onReady - GGB truly failed)
        if (waited >= 30000 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 500);
    };

    const injectGGB = () => {
      if (!window.GGBApplet) {
        setTimeout(injectGGB, 300);
        return;
      }

      if (!containerRef.current || appletRef.current) return;

      const params = {
        id: 'ggbApplet',
        appName: 'geometry',
        width: 1200,
        height: 800,
        showToolBar: true,
        showMenuBar: false,
        showAlgebraInput: true,
        showResetIcon: true,
        enableLabelDrags: true,
        enableShiftDragZoom: true,
        enableRightClick: true,
        showLogging: false,
        useBrowserForJS: true,
        borderColor: null,
        capturingThreshold: null,
        perspective: 'G',
        appletOnLoad: 'ggbOnInit',
      };

      const applet = new window.GGBApplet(params, '5.0');
      appletRef.current = applet;
      applet.inject(containerRef.current.id);

      // Start polling as a safety net
      startPolling();
    };

    // If deployggb.js is already loaded, inject immediately
    // Otherwise wait for it (it's loaded in index.html)
    if (document.readyState === 'complete') {
      injectGGB();
    } else {
      window.addEventListener('load', injectGGB, { once: true });
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      delete (window as any).ggbOnInit;
      delete (window as any).ggbAppletOnLoad;
    };
  }, [handleReady]);

  return (
    <div className="w-full h-full relative bg-slate-50">
      <div
        id="ggb-element"
        ref={containerRef}
        className="absolute inset-0 z-10"
      />
      <div className="absolute inset-0 flex items-center justify-center text-slate-200 pointer-events-none z-0">
        <span className="font-bold text-5xl tracking-widest select-none">GEOGEBRA</span>
      </div>
    </div>
  );
};

export default GeoGebraBoard;