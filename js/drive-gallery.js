(function () {
  'use strict';

  const cfg = window.PHOTO_GALLERY_CONFIG || {};
  const listUrl = cfg.listUrl || '';
  const postUrl = cfg.postUrl || listUrl.replace(/\?.*$/, '');
  const embedFolderId = cfg.embedFolderId || '';
  const cacheKey = cfg.cacheKey || 'svatba_gallery_photos_v5';
  const cacheTtlMs = cfg.cacheTtlMs || 2 * 60 * 1000;
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

  function initLightbox(container) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lb-img');
    const lbIframe = document.getElementById('lb-iframe');
    const lbCaption = document.getElementById('lb-caption');
    const lbCount = document.getElementById('lb-counter');
    if (!lb || !lbImg) return;

    let current = 0;
    const lightboxItems = Array.from(container.querySelectorAll('.gallery-item'));

    function resetMedia() {
      lbImg.hidden = true;
      lbImg.removeAttribute('src');
      if (lbIframe) {
        lbIframe.hidden = true;
        lbIframe.removeAttribute('src');
      }
      if (lbCaption) {
        lbCaption.textContent = '';
        lbCaption.hidden = true;
      }
    }

    function open(idx) {
      if (!lightboxItems.length) return;
      current = (idx + lightboxItems.length) % lightboxItems.length;
      const item = lightboxItems[current];
      const type = item.dataset.type || 'image';
      const full = item.dataset.full || '';
      const uploader = item.dataset.uploader || '';

      resetMedia();
      lb.classList.toggle('lightbox--video', type === 'video');

      if (type === 'video' && lbIframe && full) {
        lbIframe.hidden = false;
        lbIframe.src = full;
      } else {
        lbImg.hidden = false;
        lbImg.src = full || item.querySelector('img')?.src || '';
      }

      if (lbCaption && uploader) {
        lbCaption.textContent = t('captionFrom', 'Od {name}').replace('{name}', uploader);
        lbCaption.hidden = false;
      }

      if (lbCount) lbCount.textContent = (current + 1) + ' / ' + lightboxItems.length;
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      resetMedia();
      lb.classList.remove('lightbox--video');
      lb.classList.remove('open');
      document.body.style.overflow = '';
    }

    lightboxItems.forEach(function (item, i) {
      item.addEventListener('click', function () { open(i); });
    });

    const closeBtn = document.getElementById('lb-close');
    const prevBtn = document.getElementById('lb-prev');
    const nextBtn = document.getElementById('lb-next');

    if (closeBtn) closeBtn.onclick = close;
    if (prevBtn) prevBtn.onclick = function (e) { e.stopPropagation(); open(current - 1); };
    if (nextBtn) nextBtn.onclick = function (e) { e.stopPropagation(); open(current + 1); };
    lb.onclick = function (e) {
      if (e.target === lb) close();
    };

    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'ArrowLeft') open(current - 1);
      if (e.key === 'ArrowRight') open(current + 1);
      if (e.key === 'Escape') close();
    });

    let swipeX = 0;
    lb.addEventListener('touchstart', function (e) {
      if (e.target !== lbImg && e.target !== lb) return;
      swipeX = e.touches[0].clientX;
    }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (e.target !== lbImg && e.target !== lb) return;
      const dx = e.changedTouches[0].clientX - swipeX;
      if (Math.abs(dx) > 40) dx < 0 ? open(current + 1) : open(current - 1);
    });
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

  function freshListUrl() {
    const join = listUrl.indexOf('?') === -1 ? '?' : '&';
    return listUrl + join + 'fresh=1&_t=' + Date.now();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      loadGallery({ skipCache: true, silent: true });
    }, 400);
  }

  async function fetchPhotosGet() {
    const res = await fetch(freshListUrl());
    const data = parseJson(await res.text());
    if (Array.isArray(data.photos)) return data.photos;
    return null;
  }

  async function fetchPhotosPost() {
    const res = await fetch(postUrl, {
      method: 'POST',
      body: new Blob([JSON.stringify({ action: 'list', fresh: true })], { type: 'text/plain' }),
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

  async function fetchPhotos() {
    try {
      const fromGet = await fetchPhotosGet();
      if (fromGet) return fromGet;
    } catch (_) {}

    return fetchPhotosPost();
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

    initLightbox(galleryEl);
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
      const photos = await fetchPhotos();
      writeCache(photos);
      renderPhotos(photos);
    } catch (err) {
      if (cached && cached.length) return;
      if (!showEmbedFallback()) {
        setStatus(err.message || t('errLoad', 'Galerii se nepovedlo načíst.'), true);
      }
    }
  }

  loadGallery();
  window.addEventListener('photo-upload:success', function () {
    clearCache();
    loadGallery({ skipCache: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      loadGallery({ skipCache: true, silent: true });
    }
  });
})();
