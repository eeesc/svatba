const { Readable } = require('stream');
const Busboy = require('busboy');
const { google } = require('googleapis');

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.heic',
  '.heif',
  '.webp',
]);

function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured.');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
}

function getDriveClient() {
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  return google.drive({ version: 'v3', auth });
}

function getExtension(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return '';
  return filename.slice(dot).toLowerCase();
}

function isAllowedImage(filename, mimeType) {
  const ext = getExtension(filename);
  const normalizedMime = (mimeType || '').toLowerCase();

  if (ALLOWED_MIME_TYPES.has(normalizedMime)) return true;
  if (ALLOWED_EXTENSIONS.has(ext)) return true;

  // iPhone camera roll sometimes sends HEIC as application/octet-stream.
  if (normalizedMime === 'application/octet-stream' && ALLOWED_EXTENSIONS.has(ext)) {
    return true;
  }

  return false;
}

function sanitizeUploaderName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';

  const sanitized = trimmed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);

  return sanitized;
}

function buildDriveFilename(originalName, uploaderName) {
  const base = originalName.replace(/^.*[\\/]/, '').trim() || 'photo.jpg';
  const safeName = sanitizeUploaderName(uploaderName);

  if (!safeName) return base;

  const dot = base.lastIndexOf('.');
  if (dot === -1) return `${safeName}_${base}`;

  const stem = base.slice(0, dot);
  const ext = base.slice(dot);
  return `${safeName}_${stem}${ext}`;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      reject(new Error('Expected multipart/form-data.'));
      return;
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 20,
        fileSize: MAX_FILE_SIZE,
      },
    });

    const files = [];
    let uploaderName = '';

    busboy.on('field', (fieldname, value) => {
      if (fieldname === 'from' || fieldname === 'uploader') {
        uploaderName = String(value || '');
      }
    });

    busboy.on('file', (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      let size = 0;
      let tooLarge = false;

      fileStream.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_FILE_SIZE) {
          tooLarge = true;
          fileStream.resume();
          return;
        }
        chunks.push(chunk);
      });

      fileStream.on('limit', () => {
        tooLarge = true;
      });

      fileStream.on('end', () => {
        if (tooLarge) {
          files.push({
            error: `Soubor „${filename}“ je větší než 20 MB.`,
          });
          return;
        }

        if (!filename) return;

        files.push({
          fieldname,
          filename,
          mimeType: mimeType || 'application/octet-stream',
          buffer: Buffer.concat(chunks),
        });
      });
    });

    busboy.on('error', reject);

    busboy.on('finish', () => {
      resolve({ files, uploaderName });
    });

    req.pipe(busboy);
  });
}

async function uploadToDrive(drive, folderId, file) {
  const driveName = buildDriveFilename(file.filename, file.uploaderName);

  await drive.files.create({
    requestBody: {
      name: driveName,
      parents: [folderId],
    },
    media: {
      mimeType: file.mimeType,
      body: Readable.from(file.buffer),
    },
    supportsAllDrives: true,
  });

  return driveName;
}

module.exports = async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    jsonResponse(res, 405, { success: false, error: 'Method not allowed.' });
    return;
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    jsonResponse(res, 500, { success: false, error: 'Upload is not configured yet.' });
    return;
  }

  let parsed;
  try {
    parsed = await parseMultipart(req);
  } catch (err) {
    jsonResponse(res, 400, {
      success: false,
      error: err.message || 'Could not read uploaded files.',
    });
    return;
  }

  const uploadableFiles = parsed.files.filter((file) => file.buffer && file.buffer.length);

  if (!uploadableFiles.length) {
    const firstError = parsed.files.find((file) => file.error);
    jsonResponse(res, 400, {
      success: false,
      error: firstError?.error || 'No image files were received.',
    });
    return;
  }

  for (const file of uploadableFiles) {
    if (!isAllowedImage(file.filename, file.mimeType)) {
      jsonResponse(res, 400, {
        success: false,
        error: `Nepodporovaný formát: ${file.filename}. Použijte JPEG, PNG, HEIC nebo WebP.`,
      });
      return;
    }
    file.uploaderName = parsed.uploaderName;
  }

  let drive;
  try {
    drive = getDriveClient();
  } catch (err) {
    jsonResponse(res, 500, { success: false, error: err.message });
    return;
  }

  const uploaded = [];

  try {
    for (const file of uploadableFiles) {
      const driveName = await uploadToDrive(drive, folderId, file);
      uploaded.push({ original: file.filename, storedAs: driveName });
    }
  } catch (err) {
    let message = err?.message || 'Upload to Google Drive failed.';
    if (/storageQuotaExceeded|storage quota/i.test(message)) {
      message =
        'Service account cannot upload to this folder. Move it into a Google Shared Drive ' +
        'and add the service account as a member, or use the Apps Script upload backend instead.';
    }
    jsonResponse(res, 500, { success: false, error: message, uploaded });
    return;
  }

  jsonResponse(res, 200, {
    success: true,
    count: uploaded.length,
    files: uploaded,
  });
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
