import { Request, Response, NextFunction } from 'express';
import https from 'https';
import jwt from 'jsonwebtoken';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? '';

const CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedKeys: Record<string, string> = {};
let cacheExpiry = 0;

function fetchPublicKeys(): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    https.get(CERTS_URL, (res) => {
      const match = res.headers['cache-control']?.match(/max-age=(\d+)/);
      cacheExpiry = Date.now() + parseInt(match?.[1] ?? '3600') * 1000;
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        cachedKeys = JSON.parse(data) as Record<string, string>;
        resolve(cachedKeys);
      });
    }).on('error', reject);
  });
}

async function getPublicKeys(): Promise<Record<string, string>> {
  if (Date.now() < cacheExpiry) return cachedKeys;
  return fetchPublicKeys();
}

declare global {
  namespace Express {
    interface Request {
      firebaseUid?: string;
      firebaseEmail?: string;
      firebaseName?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const keys = await getPublicKeys();
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') throw new Error('invalid token');

    const publicKey = keys[decoded.header.kid as string];
    if (!publicKey) throw new Error('unknown key id');

    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      audience: PROJECT_ID,
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    }) as { uid?: string; sub?: string; email?: string; name?: string };

    req.firebaseUid = payload.uid ?? payload.sub ?? '';
    req.firebaseEmail = payload.email ?? '';
    req.firebaseName = payload.name ?? '';
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
