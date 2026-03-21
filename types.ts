
export enum AnnotationStatus {
  PENDING = 'PENDING',
  IMPLEMENTED = 'IMPLEMENTED',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  PARTIAL = 'PARTIAL'
}

export interface AnnotationReply {
  id: string;
  text: string;
  author?: string;
  date?: string;
}

export interface Annotation {
  id: string;
  pageNumber: number;
  text: string;
  rect: number[]; // [llx, lly, urx, ury] Raw PDF coordinates
  subtype?: string; // 'Highlight', 'Text', 'StrikeOut', etc.
  status: AnnotationStatus;
  aiConfidence?: number;
  aiReason?: string;
  screenshotUrl?: string;
  author?: string;
  date?: string;
  pdfRef?: string;       // The PDF Object Reference (e.g., "10 0 R")
  inReplyToPdfRef?: string; // The Reference of the parent annotation
  replies?: AnnotationReply[]; // Threaded comments
}

export interface Project {
  _id: string;
  name: string;
  oldPdfUrl: string;
  newPdfUrl: string;
  annotations: Annotation[];
  createdAt: string;
}

export interface UploadResponse {
  projectId: string;
  project: Project;
}

export interface ComparisonResult {
  annotationId: string;
  status: AnnotationStatus;
  confidence: number;
  reason: string;
}
