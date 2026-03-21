export const renderPageToImage = async (
  url: string, 
  pageNumber: number, 
  highlightRect?: number[], // Optional: [llx, lly, urx, ury] from PDF
  cropToHighlight: boolean = false,
  padding: number = 500
): Promise<string> => {
  try {
    // @ts-ignore
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
        throw new Error("PDF.js library not loaded");
    }

    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);
    
    // Scale 1.0 is sufficient for vision models and avoids hitting Groq's 413 Payload Too Large
    const scale = 1.0; 
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error("Could not create canvas context");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    
    // Draw Annotation Highlight if rect is provided
    if (highlightRect && highlightRect.length === 4) {
      // Convert PDF coordinates (Bottom-Left origin) to Viewport/Canvas coordinates (Top-Left origin)
      const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(highlightRect);
      
      // Calculate dimensions
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x1 - x2);
      const h = Math.abs(y1 - y2);

      // Draw Red Box
      context.beginPath();
      context.lineWidth = 4; // Slightly thinner for cleaner look
      context.strokeStyle = '#ff0000'; // Pure Red
      context.setLineDash([8, 4]); 
      context.rect(x - 4, y - 4, w + 8, h + 8);
      context.stroke();
      
      // Semi-transparent fill
      context.fillStyle = 'rgba(255, 0, 0, 0.1)';
      context.fill();

      // If requested, crop the canvas tightly around the highlighted area with some padding for context
      if (cropToHighlight) {
         const cropX = Math.max(0, x - padding);
         const cropY = Math.max(0, y - padding);
         const cropW = Math.min(canvas.width - cropX, w + padding * 2);
         const cropH = Math.min(canvas.height - cropY, h + padding * 2);
         
         const croppedCanvas = document.createElement('canvas');
         croppedCanvas.width = cropW;
         croppedCanvas.height = cropH;
         const croppedCtx = croppedCanvas.getContext('2d');
         
         if (croppedCtx) {
           // Draw the relevant slice of the full canvas onto the smaller canvas
           croppedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
           return croppedCanvas.toDataURL('image/jpeg', 0.85); // Higher quality for smaller snippets
         }
      }
    }
    
    // Return base64 string with slightly lower quality to avoid 413 Payload Too Large
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch (error) {
      console.error("Error rendering page to image:", error);
      throw error;
  }
};
