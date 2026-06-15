/**
 * Google Apps Script backend for guest photo uploads.
 * Runs as you (the script owner), so uploads work into a normal My Drive folder.
 *
 * Setup:
 * 1) script.google.com → New project → paste this file.
 * 2) Set FOLDER_ID below to your shared folder.
 * 3) Deploy → New deployment → Web app:
 *      Execute as: Me
 *      Who has access: Anyone
 * 4) Copy the /exec URL into nahrati-fotky.html + upload-photos-en.html
 *    (PHOTO_UPLOAD_CONFIG.uploadUrl).
 */

const FOLDER_ID = '1n7GYR_Vjrfv2T2DYal5X1GUFh5c5uFSb';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME = {
  'image/jpeg': true,
  'image/png': true,
  'image/heic': true,
  'image/heif': true,
  'image/webp': true,
};

const ALLOWED_EXT = {
  '.jpg': true,
  '.jpeg': true,
  '.png': true,
  '.heic': true,
  '.heif': true,
  '.webp': true,
};

function doOptions() {
  return ContentService.createTextOutput('');
}

function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const fileName = safe_(params.fileName);
    const mimeType = safe_(params.mimeType) || 'application/octet-stream';
    const fileData = params.fileData;
    const from = safe_(params.from);

    if (!fileName || !fileData) {
      return json_({ success: false, error: 'Missing file data.' });
    }

    if (!isAllowedImage_(fileName, mimeType)) {
      return json_({
        success: false,
        error: 'Unsupported format. Use JPEG, PNG, HEIC, or WebP.',
      });
    }

    const bytes = Utilities.base64Decode(fileData);
    if (bytes.length > MAX_FILE_BYTES) {
      return json_({ success: false, error: 'File is larger than 20 MB.' });
    }

    const storedAs = buildFilename_(fileName, from);
    const blob = Utilities.newBlob(bytes, mimeType, storedAs);
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const file = folder.createFile(blob);

    return json_({
      success: true,
      storedAs: storedAs,
      fileId: file.getId(),
    });
  } catch (err) {
    return json_({
      success: false,
      error: err && err.message ? String(err.message) : 'Upload failed.',
    });
  }
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function safe_(value) {
  if (typeof value === 'undefined' || value === null) return '';
  return String(value).trim();
}

function extOf_(name) {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return '';
  return name.slice(dot).toLowerCase();
}

function isAllowedImage_(fileName, mimeType) {
  const mime = mimeType.toLowerCase();
  const ext = extOf_(fileName);
  if (ALLOWED_MIME[mime]) return true;
  if (ALLOWED_EXT[ext]) return true;
  if (mime === 'application/octet-stream' && ALLOWED_EXT[ext]) return true;
  return false;
}

function sanitizeName_(name) {
  const trimmed = safe_(name);
  if (!trimmed) return '';
  return trimmed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function buildFilename_(originalName, uploaderName) {
  const base = originalName.replace(/^.*[\\/]/, '').trim() || 'photo.jpg';
  const safeName = sanitizeName_(uploaderName);
  if (!safeName) return base;

  const dot = base.lastIndexOf('.');
  if (dot === -1) return safeName + '_' + base;
  return safeName + '_' + base.slice(0, dot) + base.slice(dot);
}
