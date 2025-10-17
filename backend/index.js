import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mrmsRouter from './proxy.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());

// mount MRMS API router at /api/mrms
app.use('/api/mrms', mrmsRouter);

// basic health check
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// serve frontend static build (if you build the frontend into ../frontend/dist)
const staticDir = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(staticDir));

// Fallback for SPA
app.get('*', (req, res) => {
  // if request wants an API route, let it 404 normally
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(staticDir, 'index.html'));
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`MRMS proxy listening on port ${PORT}`);
});
