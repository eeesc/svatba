(function () {
  'use strict';

  const cfg = window.PHOTO_UPLOAD_CONFIG || {};
  const uploadMode = cfg.uploadMode || 'multipart';
  const uploadUrl = cfg.uploadUrl || cfg.apiUrl || '/api/upload-photo';
  const driveFolderUrl = cfg.driveFolderUrl || '';
  const strings = cfg.strings || {};

  const t = (key, fallback) => strings[key] || fallback;

  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp',
  ];
  const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'];

  const root = document.getElementById('photo-upload');
  if (!root) return;

  const dropzone = root.querySelector('#pu-dropzone');
  const fileInput = root.querySelector('#pu-file-input');
  const chooseBtn = root.querySelector('#pu-choose-btn');
  const fromInput = root.querySelector('#pu-from');
  const previewList = root.querySelector('#pu-preview-list');
  const uploadBtn = root.querySelector('#pu-upload-btn');
  const globalError = root.querySelector('#pu-error');
  const successBox = root.querySelector('#pu-success');
  const uploadPanel = root.querySelector('#pu-upload-panel');
  const driveLink = root.querySelector('#pu-drive-link');

  let queue = [];

  if (driveLink && driveFolderUrl) {
    driveLink.href = driveFolderUrl;
  } else if (driveLink) {
    driveLink.closest('.pu-manual')?.classList.add('pu-manual--disabled');
  }

  function extOf(name) {
    const i = name.lastIndexOf('.');
    return i === -1 ? '' : name.slice(i).toLowerCase();
  }

  function isAllowedFile(file) {
    const mime = (file.type || '').toLowerCase();
    const ext = extOf(file.name);
    if (ALLOWED_TYPES.includes(mime)) return true;
    if (ALLOWED_EXT.includes(ext)) return true;
    if (mime === 'application/octet-stream' && ALLOWED_EXT.includes(ext)) return true;
    return false;
  }

  function showError(message) {
    globalError.textContent = message;
    globalError.hidden = !message;
  }

  function fileKey(file) {
    return [file.name, file.size, file.lastModified].join('|');
  }

  function addFiles(fileList) {
    showError('');
    const incoming = Array.from(fileList || []);
    const rejected = [];

    incoming.forEach((file) => {
      if (!isAllowedFile(file)) {
        rejected.push(file.name);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(file.name + ' (>20 MB)');
        return;
      }
      const key = fileKey(file);
      if (queue.some((item) => item.key === key)) return;
      queue.push({
        key,
        file,
        status: 'pending',
        progress: 0,
        error: '',
      });
    });

    if (rejected.length) {
      showError(
        t('errRejected', 'Some files were skipped (unsupported format or over 20 MB): ') +
          rejected.join(', ')
      );
    }

    renderPreview();
    uploadBtn.disabled = queue.length === 0;
  }

  function renderPreview() {
    previewList.innerHTML = '';

    queue.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'pu-preview-item';
      row.dataset.index = String(index);

      const thumb = document.createElement('div');
      thumb.className = 'pu-thumb';
      const img = document.createElement('img');
      img.alt = '';
      thumb.appendChild(img);

      if (item.file.type.startsWith('image/') || ALLOWED_EXT.includes(extOf(item.file.name))) {
        const url = URL.createObjectURL(item.file);
        img.src = url;
        img.onload = () => URL.revokeObjectURL(url);
      }

      const meta = document.createElement('div');
      meta.className = 'pu-meta';

      const name = document.createElement('div');
      name.className = 'pu-name';
      name.textContent = item.file.name;

      const barWrap = document.createElement('div');
      barWrap.className = 'pu-progress';
      barWrap.hidden = item.status === 'pending' || item.status === 'done';

      const bar = document.createElement('div');
      bar.className = 'pu-progress-bar';
      bar.style.width = item.progress + '%';
      barWrap.appendChild(bar);

      const status = document.createElement('div');
      status.className = 'pu-status';
      if (item.status === 'done') {
        status.textContent = t('statusDone', 'Uploaded');
        status.classList.add('pu-status--ok');
      } else if (item.status === 'error') {
        status.textContent = item.error || t('statusError', 'Failed');
        status.classList.add('pu-status--err');
      } else if (item.status === 'uploading') {
        status.textContent = item.statusText || t('statusUploading', 'Uploading…');
      }

      meta.append(name, barWrap, status);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'pu-remove';
      removeBtn.setAttribute('aria-label', t('remove', 'Remove'));
      removeBtn.textContent = '×';
      removeBtn.disabled = item.status === 'uploading';
      removeBtn.addEventListener('click', () => {
        if (item.status === 'uploading') return;
        queue.splice(index, 1);
        renderPreview();
        uploadBtn.disabled = queue.length === 0;
      });

      row.append(thumb, meta, removeBtn);
      previewList.appendChild(row);
    });
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string' || result.indexOf(',') === -1) {
          reject(new Error(t('errGeneric', 'Upload failed. Please try again.')));
          return;
        }
        resolve(result.split(',')[1]);
      };
      reader.onerror = () => reject(new Error(t('errGeneric', 'Upload failed. Please try again.')));
      reader.readAsDataURL(file);
    });
  }

  function compressIfNeeded(file) {
    const compressible = /^image\/(jpeg|jpg|png|webp)$/i.test(file.type);
    if (!compressible || file.size < 800 * 1024) {
      return Promise.resolve(file);
    }

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 2048;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const outType = file.type === 'image/png' ? 'image/jpeg' : file.type;
            const outName = extOf(file.name) === '.png'
              ? file.name.replace(/\.png$/i, '.jpg')
              : file.name;
            resolve(new File([blob], outName, { type: outType, lastModified: Date.now() }));
          },
          file.type === 'image/png' ? 'image/jpeg' : file.type,
          0.85
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };

      img.src = url;
    });
  }

  function parseAppsScriptResponse(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      throw new Error(t('errEmptyResponse', 'Empty response from server.'));
    }
    if (trimmed.charAt(0) === '<') {
      throw new Error(
        t(
          'errAccess',
          'Upload server is not publicly accessible. Redeploy the Apps Script web app with access set to Anyone.'
        )
      );
    }
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      throw new Error(t('errGeneric', 'Upload failed. Please try again.'));
    }
  }

  function uploadOneAppsScript(item, uploaderName) {
    return new Promise(async (resolve, reject) => {
      try {
        item.progress = 5;
        item.status = 'uploading';
        item.statusText = t('statusPreparing', 'Preparing…');
        renderPreview();

        const prepared = await compressIfNeeded(item.file);
        item.progress = 20;
        item.statusText = t('statusUploading', 'Uploading…');
        renderPreview();

        const fileData = await readFileAsBase64(prepared);
        item.progress = 35;
        renderPreview();

        const payload = JSON.stringify({
          fileName: prepared.name,
          mimeType: prepared.type || 'application/octet-stream',
          fileData,
          from: uploaderName || '',
        });

        const xhr = new XMLHttpRequest();
        const timeoutMs = 120000;
        const timer = setTimeout(() => {
          xhr.abort();
          reject(new Error(t('errTimeout', 'Upload timed out. Try a smaller photo or better connection.')));
        }, timeoutMs);

        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');

        xhr.upload.addEventListener('progress', (e) => {
          if (!e.lengthComputable) return;
          item.progress = 35 + Math.round((e.loaded / e.total) * 60);
          renderPreview();
        });

        xhr.addEventListener('load', () => {
          clearTimeout(timer);
          try {
            const data = parseAppsScriptResponse(xhr.responseText);
            if (data && data.success) {
              item.status = 'done';
              item.progress = 100;
              renderPreview();
              resolve();
              return;
            }
            reject(new Error((data && data.error) || t('errGeneric', 'Upload failed. Please try again.')));
          } catch (err) {
            reject(err);
          }
        });

        xhr.addEventListener('error', () => {
          clearTimeout(timer);
          reject(new Error(t('errNetwork', 'Network error. Check your connection and try again.')));
        });

        xhr.addEventListener('abort', () => {
          clearTimeout(timer);
        });

        xhr.send(payload);
      } catch (err) {
        reject(err);
      }
    });
  }

  function uploadOneMultipart(item, uploaderName) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('files', item.file, item.file.name);
      if (uploaderName) form.append('from', uploaderName);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);
      xhr.responseType = 'json';

      xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        item.progress = Math.round((e.loaded / e.total) * 100);
        renderPreview();
      });

      xhr.addEventListener('load', () => {
        const body = xhr.response;
        if (xhr.status >= 200 && xhr.status < 300 && body && body.success) {
          item.status = 'done';
          item.progress = 100;
          resolve();
          return;
        }
        const msg =
          (body && (body.error || body.message)) ||
          t('errGeneric', 'Upload failed. Please try again.');
        reject(new Error(msg));
      });

      xhr.addEventListener('error', () => {
        reject(new Error(t('errNetwork', 'Network error. Check your connection and try again.')));
      });

      xhr.send(form);
    });
  }

  function uploadOne(item, uploaderName) {
    if (uploadMode === 'apps-script') {
      return uploadOneAppsScript(item, uploaderName);
    }
    return uploadOneMultipart(item, uploaderName);
  }

  async function uploadAll() {
    showError('');
    const pending = queue.filter((item) => item.status !== 'done');
    if (!pending.length) return;

    const uploaderName = fromInput ? fromInput.value.trim() : '';
    uploadBtn.disabled = true;
    chooseBtn.disabled = true;
    if (fromInput) fromInput.disabled = true;

    let failed = false;

    for (const item of pending) {
      item.status = 'uploading';
      item.progress = 0;
      item.error = '';
      renderPreview();

      try {
        await uploadOne(item, uploaderName);
      } catch (err) {
        item.status = 'error';
        item.error = err.message || t('statusError', 'Failed');
        failed = true;
        renderPreview();
      }
    }

    chooseBtn.disabled = false;
    if (fromInput) fromInput.disabled = false;

    if (!failed && queue.every((item) => item.status === 'done')) {
      uploadPanel.hidden = true;
      successBox.hidden = false;
      return;
    }

    uploadBtn.disabled = false;
    if (failed) {
      showError(t('errPartial', 'Some photos did not upload. Remove failed ones or try again.'));
    }
  }

  chooseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('pu-dropzone--active');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('pu-dropzone--active');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    addFiles(e.dataTransfer.files);
  });

  dropzone.addEventListener('click', (e) => {
    if (e.target === chooseBtn || e.target.closest('button')) return;
    fileInput.click();
  });

  uploadBtn.addEventListener('click', uploadAll);
})();
