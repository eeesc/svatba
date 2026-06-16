/**
 * Google Apps Script backend for guest photo uploads.
 * Runs as you (the script owner), so uploads work into a normal My Drive folder.
 *
 * Setup:
 * 1) script.google.com → New project → paste this file.
 * 2) Set FOLDER_ID below to your shared folder.
 * 3) Deploy → New deployment → Web app:
 *      Execute as: Me
 *      Who has access: Anyone   ← must be "Anyone", not "Anyone with Google account"
 * 4) After code changes: Deploy → Manage deployments → Edit → New version → Deploy
 *    (PHOTO_UPLOAD_CONFIG.uploadUrl).
 */

const FOLDER_ID = '1n7GYR_Vjrfv2T2DYal5X1GUFh5c5uFSb';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

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

const ALLOWED_VIDEO_MIME = {
  'video/mp4': true,
  'video/quicktime': true,
  'video/webm': true,
  'video/3gpp': true,
  'video/x-msvideo': true,
};

const ALLOWED_VIDEO_EXT = {
  '.mp4': true,
  '.mov': true,
  '.m4v': true,
  '.webm': true,
  '.3gp': true,
  '.avi': true,
};

function doOptions() {
  return ContentService.createTextOutput('');
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  if (params.test === 'drive') {
    return json_(testDriveAccess_());
  }
  if (params.action === 'list') {
    return json_(listGalleryPhotos_(params.fresh === '1'));
  }
  return json_({ ok: true, service: 'photo-upload', hint: 'Add ?action=list or ?test=drive' });
}

/** Run once from the script editor (▶) to trigger the Google authorization prompt. */
function runAuthorizationTest() {
  const result = testDriveAccess_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testDriveAccess_() {
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const name = folder.getName();
    return {
      ok: true,
      folderId: FOLDER_ID,
      folderName: name,
      canAccessDrive: true,
      message: 'Drive access OK — uploads should work.',
    };
  } catch (err) {
    return {
      ok: false,
      folderId: FOLDER_ID,
      canAccessDrive: false,
      error: err && err.message ? String(err.message) : 'Drive access failed.',
      message:
        'Open Apps Script → select runAuthorizationTest → Run ▶ → approve all prompts → redeploy web app.',
    };
  }
}

function doPost(e) {
  try {
    const payload = readPayload_(e);

    if (safe_(payload.action) === 'list') {
      return json_(listGalleryPhotos_(true));
    }

    const fileName = safe_(payload.fileName);
    const mimeType = safe_(payload.mimeType) || 'application/octet-stream';
    const fileData = payload.fileData;
    const from = safe_(payload.from);

    if (!fileName || !fileData) {
      return json_({ success: false, error: 'Missing file data.' });
    }

    if (!isAllowedUpload_(fileName, mimeType)) {
      return json_({
        success: false,
        error: 'Unsupported format. Use JPEG, PNG, HEIC, WebP, MP4, MOV, or WebM.',
      });
    }

    const bytes = Utilities.base64Decode(fileData);
    const maxBytes = maxUploadBytes_(fileName, mimeType);
    if (bytes.length > maxBytes) {
      const limitMb = isAllowedVideo_(fileName, mimeType) ? 40 : 20;
      return json_({ success: false, error: 'File is larger than ' + limitMb + ' MB.' });
    }

    const storedAs = buildFilename_(fileName, from);
    const blob = Utilities.newBlob(bytes, mimeType, storedAs);
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const file = folder.createFile(blob);
    makeFileViewable_(file);
    invalidateGalleryCache_();

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

function readPayload_(e) {
  if (e && e.postData && e.postData.contents) {
    const raw = e.postData.getDataAsString();
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (parseErr) {
        throw new Error('Invalid upload payload.');
      }
    }
  }

  if (e && e.parameter) {
    return {
      fileName: e.parameter.fileName,
      mimeType: e.parameter.mimeType,
      fileData: e.parameter.fileData,
      from: e.parameter.from,
    };
  }

  return {};
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

function isAllowedVideo_(fileName, mimeType) {
  const mime = mimeType.toLowerCase();
  const ext = extOf_(fileName);
  if (ALLOWED_VIDEO_MIME[mime]) return true;
  if (ALLOWED_VIDEO_EXT[ext]) return true;
  if (mime === 'application/octet-stream' && ALLOWED_VIDEO_EXT[ext]) return true;
  return false;
}

function isAllowedUpload_(fileName, mimeType) {
  return isAllowedImage_(fileName, mimeType) || isAllowedVideo_(fileName, mimeType);
}

function maxUploadBytes_(fileName, mimeType) {
  if (isAllowedVideo_(fileName, mimeType)) return MAX_VIDEO_BYTES;
  return MAX_IMAGE_BYTES;
}

function isGalleryVideo_(fileName, mimeType) {
  if (isAllowedVideo_(fileName, mimeType)) return true;
  return /^video\//.test((mimeType || '').toLowerCase());
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
  if (dot === -1) return safeName + '__' + base;
  return safeName + '__' + base.slice(0, dot) + base.slice(dot);
}

function parseUploaderFromFilename_(fileName) {
  const base = fileName.replace(/^.*[\\/]/, '').trim();
  if (!base) return '';

  const dot = base.lastIndexOf('.');
  const stem = dot === -1 ? base : base.slice(0, dot);

  const delim = stem.indexOf('__');
  if (delim > 0) {
    const label = formatUploaderLabel_(stem.slice(0, delim));
    if (label) return label;
  }

  const patterns = [
    /^(.+)_(IMG_\d+)$/i,
    /^(.+)_(DSC\d+)$/i,
    /^(.+)_(MVIMG_\d+)$/i,
    /^(.+)_(MVI_\d+)$/i,
    /^(.+)_(VID_\d+)$/i,
    /^(.+)_(P\d{7})$/i,
    /^(.+)_(20\d{12}.*)$/i,
    /^(.+)_(RPReplay_Final\d+.*)$/i,
    /^(.+)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    /^(.+)_(\d{5,}(?:-\d+)?)$/,
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = stem.match(patterns[i]);
    if (match) {
      var label = formatUploaderLabel_(match[1]);
      if (label) return label;
    }
  }

  return '';
}

function formatUploaderLabel_(safeName) {
  if (!safeName) return '';
  if (/^(test|perm-test|permission-test)/i.test(safeName)) return '';
  if (!/[a-zA-Z\u00C0-\u024F]/.test(safeName)) return '';
  return safeName.replace(/_/g, ' ').trim();
}

const GALLERY_CACHE_KEY = 'gallery_list_v4';
const GALLERY_CACHE_SEC = 120;

function listGalleryPhotos_(skipCache) {
  const cache = CacheService.getScriptCache();
  if (!skipCache) {
    try {
      const cached = cache.get(GALLERY_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (_) {}
  }

  const result = buildGalleryList_();
  try {
    cache.put(GALLERY_CACHE_KEY, JSON.stringify(result), GALLERY_CACHE_SEC);
  } catch (_) {}
  return result;
}

function buildGalleryList_() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const iterator = folder.getFiles();
  const photos = [];

  while (iterator.hasNext()) {
    const file = iterator.next();
    const name = file.getName();
    if (shouldSkipGalleryFile_(name)) continue;

    const mime = file.getMimeType();
    const isVideo = isGalleryVideo_(name, mime);
    if (!isAllowedImage_(name, mime) && !isVideo && !/^image\//.test(mime)) continue;

    const id = file.getId();
    makeFileViewable_(file);
    const uploader = parseUploaderFromFilename_(name);

    if (isVideo) {
      photos.push({
        id: id,
        name: name,
        type: 'video',
        uploader: uploader,
        thumb: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w600',
        full: 'https://drive.google.com/file/d/' + id + '/preview',
        created: file.getDateCreated().toISOString(),
      });
      continue;
    }

    photos.push({
      id: id,
      name: name,
      type: 'image',
      uploader: uploader,
      thumb: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w600',
      full: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1920',
      created: file.getDateCreated().toISOString(),
    });
  }

  photos.sort(function (a, b) {
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });

  return { ok: true, count: photos.length, photos: photos };
}

function invalidateGalleryCache_() {
  try {
    CacheService.getScriptCache().remove(GALLERY_CACHE_KEY);
  } catch (_) {}
}

function shouldSkipGalleryFile_(name) {
  if (!name) return true;
  if (name.indexOf('_chunk_') !== -1) return true;
  if (/^(_svatba_upload_test|perm-test|permission-test|test[-_])/i.test(name)) return true;
  return false;
}

function makeFileViewable_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (_) {}
}
