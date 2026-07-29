import React, { useState, useCallback, useRef, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import GeoGebraBoard from './components/GeoGebraBoard';
import { generateGeoGebraCommands } from './services/geminiService';
import { LogMessage } from './types';

function App() {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGgbReady, setIsGgbReady] = useState(false);

  // Lưu alias cho các lệnh GeoGebra trả về nhiều đối tượng.
  // Ví dụ: tangentsA = Tangent(A, circleO) có thể tạo 2 đường tiếp tuyến.
  const multiObjectAliases = useRef<Record<string, string[]>>({});

  // Fallback: nếu GeoGebra không gọi callback sau 20s, tự tắt màn hình chờ
  useEffect(() => {
    if (isGgbReady) return;
    const timer = setTimeout(() => {
      setIsGgbReady(true);
      addLog('GeoGebra engine timed out – some features may be limited.', 'warning');
    }, 20000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGgbReady]);

  const addLog = useCallback((text: string, type: LogMessage['type'] = 'info') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      text,
      type,
      timestamp: Date.now()
    }]);
  }, []);

  const handleClear = () => {
    if (window.ggbApplet) {
      window.ggbApplet.reset();
      multiObjectAliases.current = {};
      addLog('Canvas cleared', 'info');
    }
  };

  const splitLabels = (labels: string | undefined | null): string[] => {
    if (!labels) return [];
    return labels
      .split(',')
      .map(label => label.trim())
      .filter(Boolean);
  };

  const getAliasObjects = (name: string): string[] => {
    const cleanName = name.trim();
    return multiObjectAliases.current[cleanName] || [cleanName];
  };

  const applyToObjects = (objectName: string, action: (obj: string) => void): boolean => {
    const objects = getAliasObjects(objectName);
    let ok = false;

    for (const obj of objects) {
      try {
        action(obj);
        ok = true;
      } catch (e) {
        // Nếu một object chưa tồn tại thì thử object khác trong alias.
      }
    }

    return ok;
  };

  const normalizeCommand = (originalCmd: string): string => {
    let cmd = originalCmd.trim();

    // Bỏ dấu chấm phẩy cuối dòng nếu AI sinh ra.
    cmd = cmd.replace(/;+$/, '').trim();

    // Fix: A = Point(0, 0) -> A = (0, 0)
    cmd = cmd.replace(/=\s*Point\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g, '= ($1, $2)');

    // Fix: Reflection -> Reflect
    cmd = cmd.replace(/^Reflection\(/, 'Reflect(');
    cmd = cmd.replace(/=\s*Reflection\(/, '= Reflect(');

    // Fix một số tên lệnh AI hay viết sai.
    cmd = cmd.replace(/^MidPoint\(/, 'Midpoint(');
    cmd = cmd.replace(/=\s*MidPoint\(/, '= Midpoint(');
    cmd = cmd.replace(/^CircleArc\(/, 'CircularArc(');
    cmd = cmd.replace(/=\s*CircleArc\(/, '= CircularArc(');

    return cmd;
  };


  const sanitizeCaption = (rawCaption: string, fallbackName: string): string => {
  let caption = rawCaption.trim();

  // Nếu đã là LaTeX đúng dạng "$\Large{X}$" thì giữ nguyên
  if (/^\$.*\$$/.test(caption)) {
    return caption;
  }

  // Sửa các dạng Gemini sinh sai: LaTeX không có dấu $
  caption = caption
    .replace(/\\\\Large\s*\{([^}]+)\}/g, '$1')
    .replace(/\\Large\s*\{([^}]+)\}/g, '$1')
    .replace(/Large\s*\{([^}]+)\}/g, '$1')
    .replace(/^Large([A-Za-z0-9_]+)$/g, '$1')
    .trim();

  if (!caption) return fallbackName.trim();
  return caption;
};
  const executeCommand = (originalCmd: string): boolean => {
    if (!window.ggbApplet) return false;

    const cmd = normalizeCommand(originalCmd);

    // 0. Lệnh sinh nhiều đối tượng: Tangent, AngleBisector(line,line)
    // Không để GeoGebra phải gán list vào một biến rồi dùng sai như một đường thẳng.
    const multiOutputAssignment = cmd.match(/^(\w+)\s*=\s*(Tangent|AngleBisector)\((.*)\)$/);
    if (multiOutputAssignment && typeof window.ggbApplet.evalCommandGetLabels === 'function') {
      const [, alias, commandName, args] = multiOutputAssignment;
      try {
        const labels = splitLabels(window.ggbApplet.evalCommandGetLabels(`${commandName}(${args})`));
        if (labels.length > 0) {
          multiObjectAliases.current[alias] = labels;
          return true;
        }
      } catch (e) {
        // Fallthrough sang evalCommand thường.
      }
    }

    // 0.1. Sửa trường hợp AI dùng alias nhiều đối tượng trong Intersect.
    // Ví dụ: B = Intersect(tangentsA, circleO, 1)
    // Nếu tangentsA gồm [a, b], chuyển thành B = Intersect(a, circleO)
    const intersectAlias = cmd.match(/^(\w+)\s*=\s*Intersect\(\s*(\w+)\s*,\s*([^,]+?)\s*,\s*(\d+)\s*\)$/);
    if (intersectAlias) {
      const [, target, alias, otherObj, rawIndex] = intersectAlias;
      const aliasObjects = multiObjectAliases.current[alias];
      const index = parseInt(rawIndex, 10) - 1;
      if (aliasObjects && aliasObjects[index]) {
        return window.ggbApplet.evalCommand(`${target} = Intersect(${aliasObjects[index]}, ${otherObj.trim()})`);
      }
    }

    const intersectAliasReverse = cmd.match(/^(\w+)\s*=\s*Intersect\(\s*([^,]+?)\s*,\s*(\w+)\s*,\s*(\d+)\s*\)$/);
    if (intersectAliasReverse) {
      const [, target, otherObj, alias, rawIndex] = intersectAliasReverse;
      const aliasObjects = multiObjectAliases.current[alias];
      const index = parseInt(rawIndex, 10) - 1;
      if (aliasObjects && aliasObjects[index]) {
        return window.ggbApplet.evalCommand(`${target} = Intersect(${otherObj.trim()}, ${aliasObjects[index]})`);
      }
    }

    // 1. Handle Styling Commands via JS API.

    // SetPointSize(Obj, Size)
    const matchPointSize = cmd.match(/^SetPointSize\((.+?),\s*(\d+)\)$/);
    if (matchPointSize) {
      const [, obj, size] = matchPointSize;
      return applyToObjects(obj, objectName => window.ggbApplet.setPointSize(objectName, parseInt(size, 10)));
    }

    // SetColor(Obj, R, G, B)
    const matchColor = cmd.match(/^SetColor\((.+?),\s*(\d+),\s*(\d+),\s*(\d+)\)$/);
    if (matchColor) {
      const [, obj, r, g, b] = matchColor;
      return applyToObjects(obj, objectName => window.ggbApplet.setColor(objectName, parseInt(r, 10), parseInt(g, 10), parseInt(b, 10)));
    }

    // SetLineThickness(Obj, Thickness)
    const matchLineThickness = cmd.match(/^SetLineThickness\((.+?),\s*(\d+)\)$/);
    if (matchLineThickness) {
      const [, obj, thickness] = matchLineThickness;
      return applyToObjects(obj, objectName => window.ggbApplet.setLineThickness(objectName, parseInt(thickness, 10)));
    }

    // SetLineStyle(Obj, Style)
    const matchLineStyle = cmd.match(/^SetLineStyle\((.+?),\s*(\d+)\)$/);
    if (matchLineStyle) {
      const [, obj, style] = matchLineStyle;
      return applyToObjects(obj, objectName => window.ggbApplet.setLineStyle(objectName, parseInt(style, 10)));
    }

    // SetLabelMode(Obj, Mode)
    const matchLabelMode = cmd.match(/^SetLabelMode\((.+?),\s*(\d+)\)$/);
    if (matchLabelMode) {
      const [, obj, mode] = matchLabelMode;
      return applyToObjects(obj, objectName => window.ggbApplet.setLabelStyle(objectName, parseInt(mode, 10)));
    }

    // ShowLabel(Obj, Boolean)
    const matchShowLabel = cmd.match(/^ShowLabel\((.+?),\s*(true|false)\)$/i);
    if (matchShowLabel) {
      const [, obj, visibleStr] = matchShowLabel;
      return applyToObjects(obj, objectName => window.ggbApplet.setLabelVisible(objectName, visibleStr.toLowerCase() === 'true'));
    }

    // SetCaption(Obj, "Text")
    const matchCaption = cmd.match(/^SetCaption\((.+?),\s*"(.*)"\)$/);
    if (matchCaption) {
      const [, obj, rawCaption] = matchCaption;
      return applyToObjects(obj, objectName => {
        const caption = sanitizeCaption(rawCaption, objectName);
        window.ggbApplet.setCaption(objectName, caption);
        window.ggbApplet.setLabelStyle(objectName, 3);
        window.ggbApplet.setLabelVisible(objectName, true);
      });
    }

    // SetFilling(Obj, Alpha)
    const matchFilling = cmd.match(/^SetFilling\((.+?),\s*([0-9.]+)\)$/);
    if (matchFilling) {
      const [, obj, alpha] = matchFilling;
      return applyToObjects(obj, objectName => window.ggbApplet.setFilling(objectName, parseFloat(alpha)));
    }

    // SetVisible(Obj, Boolean)
    const matchVisible = cmd.match(/^SetVisible\((.+?),\s*(true|false)\)$/i);
    if (matchVisible) {
      const [, obj, visibleStr] = matchVisible;
      return applyToObjects(obj, objectName => window.ggbApplet.setVisible(objectName, visibleStr.toLowerCase() === 'true'));
    }

    // 2. Default: Eval Command via GGB Script.
    let success = window.ggbApplet.evalCommand(cmd);

    // Nếu command tạo nhiều label nhưng không có gán alias, vẫn coi là thành công nếu GeoGebra trả label.
    if (!success && typeof window.ggbApplet.evalCommandGetLabels === 'function') {
      try {
        const labels = splitLabels(window.ggbApplet.evalCommandGetLabels(cmd));
        success = labels.length > 0;
      } catch (e) {
        // Ignore.
      }
    }

    // Fallback: thử cú pháp [] cho một số bản GeoGebra cũ.
    if (!success && cmd.includes('(') && cmd.includes(')') && /^[a-zA-Z]+\(/.test(cmd)) {
      const altCmd = cmd.replace('(', '[').replace(/\)$/, ']');
      success = window.ggbApplet.evalCommand(altCmd);
    }

    return success;
  };

  const handleGenerate = async (prompt: string) => {
    if (!isGgbReady) {
      addLog('GeoGebra is not ready yet.', 'error');
      return;
    }

    setIsLoading(true);
    addLog(`Analyzing: "${prompt.substring(0, 40)}..."`, 'info');

    try {
      const commands = await generateGeoGebraCommands(prompt);

      addLog(`Generated ${commands.length} commands`, 'success');

      // Reset before drawing new shape.
      window.ggbApplet.reset();
      multiObjectAliases.current = {};

      for (const cmd of commands) {
        addLog(`> ${cmd}`, 'command');
        try {
          const success = executeCommand(cmd);

          if (success === false) {
            addLog(`Failed to execute: ${cmd}`, 'warning');
          }
        } catch (e: any) {
          console.error(e);
          addLog(`Error executing: ${cmd}`, 'error');
        }
        await new Promise(r => setTimeout(r, 50));
      }

    } catch (error: any) {
      addLog(error.message || 'An error occurred', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden font-sans">
      <Sidebar
        onGenerate={handleGenerate}
        onClear={handleClear}
        logs={logs}
        isLoading={isLoading}
      />
      <div className="flex-1 relative h-full">
        {!isGgbReady && (
          <div className="absolute inset-0 bg-white/80 z-50 flex flex-col items-center justify-center text-teal-600 backdrop-blur-sm">
            <div className="animate-spin w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full mb-4"></div>
            <p className="font-medium animate-pulse">Initializing Geometry Engine...</p>
          </div>
        )}
        <GeoGebraBoard onReady={() => {
          setIsGgbReady(true);
          addLog('GeoGebra Engine Ready', 'success');
        }} />
      </div>
    </div>
  );
}

export default App;
