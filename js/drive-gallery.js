(function () {
  'use strict';

  const cfg = window.PHOTO_GALLERY_CONFIG || {};
  const listUrl = cfg.listUrl || '';
  const postUrl = cfg.postUrl || listUrl.replace(/\?.*$/, '');
  const embedFolderId = cfg.embedFolderId || '';
  const cacheKey = cfg.cacheKey || 'svatba_gallery_photos_v3';
  const cacheTtlMs = cfg.cacheTtlMs || 10 * 60 * 1000;
  const eagerCount = cfg.eagerCount || 6;
  const strings = cfg.strings || {};
  const t = (key, fallback) => strings[key] || fallback;

  const galleryEl = document.getElementById('drive-gallery');
  const statusEl = document.getElementById('drive-gallery-status');
  if (!galleryEl || !listUrl) return;

  function initLightbox(container) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lb-img');
    const lbIframe = document.getElementById('lb-iframe');
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
    }

    function open(idx) {
      if (!lightboxItems.length) return;
      current = (idx + lightboxItems.length) % lightboxItems.length;
      const item = lightboxItems[current];
      const type = item.dataset.type || 'image';
      const full = item.dataset.full || '';

      resetMedia();
      lb.classList.toggle('lightbox--video', type === 'video');

      if (type === 'video' && lbIframe && full) {
        lbIframe.hidden = false;
        lbIframe.src = full;
      } else {
        lbImg.hidden = false;
        lbImg.src = full || item.querySelector('img')?.src || '';
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

  function photoIds(photos) {
    return photos.map(function (p) { return p.id; }).join(',');
  }

  async function fetchListText() {
    if (window.__galleryListPromise) {
      const text = await window.__galleryListPromise;
      window.__galleryListPromise = null;
      return text;
    }
    const res = await fetch(listUrl);
    return res.text();
  }

  async function fetchPhotosPost() {
    const res = await fetch(postUrl, {
      method: 'POST',
      body: new Blob([JSON.stringify({ action: 'list' })], { type: 'text/plain' }),
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
    let text = '';
    try {
      text = await fetchListText();
      const data = parseJson(text);
      if (Array.isArray(data.photos)) return data.photos;
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

      const img = document.createElement('img');
      img.src = photo.thumb;
      img.alt = photo.name || '';
      img.decoding = 'async';
      if (index >= eagerCount) img.loading = 'lazy';

      item.appendChild(img);
      galleryEl.appendChild(item);
    });

    initLightbox(galleryEl);
  }

  async function loadGallery() {
    const cached = readCache();
    if (cached && cached.length) {
      renderPhotos(cached);
    } else {
      setStatus(t('loading', 'Načítám fotky…'), false);
      galleryEl.innerHTML = '';
    }

    try {
      const photos = await fetchPhotos();
      writeCache(photos);
      if (!cached || photoIds(cached) !== photoIds(photos)) {
        renderPhotos(photos);
      }
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
    loadGallery();
  });
})();
