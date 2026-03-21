import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Annotation } from '../types';

interface PdfViewerProps {
  url: string;
  annotations?: Annotation[];
  pageNumber: number;
  onPageChange: (page: number) => void;
  label: string;
  selectedAnnotationId?: string | null;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const PdfViewer = forwardRef<HTMLDivElement, PdfViewerProps>(({ 
  url, 
  annotations = [], 
  pageNumber, 
  onPageChange, 
  label,
  selectedAnnotationId,
  onScroll
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  
  // State for View Controls
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState(0);
  const [viewportDetails, setViewportDetails] = useState<any>(null);
  const [isRendered, setIsRendered] = useState(false);

  useImperativeHandle(ref, () => internalContainerRef.current as HTMLDivElement);

  useEffect(() => {
    setRotation(0);
    setScale(1.0);
  }, [url]);

  useEffect(() => {
    const loadPdf = async () => {
      try {
        // @ts-ignore
        const loadingTask = window.pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
      } catch (error) {
        console.error("Error loading PDF:", error);
      }
    };
    if (url) loadPdf();
  }, [url]);

  const renderPage = async () => {
    if (!pdfDoc || !canvasRef.current || !internalContainerRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const effectiveRotation = (page.rotate + rotation) % 360;
      const effectiveScale = scale;
      const viewport = page.getViewport({ scale: effectiveScale, rotation: effectiveRotation });
      setViewportDetails(viewport);

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        const transform = outputScale !== 1 
          ? [outputScale, 0, 0, outputScale, 0, 0] 
          : null;

        const renderContext = {
          canvasContext: context,
          transform: transform,
          viewport: viewport,
        };
        
        await page.render(renderContext).promise;
        setIsRendered(true);
      }
    } catch (error) {
      console.error("Error rendering page:", error);
    }
  };

  useEffect(() => {
    renderPage();
  }, [pdfDoc, pageNumber, rotation, scale]);

  // Scroll active annotation into view
  useEffect(() => {
    if (selectedAnnotationId && internalContainerRef.current && isRendered) {
      const el = document.getElementById(`annot-${selectedAnnotationId}-${label}`); 
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  }, [selectedAnnotationId, pageNumber, isRendered, label]);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleFitWidth = () => {
    if (internalContainerRef.current && viewportDetails) {
        const containerW = internalContainerRef.current.clientWidth - 40;
        const currentW = viewportDetails.width / scale; 
        if (currentW > 0) {
            setScale(containerW / currentW);
        }
    }
  };

  const handleRotateLeft = () => setRotation(prev => (prev - 90 + 360) % 360);
  const handleRotateRight = () => setRotation(prev => (prev + 90) % 360);

  const getAnnotationStyle = (rect: number[]) => {
    if (!viewportDetails) return { display: 'none' };
    const [px1, py1, px2, py2] = viewportDetails.convertToViewportRectangle(rect);
    const left = Math.min(px1, px2);
    const top = Math.min(py1, py2);
    const width = Math.abs(px2 - px1);
    const height = Math.abs(py2 - py1);

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  };

  // Render Logic based on Subtype
  const renderAnnotationContent = (ann: Annotation, isSelected: boolean) => {
    const isHighlight = ann.subtype === 'Highlight';
    const isStrikeOut = ann.subtype === 'StrikeOut';
    
    // Highlight Style (Transparent Yellow Overlay)
    if (isHighlight) {
       return (
         <div 
           className={`w-full h-full transition-all duration-200 mix-blend-multiply ${
             isSelected 
               ? 'bg-yellow-400 opacity-60 ring-2 ring-indigo-500' 
               : 'bg-yellow-300 opacity-40 hover:opacity-60'
           }`} 
         />
       );
    }

    // StrikeOut Style
    if (isStrikeOut) {
       return (
         <div className="w-full h-full relative flex items-center justify-center">
            <div className={`w-full h-[2px] ${isSelected ? 'bg-red-600 h-[3px]' : 'bg-red-500'}`}></div>
         </div>
       );
    }

    // Default / Sticky Note (Icon)
    // Sticky notes usually have very small rects in PDF, or we want to show an icon regardless.
    return (
      <div className={`w-full h-full flex items-center justify-center group ${isSelected ? 'scale-110' : ''}`}>
        {/* If rect is large (e.g. drawn rectangle), show border. If small, show icon. */}
        {/* For simplicity, we assume text annotations want an icon if they are smallish, or just an icon in top-left */}
        <div className={`relative transition-transform ${isSelected ? 'text-indigo-600' : 'text-yellow-600 hover:text-yellow-700'}`}>
            <svg 
                viewBox="0 0 24 24" 
                fill="currentColor" 
                className={`drop-shadow-md ${isSelected ? 'w-8 h-8' : 'w-6 h-6'}`}
            >
                <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
            {/* Status Indicator Dot */}
            <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                ann.status === 'IMPLEMENTED' ? 'bg-green-500' :
                ann.status === 'NOT_IMPLEMENTED' ? 'bg-red-500' :
                ann.status === 'PARTIAL' ? 'bg-orange-500' : 'bg-gray-400'
            }`}></div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 h-full w-full overflow-hidden">
      {/* Toolbar ... (Same as before) */}
      <div className="px-3 py-2 bg-slate-50 border-b border-gray-200 flex justify-between items-center flex-wrap gap-2 shrink-0 select-none">
        <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-700 text-sm whitespace-nowrap mr-2">{label}</h3>
            <div className="flex items-center bg-white rounded-md border border-gray-300 shadow-sm">
                <button onClick={handleZoomOut} className="p-1.5 hover:bg-gray-100 text-gray-600 border-r border-gray-200" title="Zoom Out">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/></svg>
                </button>
                <span className="text-xs font-mono w-12 text-center text-gray-600">{Math.round(scale * 100)}%</span>
                <button onClick={handleZoomIn} className="p-1.5 hover:bg-gray-100 text-gray-600 border-l border-gray-200" title="Zoom In">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
                </button>
            </div>
            <button onClick={handleFitWidth} className="p-1.5 hover:bg-gray-100 text-gray-600 rounded border border-gray-300 shadow-sm bg-white text-xs font-medium" title="Fit Width">Fit</button>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={handleRotateLeft} className="p-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600" title="Rotate Left">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/></svg>
            </button>
            <div className="flex items-center bg-white rounded-md border border-gray-300 shadow-sm ml-2">
                <button disabled={pageNumber <= 1} onClick={() => onPageChange(pageNumber - 1)} className="p-1.5 hover:bg-gray-100 text-gray-600 border-r border-gray-200 disabled:opacity-30">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>
                </button>
                <span className="text-xs font-medium w-16 text-center text-gray-700">{pageNumber} / {totalPages || '-'}</span>
                <button disabled={pageNumber >= totalPages} onClick={() => onPageChange(pageNumber + 1)} className="p-1.5 hover:bg-gray-100 text-gray-600 border-l border-gray-200 disabled:opacity-30">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>
                </button>
            </div>
        </div>
      </div>

      {/* Canvas & Annotations */}
      <div 
        ref={internalContainerRef} 
        onScroll={onScroll}
        className="flex-1 overflow-auto bg-slate-100 p-4 flex relative w-full"
      >
        <div className="m-auto relative shadow-xl transition-all duration-200 bg-white" style={{ width: 'fit-content', height: 'fit-content' }}>
           <canvas ref={canvasRef} className="block" />
           {annotations.filter(a => a.pageNumber === pageNumber).map(ann => {
             const isSelected = ann.id === selectedAnnotationId;
             
             // If it's a Text annotation (sticky note) with a tiny rect, we might want to ensure the click target is big enough
             // For rendering, we let renderAnnotationContent handle the inner visual
             return (
               <div 
                 key={ann.id}
                 id={`annot-${ann.id}-${label}`}
                 className="absolute cursor-pointer z-10"
                 style={getAnnotationStyle(ann.rect)}
                 title={ann.text}
               >
                  {renderAnnotationContent(ann, isSelected)}

                  {/* Tooltip on Hover */}
                  <div className={`absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl opacity-0 hover:opacity-100 whitespace-nowrap z-50 pointer-events-none transition-opacity ${isSelected ? 'opacity-100' : ''}`}>
                    <span className="font-semibold">{ann.status}</span>: {ann.text.length > 20 ? ann.text.substring(0, 20) + '...' : ann.text}
                  </div>
               </div>
             );
           })}
        </div>
      </div>
    </div>
  );
});

PdfViewer.displayName = 'PdfViewer';