import fs from 'fs';
import { PDFDocument, PDFName, PDFDict, PDFString, PDFHexString, PDFArray, PDFNumber } from 'pdf-lib';
import { Buffer } from 'buffer';

export interface ExtractedAnnotationReply {
  id: string;
  text: string;
  author?: string;
  date?: string;
}

export interface ExtractedAnnotation {
  id: string;
  pageNumber: number;
  text: string;
  rect: number[]; // Raw PDF coordinates [llx, lly, urx, ury]
  subtype: string; // 'Highlight', 'Text', 'StrikeOut', etc.
  status: 'PENDING' | 'IMPLEMENTED' | 'NOT_IMPLEMENTED' | 'PARTIAL';
  author?: string;
  date?: string;
  pdfRef?: string;
  inReplyToPdfRef?: string;
  replies?: ExtractedAnnotationReply[];
}

export const extractAnnotations = async (filePath: string): Promise<ExtractedAnnotation[]> => {
  const pdfBuffer = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const rawAnnotations: ExtractedAnnotation[] = [];

  pages.forEach((page, pageIndex) => {
    // Get raw annotations array reference
    const pageAnnots = page.node.Annots();
    if (!pageAnnots) return;

    // Iterate through annotations
    const annotCount = pageAnnots.size();
    for (let i = 0; i < annotCount; i++) {
      const ref = pageAnnots.get(i);
      const pdfRefStr = ref ? ref.toString() : undefined;
      const annotDict = pdfDoc.context.lookup(ref);
      
      if (!(annotDict instanceof PDFDict)) continue;

      // Check Subtype
      let subtype = 'Text';
      const subtypeName = annotDict.get(PDFName.of('Subtype'));
      if (subtypeName instanceof PDFName) {
        const raw = subtypeName.asString();
        subtype = raw.startsWith('/') ? raw.substring(1) : raw;
      }

      // Extract Contents
      let text = '';
      const contents = annotDict.get(PDFName.of('Contents'));
      if (contents) {
        if (contents instanceof PDFString || contents instanceof PDFHexString) {
          text = contents.decodeText();
        }
      }

      // Extract Author (T)
      let author = '';
      const t = annotDict.get(PDFName.of('T'));
      if (t instanceof PDFString || t instanceof PDFHexString) {
        author = t.decodeText();
      }

      // Extract Date (M or CreationDate)
      let date = '';
      const m = annotDict.get(PDFName.of('M'));
      if (m instanceof PDFString || m instanceof PDFHexString) {
        date = m.decodeText();
      }

      // Extract InReplyTo (IRT)
      let inReplyToPdfRef: string | undefined;
      const irt = annotDict.get(PDFName.of('IRT'));
      if (irt) {
        inReplyToPdfRef = irt.toString();
      }

      // Get Rectangle [llx, lly, urx, ury]
      const rect = annotDict.get(PDFName.of('Rect'));
      if (!(rect instanceof PDFArray)) continue;

      const getNum = (idx: number) => {
        const val = rect.get(idx);
        if (val instanceof PDFNumber) return val.asNumber();
        return 0;
      };

      const x1 = getNum(0);
      const y1 = getNum(1);
      const x2 = getNum(2);
      const y2 = getNum(3);

      const llx = Math.min(x1, x2);
      const lly = Math.min(y1, y2);
      const urx = Math.max(x1, x2);
      const ury = Math.max(y1, y2);

      rawAnnotations.push({
        id: `ann_${pageIndex}_${i}_${Date.now()}`,
        pageNumber: pageIndex + 1,
        text: text,
        rect: [llx, lly, urx, ury],
        subtype: subtype,
        status: 'PENDING',
        author,
        date,
        pdfRef: pdfRefStr,
        inReplyToPdfRef,
        replies: []
      });
    }
  });

  // Grouping Phase
  const rootAnnotations: ExtractedAnnotation[] = [];
  const annotMap = new Map<string, ExtractedAnnotation>();
  
  rawAnnotations.forEach(a => {
    if (a.pdfRef) annotMap.set(a.pdfRef, a);
  });

  rawAnnotations.forEach(a => {
    // If it's a Popup subtype, we don't treat it as a root OR a reply, it's just a dummy visualizer in Acrobat
    if (a.subtype === 'Popup') return;

    if (a.inReplyToPdfRef && annotMap.has(a.inReplyToPdfRef)) {
      // Traverse up to find the ultimate parent (the highlighted area)
      let currentParent = annotMap.get(a.inReplyToPdfRef);
      while (currentParent?.inReplyToPdfRef && annotMap.has(currentParent.inReplyToPdfRef)) {
          currentParent = annotMap.get(currentParent.inReplyToPdfRef);
      }
      
      if (currentParent) {
        // Only push if it has text (ignore empty empty reply chains)
        if (a.text && a.text.trim() !== '') {
          currentParent.replies!.push({
              id: a.id,
              text: a.text,
              author: a.author,
              date: a.date
          });
        }
      }
    } else {
      // It's a root annotation
      rootAnnotations.push(a);
    }
  });

  // Filter out empty invalid root annotations
  // A Valid root annotation MUST have either actual text OR have replies (meaning the highlighted text just has threaded children)
  const cleanAnnotations = rootAnnotations.filter(a => {
      const hasText = a.text && a.text.trim() !== '';
      const hasReplies = a.replies && a.replies.length > 0;
      return hasText || hasReplies;
  });

  // Optional Cleanup: If a Root has NO text, but HAS replies, promote the first reply's text to the main text if it looks cleaner
  cleanAnnotations.forEach(a => {
      if ((!a.text || a.text.trim() === '') && a.replies && a.replies.length > 0) {
          const firstReply = a.replies.shift()!;
          a.text = firstReply.text;
          a.author = firstReply.author || a.author;
          a.date = firstReply.date || a.date;
      }
  });

  return cleanAnnotations;
};

/**
 * Extracts a specific page from a PDF and returns it as a new single-page PDF buffer.
 */
export const extractPageAsPdfBuffer = async (filePath: string, pageNumber: number): Promise<Buffer> => {
  const pdfBuffer = fs.readFileSync(filePath);
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const newDoc = await PDFDocument.create();
  
  if (pageNumber < 1 || pageNumber > srcDoc.getPageCount()) {
    throw new Error(`Invalid page number: ${pageNumber}`);
  }

  const [copiedPage] = await newDoc.copyPages(srcDoc, [pageNumber - 1]);
  newDoc.addPage(copiedPage);
  
  const pdfBytes = await newDoc.save();
  return Buffer.from(pdfBytes);
};