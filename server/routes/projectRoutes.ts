import express from 'express';
import { createProject, compareAnnotation, deleteProjectFiles } from '../controllers/projectController.js';

const router = express.Router();

// The new serverless endpoint bypasses Multer entirely and accepts JSON directly!
router.post('/project', createProject as any);
router.post('/compare', compareAnnotation as any);
router.delete('/project/:id', deleteProjectFiles as any);

export default router;