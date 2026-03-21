import { PDFDocument } from 'pdf-lib';
import { Annotation, AnnotationReply, AnnotationStatus } from '../types';

export const extractAnnotations = async (file: File): Promise<Annotation[]> => {
  // Read file as ArrayBuffer in the browser
  const arrayBuffer = await file.arrayBuffer();
  
  // Load the PDF Document
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  
  const annotations: Annotation[] = [];
  const pages = pdfDoc.getPages();
  const pdfHeight = pages[0].getHeight(); // Used for coordinate conversion if needed

  // Data structure to hold raw annotation dictionaries by their Ref ID and IRT (In Reply To) links
  const refMap = new Map<string, any>();
  const repliesMap = new Map<string, any[]>();
  const shapeAnns: any[] = [];
  
  for (let pageNum = 0; pageNum < pages.length; pageNum++) {
    const page = pages[pageNum];
    const node = page.node;
    if (!node) continue;
    
    // @ts-ignore
    const annots = node.Annots();
    if (!annots) continue;
    
    // First pass: Index everything by reference so we can link IRT (In Reply To) correctly
    // @ts-ignore
    for (let i = 0; i < annots.size(); i++) {
      // @ts-ignore
      const ref = annots.get(i);
      if (!ref) continue;
      
      const refId = ref.toString(); // e.g. "15 0 R"
      const dict = page.doc.context.lookup(ref);
      if (!dict) continue;
      
      refMap.set(refId, dict);
      
      // @ts-ignore
      const irt = dict.get(pdfDoc.context.obj('IRT'));
      if (irt) {
         const irtId = irt.toString();
         if (!repliesMap.has(irtId)) repliesMap.set(irtId, []);
         repliesMap.get(irtId)!.push({ dict, refId, pageNumber: pageNum + 1 });
      } else {
         // This is a parent shape (Highlight, StrikeOut, Text, etc)
         shapeAnns.push({ dict, refId, pageNumber: pageNum + 1 });
      }
    }
  }
  
  // Second pass: Process parent shapes and heavily filter junk metadata
  for (const { dict, refId, pageNumber } of shapeAnns) {
      // @ts-ignore
      const subtypeObj = dict.get(pdfDoc.context.obj('Subtype'));
      const subtype = subtypeObj ? subtypeObj.name : 'Unknown';
      
      // Skip meaningless layout/system annotations
      if (['Link', 'Popup', 'Widget', 'Stamp', 'Square', 'Circle', 'Line'].includes(subtype)) continue;
      
      // @ts-ignore
      const rectArr = dict.get(pdfDoc.context.obj('Rect'));
      if (!rectArr) continue;
      
      const rect = [
        rectArr.get(0).numberValue,
        rectArr.get(1).numberValue,
        rectArr.get(2).numberValue,
        rectArr.get(3).numberValue
      ];

      // Extract Parent T (Author) and Contents (Text)
      // @ts-ignore
      const parentContentsObj = dict.get(pdfDoc.context.obj('Contents'));
      const parentContents = parentContentsObj ? 
         (parentContentsObj.value || parentContentsObj.encodedString || parentContentsObj.literalString || '').replace(/^þÿ/g, '').replace(/\0/g, '') 
         : '';
         
      // @ts-ignore
      const parentAuthorObj = dict.get(pdfDoc.context.obj('T'));
      const parentAuthor = parentAuthorObj ? parentAuthorObj.literalString || parentAuthorObj.value || '' : '';
      
      // Look for threaded replies pointing to this Parent Ref ID
      const repliesRaw = repliesMap.get(refId) || [];
      const replies: AnnotationReply[] = [];
      
      for (const reply of repliesRaw) {
          const rDict = reply.dict;
          // @ts-ignore
          let textObj = rDict.get(pdfDoc.context.obj('Contents'));
          // @ts-ignore
          let authorObj = rDict.get(pdfDoc.context.obj('T'));
          // @ts-ignore
          let dateObj = rDict.get(pdfDoc.context.obj('M')) || rDict.get(pdfDoc.context.obj('CreationDate'));
          
          let text = textObj ? (textObj.value || textObj.encodedString || textObj.literalString || '').replace(/^þÿ/g, '').replace(/\0/g, '') : '';
          let author = authorObj ? authorObj.literalString || authorObj.value || '' : '';
          let date = dateObj ? dateObj.literalString || dateObj.value || '' : '';
          
          if (text) {
              replies.push({
                  id: reply.refId.replace(/\s+/g, '-'),
                  text,
                  author,
                  date
              });
          }
      }
      
      // Strict Jira/Adobe junk filter: 
      // If the parent annotation has no text AND has no threaded human replies, it's just a rogue shape/system marker
      if (!parentContents && replies.length === 0) continue;
      
      // Build the rich threaded annotation
      annotations.push({
        id: refId.replace(/\s+/g, '-'),
        pageNumber,
        text: parentContents,
        author: parentAuthor,
        replies,
        rect,
        subtype,
        status: AnnotationStatus.PENDING
      });
  }

  // Sort by page number
  return annotations.sort((a, b) => a.pageNumber - b.pageNumber);
};
