import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import projectRoutes from './routes/projectRoutes.js';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors() as any);
// Increase limit for large Base64 image payloads and make it configurable via env
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '100mb';
app.use(express.json({ limit: jsonBodyLimit }) as any);
app.use(express.urlencoded({ limit: jsonBodyLimit, extended: true }) as any);

// Static files for uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')) as any);

// DB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pdfdiff')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Routes
app.use('/api', projectRoutes);

// Vercel Serverless execution expects an exported app, not a continuously listening port
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export default app;