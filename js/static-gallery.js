(function () {
  'use strict';

  const cfg = window.STATIC_GALLERY_CONFIG || {};
  const galleryId = cfg.galleryId || 'static-gallery';
  const galleryEl = document.getElementById(galleryId);
  if (!galleryEl) return;

  const thumbPath = cfg.thumbPath || '';
  const fullPath = cfg.fullPath || thumbPath;
  const eagerCount = cfg.eagerCount || 8;
  const useMasonry = !!cfg.masonry;
  const mobileQuery = window.matchMedia('(max-width: 620px)');

  function sortByFilename(files) {
    return files.slice().sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }

  function getPhotos() {
    return cfg.photos || [];
  }

  function columnCount() {
    if (!useMasonry) return 1;
    return mobileQuery.matches ? 2 : 3;
  }

  function createItem(file, index) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset.type = 'image';
    item.dataset.full = fullPath + file;
    item.dataset.photoIndex = String(index);

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
    return item;
  }

  function render() {
    const ordered = sortByFilename(getPhotos());
    galleryEl.innerHTML = '';

    if (!ordered.length) return;

    if (useMasonry) {
      const cols = columnCount();
      const columns = [];
      for (let c = 0; c < cols; c++) {
        const col = document.createElement('div');
        col.className = 'gallery-masonry__col';
        galleryEl.appendChild(col);
        columns.push(col);
      }

      ordered.forEach(function (file, index) {
        columns[index % cols].appendChild(createItem(file, index));
      });
    } else {
      ordered.forEach(function (file, index) {
        galleryEl.appendChild(createItem(file, index));
      });
    }

    if (window.GalleryLightbox) {
      window.GalleryLightbox.attach(galleryEl, {
        captionFrom: cfg.captionFrom,
      });
    }
  }

  function start() {
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
  }

  if (useMasonry && mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', render);
  }

  start();
})();
