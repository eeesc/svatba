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
  const sizeCache = new Map();
  let layoutTimer = 0;

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

  function loadDimensions(file) {
    if (sizeCache.has(file)) {
      return Promise.resolve(sizeCache.get(file));
    }

    return new Promise(function (resolve) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        const size = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
        sizeCache.set(file, size);
        resolve(size);
      };
      img.onerror = function () {
        const size = { w: 3, h: 2 };
        sizeCache.set(file, size);
        resolve(size);
      };
      img.src = thumbPath + file;
    });
  }

  function spacingPx(columns) {
    const probe = document.createElement('div');
    probe.className = 'gallery-item';
    columns[0].appendChild(probe);
    const itemGap = parseFloat(window.getComputedStyle(probe).marginBottom) || 12;
    const colGap = parseFloat(window.getComputedStyle(columns[0]).marginRight) || 12;
    probe.remove();
    return { itemGap: itemGap, colGap: colGap };
  }

  function columnWidth(cols, colGap) {
    const total = galleryEl.clientWidth;
    if (!total) return 220;
    return (total - colGap * (cols - 1)) / cols;
  }

  function buildColumns(cols) {
    galleryEl.innerHTML = '';
    const columns = [];
    for (let c = 0; c < cols; c++) {
      const col = document.createElement('div');
      col.className = 'gallery-masonry__col';
      galleryEl.appendChild(col);
      columns.push(col);
    }
    return columns;
  }

  function attachLightbox() {
    if (window.GalleryLightbox) {
      window.GalleryLightbox.attach(galleryEl, {
        captionFrom: cfg.captionFrom,
      });
    }
  }

  function renderFlat(ordered) {
    galleryEl.innerHTML = '';
    ordered.forEach(function (file, index) {
      galleryEl.appendChild(createItem(file, index));
    });
    attachLightbox();
  }

  function renderMasonry(ordered) {
    const cols = columnCount();
    if (!ordered.length) {
      galleryEl.innerHTML = '';
      return;
    }

    Promise.all(ordered.map(function (file) { return loadDimensions(file); }))
      .then(function (sizes) {
        const columns = buildColumns(cols);
        const spacing = spacingPx(columns);
        const colHeights = new Array(cols).fill(0);
        const width = columnWidth(cols, spacing.colGap);

        ordered.forEach(function (file, index) {
          const size = sizes[index];
          const estHeight = (size.h / size.w) * width;

          let target = 0;
          for (let c = 1; c < cols; c++) {
            if (colHeights[c] < colHeights[target]) target = c;
          }

          columns[target].appendChild(createItem(file, index));
          colHeights[target] += estHeight + spacing.itemGap;
        });

        attachLightbox();
      })
      .catch(function () {
        renderFlat(ordered);
      });
  }

  function render() {
    const ordered = sortByFilename(getPhotos());
    if (!ordered.length) {
      galleryEl.innerHTML = '';
      return;
    }

    if (useMasonry) {
      renderMasonry(ordered);
      return;
    }

    renderFlat(ordered);
  }

  function scheduleRender() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(render, 120);
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

  if (useMasonry) {
    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener('change', scheduleRender);
    }
    window.addEventListener('resize', scheduleRender);
  }

  start();
})();
