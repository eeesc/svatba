(function () {
  'use strict';

  const cfg = window.STATIC_GALLERY_CONFIG || {};
  const galleryId = cfg.galleryId || 'static-gallery';
  const galleryEl = document.getElementById(galleryId);
  if (!galleryEl) return;

  const thumbPath = cfg.thumbPath || '';
  const fullPath = cfg.fullPath || thumbPath;
  const eagerCount = cfg.eagerCount || 8;

  function sortByFilename(files) {
    return files.slice().sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }

  function getPhotos() {
    return cfg.photos || [];
  }

  function render() {
    const ordered = sortByFilename(getPhotos());
    galleryEl.innerHTML = '';

    ordered.forEach(function (file, index) {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.dataset.type = 'image';
      item.dataset.full = fullPath + file;

      const img = document.createElement('img');
      img.src = thumbPath + file;
      img.alt = '';
      img.decoding = 'async';
      if (index < eagerCount) {
        img.loading = 'eager';
        img.setAttribute('fetchpriority', 'high');
      } else {
        img.loading = 'lazy';
      }

      item.appendChild(img);
      galleryEl.appendChild(item);
    });

    if (window.GalleryLightbox) {
      window.GalleryLightbox.attach(galleryEl, {
        captionFrom: cfg.captionFrom,
      });
    }
  }

  if (getPhotos().length) {
    render();
    return;
  }

  const manifestUrl = cfg.manifestUrl;
  if (!manifestUrl) return;

  fetch(manifestUrl)
    .then(function (res) { return res.json(); })
    .then(function (files) {
      cfg.photos = sortByFilename(files);
      render();
    })
    .catch(function () {});
})();
