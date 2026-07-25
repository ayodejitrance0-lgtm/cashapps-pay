import crypto from 'node:crypto';
import { Pool } from 'pg';

const tokenMaxAgeSeconds = 8 * 60 * 60;
let pool;
let initialized = false;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!pool) {
    const needsSsl = !process.env.DATABASE_URL.includes('localhost');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
    });
  }

  return pool;
}

async function initializeDatabase() {
  if (initialized) {
    return;
  }

  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS payment_links (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL DEFAULT '',
      cashtag TEXT NOT NULL DEFAULT '',
      wallet_name TEXT NOT NULL DEFAULT '',
      lightning_invoice TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  initialized = true;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateAuthPayload(payload) {
  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password || '');

  if (!email || !email.includes('@') || !email.split('@').at(-1)?.includes('.')) {
    return { error: 'Enter a valid email address.' };
  }

  if (password.length < 8) {
    return { error: 'Use a password with at least 8 characters.' };
  }

  return { email, password };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('hex');
  return { passwordHash, salt };
}

function verifyPassword(password, passwordHash, salt) {
  const candidate = hashPassword(password, salt).passwordHash;
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(passwordHash, 'hex'));
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function getSecretKey() {
  return process.env.BACKEND_SECRET_KEY || process.env.JWT_SECRET || 'change-this-secret';
}

function createToken(user) {
  const payload = {
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + tokenMaxAgeSeconds,
    sub: String(user.id),
  };
  const encodedPayload = base64UrlEncode(payload);
  const signature = crypto
    .createHmac('sha256', getSecretKey())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function decodeToken(token) {
  const [encodedPayload, signature] = String(token || '').split('.');
  if (!encodedPayload || !signature) {
    throw new Error('Invalid token.');
  }

  const expectedSignature = crypto
    .createHmac('sha256', getSecretKey())
    .update(encodedPayload)
    .digest('base64url');

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature, 'base64url'),
      Buffer.from(expectedSignature, 'base64url'),
    )
  ) {
    throw new Error('Invalid token.');
  }

  const payload = base64UrlDecode(encodedPayload);
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired.');
  }

  return payload;
}

async function getCurrentUser(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const payload = decodeToken(authorization.split(' ')[1]);
  const result = await getPool().query('SELECT id, email FROM users WHERE id = $1', [payload.sub]);
  return result.rows[0] || null;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }

  return {};
}

async function signup(req, res) {
  const payload = validateAuthPayload(await readBody(req));
  if (payload.error) {
    return json(res, 422, { detail: payload.error });
  }

  const { passwordHash, salt } = hashPassword(payload.password);

  try {
    const userResult = await getPool().query(
      'INSERT INTO users (email, password_hash, salt) VALUES ($1, $2, $3) RETURNING id, email',
      [payload.email, passwordHash, salt],
    );
    const user = userResult.rows[0];
    await getPool().query('INSERT INTO payment_links (user_id) VALUES ($1)', [user.id]);
    return json(res, 201, {
      access_token: createToken(user),
      email: user.email,
      token_type: 'bearer',
    });
  } catch (error) {
    if (error.code === '23505') {
      return json(res, 409, { detail: 'An account already exists. Sign in instead.' });
    }
    throw error;
  }
}

async function signin(req, res) {
  const payload = validateAuthPayload(await readBody(req));
  if (payload.error) {
    return json(res, 422, { detail: payload.error });
  }

  const result = await getPool().query(
    'SELECT id, email, password_hash, salt FROM users WHERE email = $1',
    [payload.email],
  );
  const user = result.rows[0];

  if (!user || !verifyPassword(payload.password, user.password_hash, user.salt)) {
    return json(res, 401, { detail: 'Email or password is incorrect.' });
  }

  return json(res, 200, {
    access_token: createToken(user),
    email: user.email,
    token_type: 'bearer',
  });
}

async function paymentLink(req, res, user) {
  if (req.method === 'GET') {
    const result = await getPool().query(
      `
      SELECT full_name, cashtag, wallet_name, lightning_invoice, updated_at
      FROM payment_links
      WHERE user_id = $1
      `,
      [user.id],
    );
    return json(res, 200, result.rows[0] || {});
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    const result = await getPool().query(
      `
      INSERT INTO payment_links (
        user_id, full_name, cashtag, wallet_name, lightning_invoice, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        full_name = excluded.full_name,
        cashtag = excluded.cashtag,
        wallet_name = excluded.wallet_name,
        lightning_invoice = excluded.lightning_invoice,
        updated_at = CURRENT_TIMESTAMP
      RETURNING full_name, cashtag, wallet_name, lightning_invoice, updated_at
      `,
      [
        user.id,
        body.full_name || '',
        body.cashtag || '',
        body.wallet_name || '',
        body.lightning_invoice || '',
      ],
    );
    return json(res, 200, result.rows[0]);
  }

  return json(res, 405, { detail: 'Method not allowed.' });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    await initializeDatabase();

    const path = new URL(req.url, 'https://cashapps-pay.vercel.app').pathname.replace(
      /^\/api/,
      '',
    ) || '/';

    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok' });
    }

    if (req.method === 'POST' && path === '/auth/signup') {
      return signup(req, res);
    }

    if (req.method === 'POST' && path === '/auth/signin') {
      return signin(req, res);
    }

    const user = await getCurrentUser(req);
    if (!user) {
      return json(res, 401, { detail: 'Sign in required.' });
    }

    if (req.method === 'GET' && path === '/auth/me') {
      return json(res, 200, { id: user.id, email: user.email });
    }

    if (path === '/payment-link') {
      return paymentLink(req, res, user);
    }

    return json(res, 404, { detail: 'Not found.' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { detail: 'Server error. Try again.' });
  }
}
