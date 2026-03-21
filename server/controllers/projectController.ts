import { Request, Response } from 'express';
import Project from '../models/Project.js';
import { analyzeDifference } from '../services/aiService.js';

// Define a local interface to avoid Express namespace issues if types are missing
interface MulterFile {
  path: string;
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
}

export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { annotations, filename } = (req as any).body;
    
    if (!annotations) {
      (res as any).status(400).json({ message: 'Missing annotations data' });
      return;
    }

    // 1. Save strictly to DB without any local disk storage (Perfect for Vercel)
    const project = new Project({
      oldPdfPath: filename, // Just store the name for reference
      newPdfPath: 'local-blob', 
      annotations
    });
    
    await project.save();

    // 2. Return standard object for frontend (URLs are handled locally by Vite now)
    const responseProject = project.toObject();

    (res as any).status(201).json({ project: responseProject });
  } catch (error) {
    console.error(error);
    (res as any).status(500).json({ message: 'Server Error' });
  }
};

export const compareAnnotation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, annotationId, oldImage, newImage } = (req as any).body;
    
    if (!oldImage || !newImage) {
        (res as any).status(400).json({ message: 'Missing reference images for comparison' });
        return;
    }

    const project = await Project.findById(projectId);
    
    if (!project) {
      (res as any).status(404).json({ message: 'Project not found' });
      return;
    }

    const annotation = project.annotations.find(a => a.id === annotationId);
    if (!annotation) {
      (res as any).status(404).json({ message: 'Annotation not found' });
      return;
    }

    // AI Analysis using the images provided by client
    const result = await analyzeDifference(
      oldImage,
      newImage,
      annotation
    );

    // Update DB
    annotation.status = result.status;
    annotation.aiConfidence = result.confidence;
    annotation.aiReason = result.reason;
    await project.save();

    (res as any).json(result);
  } catch (error) {
    console.error(error);
    (res as any).status(500).json({ message: 'Analysis failed' });
  }
};

import fs from 'fs';

export const deleteProjectFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // In our new Serverless Vercel Architecture, we don't upload files to the cloud.
    // The PDFs live entirely in the user's browser via Blob URLs.
    // So "deleting files" just means permanently erasing the Project from MongoDB to save database space!
    
    const project = await Project.findByIdAndDelete(id);
    if (!project) {
        (res as any).status(404).json({ message: 'Project not found' });
        return;
    }
    
    (res as any).json({ message: 'Project and all associated database records deleted successfully to save cloud storage' });
  } catch (error) {
      console.error(error);
      (res as any).status(500).json({ message: 'Server Error during cleanup' });
  }
};