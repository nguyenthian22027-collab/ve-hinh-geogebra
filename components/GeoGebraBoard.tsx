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
      console.log("GeoGebra Loaded");
      if (window.ggbApplet) {
        try {
          window.ggbApplet.setGridVisible(true);
          window.ggbApplet.setAxesVisible(true, true);
        } catch (e) {
          console.warn("Could not set default grid/axes:", e);
        }
      }
      onReady();
    };

    // Attach global callback for GeoGebra engine
    window.ggbAppletOnLoad = (id: string) => {
      handleReady();
    };

    const initGGB = () => {
      if (window.GGBApplet) {
        const parameters = {
          "id": "ggbApplet",
          "width": 1200, // Initial, will be responsive via CSS
          "height": 800,
          "showToolBar": true,
          "borderColor": null,
          "showMenuBar": false,
          "showAlgebraInput": true,
          "showResetIcon": true,
          "enableLabelDrags": true,
          "enableShiftDragZoom": true,
          "enableRightClick": true,
          "capturingThreshold": null,
          "showLogging": false,
          "useBrowserForJS": false,
          "perspective": "Geometry", // Force Geometry perspective
          "appName": "geometry",
          "appletOnLoad": "ggbAppletOnLoad"
        };

        const applet = new window.GGBApplet(parameters, '5.0');
        appletRef.current = applet;
        
        if (containerRef.current) {
          applet.inject(containerRef.current.id);
        }

        // Safety fallback poll in case ggbAppletOnLoad event is missed
        const checkInterval = setInterval(() => {
          if (window.ggbApplet && typeof window.ggbApplet.evalCommand === 'function') {
            clearInterval(checkInterval);
            handleReady();
          }
        }, 500);

        setTimeout(() => clearInterval(checkInterval), 15000);
      } else {
        // Retry if script hasn't loaded yet
        setTimeout(initGGB, 500);
      }
    };

    initGGB();

  }, [onReady]);

  return (
    <div className="w-full h-full relative bg-slate-50">
      {/* Container for GeoGebra - Absolute positioning to fill parent */}
      <div 
        id="ggb-element" 
        ref={containerRef} 
        className="absolute inset-0 z-10"
      />
      
      {/* Watermark/Placeholder if GGB loads slowly */}
      <div className="absolute inset-0 flex items-center justify-center text-slate-300 pointer-events-none z-0">
        <span className="font-bold text-4xl opacity-20 tracking-widest">GEOGEBRA</span>
      </div>
    </div>
  );
};

export default GeoGebraBoard;