
import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnotationReply {
  id: string;
  text: string;
  author?: string;
  date?: string;
}

export interface IAnnotation {
  id: string;
  pageNumber: number;
  text: string;
  rect: number[]; // [llx, lly, urx, ury]
  subtype?: string; // e.g., 'Highlight', 'Text', 'StrikeOut'
  status: 'PENDING' | 'IMPLEMENTED' | 'NOT_IMPLEMENTED' | 'PARTIAL';
  aiConfidence?: number;
  aiReason?: string;
  author?: string;
  date?: string;
  pdfRef?: string;
  inReplyToPdfRef?: string;
  replies?: IAnnotationReply[];
}

export interface IProject extends Document {
  oldPdfPath: string;
  newPdfPath: string;
  annotations: IAnnotation[];
  createdAt: Date;
}

const ReplySchema = new Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  author: String,
  date: String
});

const AnnotationSchema = new Schema({
  id: { type: String, required: true },
  pageNumber: { type: Number, required: true },
  text: { type: String, default: '' },
  rect: { type: [Number], required: true }, 
  subtype: { type: String, default: 'Text' }, 
  status: { 
    type: String, 
    enum: ['PENDING', 'IMPLEMENTED', 'NOT_IMPLEMENTED', 'PARTIAL'], 
    default: 'PENDING' 
  },
  aiConfidence: Number,
  aiReason: String,
  author: String,
  date: String,
  pdfRef: String,
  inReplyToPdfRef: String,
  replies: { type: [ReplySchema], default: [] }
});

const ProjectSchema = new Schema({
  oldPdfPath: { type: String, required: true },
  newPdfPath: { type: String, required: true },
  annotations: [AnnotationSchema],
  createdAt: { type: Date, default: Date.now }
});

const Project = mongoose.model<IProject>('Project', ProjectSchema);
export default Project;
