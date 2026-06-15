(function () {
  'use strict';

  const cfg = window.PHOTO_GALLERY_CONFIG || {};
  const listUrl = cfg.listUrl || '';
  const strings = cfg.strings || {};
  const t = (key, fallback) => strings[key] || fallback;

  const galleryEl = document.getElementById('drive-gallery');
  const statusEl = document.getElementById('drive-gallery-status');
  if (!galleryEl || !listUrl) return;

  let lightboxItems = [];

  function initLightbox(container) {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lb-img');
    const lbCount = document.getElementById('lb-counter');
    if (!lb || !lbImg) return;

    let current = 0;
    lightboxItems = Array.from(container.querySelectorAll('.gallery-item img'));

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

  function renderPhotos(photos) {
    galleryEl.innerHTML = '';

    if (!photos.length) {
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
      const res = await fetch(listUrl);
      const text = await res.text();
      const data = JSON.parse(text);

      if (!data || !data.ok) {
        throw new Error((data && data.error) || t('errLoad', 'Galerii se nepovedlo načíst.'));
      }

      renderPhotos(data.photos || []);
    } catch (err) {
      setStatus(err.message || t('errLoad', 'Galerii se nepovedlo načíst.'), true);
    }
  }

  loadGallery();
  window.addEventListener('photo-upload:success', loadGallery);
})();
