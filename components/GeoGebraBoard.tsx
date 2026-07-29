import React, { useEffect, useRef } from 'react';

interface GeoGebraBoardProps {
  onReady: () => void;
}

const GeoGebraBoard: React.FC<GeoGebraBoardProps> = ({ onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appletRef = useRef<any>(null);
  const isReadyCalledRef = useRef(false);

  useEffect(() => {
    // Only initialize once
    if (appletRef.current) return;

    const handleReady = () => {
      if (isReadyCalledRef.current) return;
      isReadyCalledRef.current = true;
      console.log('GeoGebra Engine Ready');
      try {
        if (window.ggbApplet) {
          window.ggbApplet.setGridVisible(true);
          window.ggbApplet.setAxesVisible(true, true);
        }
      } catch (e) {
        console.warn('Could not set default grid/axes:', e);
      }
      onReady();
    };

    // Register global callback that GeoGebra will call by name
    (window as any).ggbOnInit = () => {
      handleReady();
    };

    const doInject = () => {
      if (!window.GGBApplet) {
        setTimeout(doInject, 300);
        return;
      }

      if (!containerRef.current) return;

      const parameters = {
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
        useBrowserForJS: true,   // REQUIRED for HTTPS / Vercel to fire JS callbacks
        borderColor: null,
        capturingThreshold: null,
        perspective: 'G',
        appletOnLoad: 'ggbOnInit',
      };

      const applet = new window.GGBApplet(parameters, '5.0');
      appletRef.current = applet;
      applet.inject(containerRef.current.id);

      // Fallback polling - in case ggbOnInit callback is missed
      let waited = 0;
      const poll = setInterval(() => {
        waited += 400;
        if (
          window.ggbApplet &&
          typeof window.ggbApplet.evalCommand === 'function' &&
          typeof window.ggbApplet.reset === 'function'
        ) {
          clearInterval(poll);
          handleReady();
        }
        if (waited >= 20000) clearInterval(poll);
      }, 400);
    };

    doInject();

    return () => {
      // Cleanup global callback on unmount
      delete (window as any).ggbOnInit;
    };
  }, []); // Empty deps - only run once on mount

  return (
    <div className="w-full h-full relative bg-slate-50">
      {/* Container for GeoGebra */}
      <div
        id="ggb-element"
        ref={containerRef}
        className="absolute inset-0 z-10"
      />

      {/* Background watermark */}
      <div className="absolute inset-0 flex items-center justify-center text-slate-300 pointer-events-none z-0">
        <span className="font-bold text-4xl opacity-20 tracking-widest">GEOGEBRA</span>
      </div>
    </div>
  );
};

export default GeoGebraBoard;