import express from 'express';
import fetch from 'node-fetch';
import { LRUCache } from 'lru-cache'; 
import url from 'url';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const router = express.Router();
router.use(cors());


const CACHE = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 2
});

const NOAA_EXPORT_BASE = process.env.NOAA_MRMS_EXPORT_BASE;
const NOAA_IMAGEJSON = process.env.NOAA_MRMS_IMAGEJSON || NOAA_EXPORT_BASE?.replace('/MapServer/export', '/ImageServer') || null;

if (!NOAA_EXPORT_BASE) {
  console.warn('WARNING: NOAA_MRMS_EXPORT_BASE not configured in .env — proxy will not work until set');
}

function buildArcgisExportUrl(qsRaw) {
  const allowed = ['bbox', 'size', 'time', 'bboxSR', 'imageSR', 'format', 'layers', 'layerDefs', 'dpi'];
  const qs = new url.URLSearchParams();
  const raw = typeof qsRaw === 'string' ? new url.URLSearchParams(qsRaw) : new url.URLSearchParams(qsRaw);

  for (const k of allowed) {
    const v = raw.get(k);
    if (v) qs.set(k, v);
  }

  qs.set('format', 'png32');
  qs.set('transparent', 'true');
  qs.set('f', 'image');
  if (!qs.get('bboxSR')) qs.set('bboxSR', '4326');
  if (!qs.get('imageSR')) qs.set('imageSR', '3857');

  return `${NOAA_EXPORT_BASE}?${qs.toString()}`;
}

router.get('/export', async (req, res) => {
  try {
    if (!NOAA_EXPORT_BASE) return res.status(500).json({ error: 'NOAA export base not configured' });

    const finalUrl = buildArcgisExportUrl(req.query);
    const cacheKey = finalUrl;

    const cached = CACHE.get(cacheKey);
    if (cached) {
      res.set('Content-Type', 'image/png');
      res.set('X-Cache', 'HIT');
      return res.send(cached);
    }

    const upstream = await fetch(finalUrl);
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'Upstream failed', status: upstream.status, body: text });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    CACHE.set(cacheKey, buffer);
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.set('Cache-Control', 'public, max-age=60');
    res.set('X-Cache', 'MISS');
    return res.send(buffer);
  } catch (err) {
    console.error('export error', err);
    return res.status(500).json({ error: String(err) });
  }
});

router.get('/times', async (req, res) => {
  try {
    const imageJsonUrl = process.env.NOAA_MRMS_IMAGE_JSON_URL || NOAA_EXPORT_BASE?.replace('/MapServer/export', '/ImageServer?f=json');
    if (!imageJsonUrl) return res.status(500).json({ error: 'NOAA image JSON URL not configured' });

    const cacheKey = `times:${imageJsonUrl}`;
    const cached = CACHE.get(cacheKey);
    if (cached) return res.json(cached);

    const upstream = await fetch(imageJsonUrl);
    if (!upstream.ok) return res.status(502).json({ error: 'failed to reach image server', status: upstream.status });

    const j = await upstream.json();

    const out = {
      source: imageJsonUrl,
      fetchedAt: new Date().toISOString(),
      times: []
    };

    const timeInfo = j.timeInfo || j.timeinfo || null;

    if (timeInfo && Array.isArray(timeInfo.timeValues) && timeInfo.timeValues.length > 0) {
      out.times = timeInfo.timeValues.map(t => {
        if (typeof t === 'number') return new Date(t).toISOString();
        if (/^\d+$/.test(String(t)) && String(t).length === 10) return new Date(Number(t) * 1000).toISOString();
        const d = new Date(t);
        return isNaN(d.getTime()) ? null : d.toISOString();
      }).filter(Boolean).reverse();
    } else if (timeInfo && Array.isArray(timeInfo.timeExtent) && timeInfo.timeExtent.length >= 2) {
      const end = new Date(Number(timeInfo.timeExtent[1]));
      if (!isNaN(end.getTime())) out.times = [end.toISOString()];
    } else if (j.timeExtent && Array.isArray(j.timeExtent) && j.timeExtent.length >= 2) {
      const end = new Date(j.timeExtent[1]);
      if (!isNaN(end.getTime())) out.times = [end.toISOString()];
    } else {
      out.times = [new Date().toISOString()];
    }

    CACHE.set(cacheKey, out, { ttl: 1000 * 30 });
    return res.json(out);
  } catch (err) {
    console.error('times error', err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
