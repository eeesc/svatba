(function () {
  'use strict';

  const cfg = window.PHOTO_GALLERY_CONFIG || {};
  const listUrl = cfg.listUrl || '';
  const postUrl = cfg.postUrl || listUrl.replace(/\?.*$/, '');
  const embedFolderId = cfg.embedFolderId || '';
  const cacheKey = cfg.cacheKey || 'svatba_gallery_photos_v6';
  const cacheTtlMs = cfg.cacheTtlMs || 10 * 60 * 1000;
  const eagerCount = cfg.eagerCount || 6;
  const strings = cfg.strings || {};
  const t = (key, fallback) => strings[key] || fallback;

  const galleryEl = document.getElementById('drive-gallery');
  const statusEl = document.getElementById('drive-gallery-status');
  if (!galleryEl || !listUrl) return;

  let refreshTimer = 0;

  function formatUploaderLabel(safeName) {
    if (!safeName) return '';
    if (/^(test|perm-test|permission-test|_svatba_upload_test)/i.test(safeName)) return '';
    if (!/[a-zA-Z\u00C0-\u024F]/.test(safeName)) return '';
    const label = safeName.replace(/_/g, ' ').trim();
    if (label.length < 2) return '';
    return label;
  }

  function parseUploaderFromFilename(name) {
    const base = (name || '').replace(/^.*[\\/]/, '').trim();
    if (!base) return '';

    const dot = base.lastIndexOf('.');
    const stem = dot === -1 ? base : base.slice(0, dot);

    const delim = stem.indexOf('__');
    if (delim > 0) {
      const label = formatUploaderLabel(stem.slice(0, delim));
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

    for (let i = 0; i < patterns.length; i++) {
      const match = stem.match(patterns[i]);
      if (!match) continue;
      const label = formatUploaderLabel(match[1]);
      if (label) return label;
    }

    return '';
  }

  function photoUploader(photo) {
    if (photo.uploader) return photo.uploader;
    return parseUploaderFromFilename(photo.name);
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.hidden = !message;
    statusEl.classList.toggle('drive-gallery-status--err', !!isError);
  }

  function parseJson(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || trimmed.charAt(0) === '<') {
      throw new Error(t('errLoad', 'Galerii se nepovedlo načíst.'));
    }
    return JSON.parse(trimmed);
  }

  function readCache() {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !Array.isArray(entry.photos) || Date.now() - entry.ts > cacheTtlMs) {
        return null;
      }
      return entry.photos;
    } catch (_) {
      return null;
    }
  }

  function writeCache(photos) {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), photos: photos }));
    } catch (_) {}
  }

  function clearCache() {
    try {
      sessionStorage.removeItem(cacheKey);
    } catch (_) {}
  }

  function listUrlForFetch(forceFresh) {
    if (!forceFresh) return listUrl;
    const join = listUrl.indexOf('?') === -1 ? '?' : '&';
    return listUrl + join + 'fresh=1&_t=' + Date.now();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      loadGallery({ skipCache: true, silent: true });
    }, 400);
  }

  async function fetchPhotosGet(forceFresh) {
    const res = await fetch(listUrlForFetch(forceFresh));
    const data = parseJson(await res.text());
    if (Array.isArray(data.photos)) return data.photos;
    return null;
  }

  async function fetchPhotosPost(forceFresh) {
    const res = await fetch(postUrl, {
      method: 'POST',
      body: new Blob(
        [JSON.stringify({ action: 'list', fresh: !!forceFresh })],
        { type: 'text/plain' }
      ),
    });
    const data = parseJson(await res.text());
    if (Array.isArray(data.photos)) return data.photos;
    if (data && data.hint) {
      throw new Error(
        t(
          'errStale',
          'Galerie potřebuje aktualizovaný Apps Script. V editoru vložte apps-script-upload.gs a nasaďte novou verzi webové aplikace.'
        )
      );
    }
    return [];
  }

  async function fetchPhotos(forceFresh) {
    try {
      const fromGet = await fetchPhotosGet(forceFresh);
      if (fromGet) return fromGet;
    } catch (_) {}

    return fetchPhotosPost(forceFresh);
  }

  function showEmbedFallback() {
    if (!embedFolderId) return false;
    galleryEl.innerHTML =
      '<iframe class="drive-embed" title="Fotky" src="https://drive.google.com/embeddedfolderview?id=' +
      encodeURIComponent(embedFolderId) +
      '#grid"></iframe>';
    setStatus('', false);
    return true;
  }

  function renderPhotos(photos) {
    galleryEl.innerHTML = '';

    if (!photos.length) {
      if (showEmbedFallback()) return;
      setStatus(t('empty', 'Zatím tu nejsou žádné fotky — buďte první!'), false);
      return;
    }

    setStatus('', false);

    photos.forEach(function (photo, index) {
      const isVideo = photo.type === 'video';
      const item = document.createElement('div');
      item.className = 'gallery-item' + (isVideo ? ' gallery-item--video' : '');
      item.dataset.type = isVideo ? 'video' : 'image';
      item.dataset.full = photo.full || '';
      item.dataset.id = photo.id || '';
      const uploader = photoUploader(photo);
      if (uploader) item.dataset.uploader = uploader;

      const img = document.createElement('img');
      img.src = photo.thumb;
      img.alt = photo.name || '';
      img.decoding = 'async';
      if (index >= eagerCount) img.loading = 'lazy';
      img.addEventListener('error', function () {
        item.remove();
        scheduleRefresh();
      }, { once: true });

      item.appendChild(img);
      galleryEl.appendChild(item);
    });

    if (!galleryEl.querySelector('.gallery-item')) {
      renderPhotos([]);
      return;
    }

    if (window.GalleryLightbox) {
      window.GalleryLightbox.attach(galleryEl, {
        captionFrom: t('captionFrom', 'Od {name}'),
      });
    }
  }

  async function loadGallery(options) {
    const opts = options || {};
    const cached = opts.skipCache ? null : readCache();

    if (cached && cached.length) {
      renderPhotos(cached);
    } else if (!opts.silent) {
      setStatus(t('loading', 'Načítám fotky…'), false);
      galleryEl.innerHTML = '';
    }

    try {
      const photos = await fetchPhotos(!!opts.skipCache);
      writeCache(photos);
      renderPhotos(photos);
    } catch (err) {
      if (cached && cached.length) return;
      if (!showEmbedFallback()) {
        setStatus(err.message || t('errLoad', 'Galerii se nepovedlo načíst.'), true);
      }
    }
  }

  let driveGalleryStarted = false;

  function startDriveGallery() {
    if (driveGalleryStarted) return;
    driveGalleryStarted = true;
    loadGallery();
  }

  const communitySection = document.getElementById('komunitni-fotky');
  if (communitySection && listUrl) {
    // Warm the Apps Script list cache while the user browses Dora's photos.
    fetch(listUrl).catch(function () {});
  }

  if (communitySection && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        startDriveGallery();
      }
    }, { rootMargin: '500px' });
    observer.observe(communitySection);
  } else {
    startDriveGallery();
  }

  window.addEventListener('photo-upload:success', function () {
    clearCache();
    loadGallery({ skipCache: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && driveGalleryStarted && !readCache()) {
      loadGallery({ silent: true });
    }
  });
})();
