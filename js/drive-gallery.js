(function () {
  'use strict';

  const cfg = window.PHOTO_GALLERY_CONFIG || {};
  const listUrl = cfg.listUrl || '';
  const postUrl = cfg.postUrl || listUrl.replace(/\?.*$/, '');
  const embedFolderId = cfg.embedFolderId || '';
  const strings = cfg.strings || {};
  const t = (key, fallback) => strings[key] || fallback;

  const galleryEl = document.getElementById('drive-gallery');
  const statusEl = document.getElementById('drive-gallery-status');
  if (!galleryEl || !listUrl) return;

  function initLightbox(container) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lb-img');
    const lbCount = document.getElementById('lb-counter');
    if (!lb || !lbImg) return;

    let current = 0;
    const lightboxItems = Array.from(container.querySelectorAll('.gallery-item img'));

    function open(idx) {
      if (!lightboxItems.length) return;
      current = (idx + lightboxItems.length) % lightboxItems.length;
      lbImg.src = lightboxItems[current].dataset.full || lightboxItems[current].src;
      if (lbCount) lbCount.textContent = (current + 1) + ' / ' + lightboxItems.length;
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      lb.classList.remove('open');
      document.body.style.overflow = '';
    }

    lightboxItems.forEach(function (img, i) {
      img.parentElement.addEventListener('click', function () { open(i); });
    });

    const closeBtn = document.getElementById('lb-close');
    const prevBtn = document.getElementById('lb-prev');
    const nextBtn = document.getElementById('lb-next');

    if (closeBtn) closeBtn.onclick = close;
    if (prevBtn) prevBtn.onclick = function (e) { e.stopPropagation(); open(current - 1); };
    if (nextBtn) nextBtn.onclick = function (e) { e.stopPropagation(); open(current + 1); };
    lb.onclick = function (e) { if (e.target === lb) close(); };

    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'ArrowLeft') open(current - 1);
      if (e.key === 'ArrowRight') open(current + 1);
      if (e.key === 'Escape') close();
    });

    let swipeX = 0;
    lbImg.addEventListener('touchstart', function (e) {
      swipeX = e.touches[0].clientX;
    }, { passive: true });
    lbImg.addEventListener('touchend', function (e) {
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

  async function fetchPhotosGet() {
    const res = await fetch(listUrl);
    const data = parseJson(await res.text());
    if (Array.isArray(data.photos)) return data.photos;
    return null;
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
    try {
      const fromGet = await fetchPhotosGet();
      if (fromGet && fromGet.length) return fromGet;
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

    photos.forEach(function (photo) {
      const item = document.createElement('div');
      item.className = 'gallery-item';

      const img = document.createElement('img');
      img.src = photo.thumb;
      img.dataset.full = photo.full;
      img.alt = photo.name || '';
      img.loading = 'lazy';

      item.appendChild(img);
      galleryEl.appendChild(item);
    });

    initLightbox(galleryEl);
  }

  async function loadGallery() {
    setStatus(t('loading', 'Načítám fotky…'), false);
    galleryEl.innerHTML = '';

    try {
      const photos = await fetchPhotos();
      renderPhotos(photos);
    } catch (err) {
      if (!showEmbedFallback()) {
        setStatus(err.message || t('errLoad', 'Galerii se nepovedlo načíst.'), true);
      }
    }
  }

  loadGallery();
  window.addEventListener('photo-upload:success', loadGallery);
})();
