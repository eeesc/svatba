window.GalleryLightbox = (function () {
  'use strict';

  let current = 0;
  let items = [];
  let captionTemplate = 'Od {name}';
  let initialized = false;

  let lb;
  let lbImg;
  let lbIframe;
  let lbCaption;
  let lbCount;

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
    if (!items.length) return;
    current = (idx + items.length) % items.length;
    const item = items[current];
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
      lbCaption.textContent = captionTemplate.replace('{name}', uploader);
      lbCaption.hidden = false;
    }

    if (lbCount) lbCount.textContent = (current + 1) + ' / ' + items.length;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    resetMedia();
    lb.classList.remove('lightbox--video');
    lb.classList.remove('open');
    document.body.style.overflow = '';
  }

  function initOnce() {
    if (initialized) return;
    initialized = true;

    lb = document.getElementById('lightbox');
    lbImg = document.getElementById('lb-img');
    lbIframe = document.getElementById('lb-iframe');
    lbCaption = document.getElementById('lb-caption');
    lbCount = document.getElementById('lb-counter');
    if (!lb || !lbImg) return;

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

  function attach(container, options) {
    initOnce();
    if (!container || !lb) return;

    const localItems = Array.from(container.querySelectorAll('.gallery-item'));
    const localCaption = (options && options.captionFrom) || captionTemplate;
    localItems.forEach(function (item, i) {
      item.onclick = function () {
        items = localItems;
        captionTemplate = localCaption;
        open(i);
      };
    });
  }

  return { attach: attach, close: close };
})();
