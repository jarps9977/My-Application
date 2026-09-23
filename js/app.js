(function ($) {
  'use strict';

  /* pdf.worker.min.js above registers window.pdfjsWorker, which pdf.js uses
     as an in-page "fake worker" — a cross-origin `new Worker(url)` throws
     a SecurityError, so we deliberately skip GlobalWorkerOptions.workerSrc. */

  /* Saving files works differently depending on where this page runs:
     - Inside a Claude Artifact, window.claude.use('downloads') is the only
       way to hand a file to the viewer, and it requires one explicit accept
       per file — there's no batched multi-file call.
     - Deployed standalone (a normal URL opened in Safari/Chrome), the page
       can use ordinary web APIs instead: plain <a download> blob links work
       for everything without any per-file confirmation UI of our own. */
  var CLAUDE_MODE = !!(window.claude && typeof window.claude.use === 'function');
  var claudeDownloads = null;
  if (CLAUDE_MODE) {
    window.claude.use('downloads').then(function (api) {
      claudeDownloads = api;
      if (!api) $('#downloads-hint').css('display', 'flex');
    }).catch(function () {
      $('#downloads-hint').css('display', 'flex');
    });
  }

  function triggerBlobDownload(filename, blob) {
    var url = URL.createObjectURL(blob);
    var $a = $('<a>').attr({ href: url, download: filename }).appendTo('body');
    $a[0].click();
    $a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  var state = { pdf: null };

  // ---------- View navigation ----------
  var $viewHome = $('#view-home');
  var $viewPdf = $('#view-pdf');
  var $viewGallery = $('#view-gallery');
  var $viewMerge = $(); // populated once views/merge.html is fetched and mounted
  var $viewSplit = $(); // populated once views/split.html is fetched and mounted
  var $viewConvertFiles = $(); // populated once views/convert-files.html is fetched and mounted
  var $viewTextGen = $(); // populated once views/text-gen.html is fetched and mounted
  var $viewTestFile = $(); // populated once views/test-file.html is fetched and mounted
  var $viewVideoConvert = $(); // populated once views/video-convert.html is fetched and mounted
  var $viewFileResize = $(); // populated once views/file-resize.html is fetched and mounted
  var $viewFileEncrypt = $(); // populated once views/file-encrypt.html is fetched and mounted
  function openView($view) {
    $viewHome.attr('hidden', true);
    $viewPdf.attr('hidden', true);
    $viewMerge.attr('hidden', true);
    $viewSplit.attr('hidden', true);
    $viewConvertFiles.attr('hidden', true);
    $viewTextGen.attr('hidden', true);
    $viewTestFile.attr('hidden', true);
    $viewVideoConvert.attr('hidden', true);
    $viewFileResize.attr('hidden', true);
    $viewFileEncrypt.attr('hidden', true);
    $view.removeAttr('hidden');
  }
  $('#btn-back').on('click', function () {
    $viewPdf.attr('hidden', true);
    $viewHome.removeAttr('hidden');
  });

  // The "merge PDF" view's markup lives in views/merge.html instead of being
  // inlined in index.html — fetched once, mounted over #view-merge-mount,
  // then wired up (its elements don't exist until this resolves, so the
  // merge tile's click handler awaits this promise before opening the view).
  var mergeViewReady = $.get('views/merge.html').done(function (html) {
    $('#view-merge-mount').replaceWith(html);
    $viewMerge = $('#view-merge');
    $('#btn-merge-back').on('click', function () {
      $viewMerge.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initMergeView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/merge.html ได้');
  });

  // Same fetch-and-mount pattern for the "split PDF" view (views/split.html).
  var splitViewReady = $.get('views/split.html').done(function (html) {
    $('#view-split-mount').replaceWith(html);
    $viewSplit = $('#view-split');
    $('#btn-split-back').on('click', function () {
      $viewSplit.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initSplitView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/split.html ได้');
  });

  // Same fetch-and-mount pattern for the "convert files" view
  // (views/convert-files.html).
  var convertFilesViewApi = null;
  var convertFilesViewReady = $.get('views/convert-files.html').done(function (html) {
    $('#view-convert-files-mount').replaceWith(html);
    $viewConvertFiles = $('#view-convert-files');
    $('#btn-convert-files-back').on('click', function () {
      $viewConvertFiles.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    convertFilesViewApi = initConvertFilesView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/convert-files.html ได้');
  });

  // Same fetch-and-mount pattern for the "text generator" view
  // (views/text-gen.html).
  var textGenViewReady = $.get('views/text-gen.html').done(function (html) {
    $('#view-text-gen-mount').replaceWith(html);
    $viewTextGen = $('#view-text-gen');
    $('#btn-text-gen-back').on('click', function () {
      $viewTextGen.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initTextGenView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/text-gen.html ได้');
  });

  // Same fetch-and-mount pattern for the "test file generator" view
  // (views/test-file.html).
  var testFileViewReady = $.get('views/test-file.html').done(function (html) {
    $('#view-test-file-mount').replaceWith(html);
    $viewTestFile = $('#view-test-file');
    $('#btn-test-file-back').on('click', function () {
      $viewTestFile.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initTestFileView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/test-file.html ได้');
  });

  // Same fetch-and-mount pattern for the "video convert" view
  // (views/video-convert.html).
  var videoConvertViewReady = $.get('views/video-convert.html').done(function (html) {
    $('#view-video-convert-mount').replaceWith(html);
    $viewVideoConvert = $('#view-video-convert');
    $('#btn-video-convert-back').on('click', function () {
      $viewVideoConvert.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initVideoConvertView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/video-convert.html ได้');
  });

  // Same fetch-and-mount pattern for the "file resize" view
  // (views/file-resize.html).
  var fileResizeViewReady = $.get('views/file-resize.html').done(function (html) {
    $('#view-file-resize-mount').replaceWith(html);
    $viewFileResize = $('#view-file-resize');
    $('#btn-file-resize-back').on('click', function () {
      $viewFileResize.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initFileResizeView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/file-resize.html ได้');
  });

  // Same fetch-and-mount pattern for the "file encrypt" view
  // (views/file-encrypt.html).
  var fileEncryptViewReady = $.get('views/file-encrypt.html').done(function (html) {
    $('#view-file-encrypt-mount').replaceWith(html);
    $viewFileEncrypt = $('#view-file-encrypt');
    $('#btn-file-encrypt-back').on('click', function () {
      $viewFileEncrypt.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initFileEncryptView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/file-encrypt.html ได้');
  });

  // ---------- Category tiles ----------
  // Each tool's home tile now carries only an icon + short bold label (no
  // description, no status tag) — disabled tools are still distinguished
  // visually (dimmed, non-interactive).
  var TOOLS = [
    { id: 'convert', label: 'แปลง PDF เป็นรูปภาพ', desc: 'แยกภาพจากไฟล์ PDF อย่างง่าย', enabled: true, img: 'assets/pdf-to-image.png', color: 'pink' },
    { id: 'split', label: 'แยกไฟล์ PDF', desc: 'แยกหน้า PDF เป็นหลายไฟล์', enabled: true, img: 'assets/split-pdf.png', color: 'yellow' },
    { id: 'merge', label: 'รวมไฟล์ PDF', desc: 'รวมหลายไฟล์เป็นไฟล์เดียว', enabled: true, img: 'assets/merge-pdf.png', color: 'blue' },
    { id: 'convert-files', label: 'แปลงไฟล์', desc: 'แปลงไฟล์ได้หลากหลายรูปแบบ', enabled: true, img: 'assets/convert-file.png', color: 'green' },
    { id: 'video-convert', label: 'แปลงวิดีโอ', desc: 'แปลงวิดีโอไปมาระหว่างฟอร์แมต', enabled: true, img: 'assets/video-convert.svg', color: 'orange' },
    { id: 'text-gen', label: 'สร้างข้อความ', desc: 'สร้างและแก้ไขข้อความออนไลน์', enabled: true, img: 'assets/create-text.png', color: 'teal' },
    { id: 'test-file', label: 'สร้างไฟล์ทดสอบ', desc: 'สร้างไฟล์ตัวอย่างสำหรับทดสอบ', enabled: true, img: 'assets/create-test.png', color: 'rose' },
    { id: 'file-resize', label: 'ปรับขนาดไฟล์', desc: 'เพิ่มหรือลดขนาดไฟล์ตามที่กำหนด', enabled: true, img: 'assets/file-resize.svg', color: 'indigo' },
    { id: 'file-encrypt', label: 'เข้ารหัสไฟล์', desc: 'ใส่รหัสผ่านป้องกันไฟล์', enabled: true, img: 'assets/file-encrypt.svg', color: 'cyan' },
    { id: 'compress', label: 'บีบอัดรูปภาพ', desc: 'ลดขนาดไฟล์รูปภาพ แบบไม่เสียคุณภาพ', enabled: false, img: 'assets/compress-image.png', color: 'gray' },
    { id: 'ocr', label: 'อ่านข้อความจากภาพ', desc: 'ดึงข้อความจากรูปภาพ (OCR)', enabled: false, img: 'assets/ocr.png', color: 'gray' }
  ];
  // Pastel background/icon/arrow theme per card color, mapped to the
  // --card-* CSS variables in css/styles.css (light + dark mode aware).
  // Every enabled tool gets its own distinct color (see TOOLS below) so
  // tiles are distinguishable at a glance; "gray" is reserved for disabled
  // ("เร็วๆ นี้") tiles, which all share it instead of getting their own hue.
  var CARD_THEMES = {
    pink: { bg: 'bg-cardpink', icon: 'bg-cardpinkdeep', arrow: 'text-cardpinkdeep' },
    yellow: { bg: 'bg-cardyellow', icon: 'bg-cardyellowdeep', arrow: 'text-cardyellowdeep' },
    blue: { bg: 'bg-cardblue', icon: 'bg-cardbluedeep', arrow: 'text-cardbluedeep' },
    green: { bg: 'bg-cardgreen', icon: 'bg-cardgreendeep', arrow: 'text-cardgreendeep' },
    orange: { bg: 'bg-cardorange', icon: 'bg-cardorangedeep', arrow: 'text-cardorangedeep' },
    teal: { bg: 'bg-cardteal', icon: 'bg-cardtealdeep', arrow: 'text-cardtealdeep' },
    rose: { bg: 'bg-cardrose', icon: 'bg-cardrosedeep', arrow: 'text-cardrosedeep' },
    indigo: { bg: 'bg-cardindigo', icon: 'bg-cardindigodeep', arrow: 'text-cardindigodeep' },
    cyan: { bg: 'bg-cardcyan', icon: 'bg-cardcyandeep', arrow: 'text-cardcyandeep' },
    gray: { bg: 'bg-cardgray', icon: 'bg-cardgraydeep', arrow: 'text-cardgraydeep' }
  };
  var $categoryGrid = $('#category-grid');
  var $toolSearch = $('#tool-search');

  function makeToolTile(tool) {
    var theme = CARD_THEMES[tool.color];
    var tag = tool.enabled ? 'button' : 'div';
    var $el = $('<' + tag + '>');
    $el.addClass('flex items-center gap-3.5 rounded-2xl px-4 py-4 transition duration-150 text-left w-full').addClass(theme.bg);
    if (tool.enabled) {
      $el.attr('type', 'button');
      $el.addClass('cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0');
    } else {
      $el.attr({ role: 'group', 'aria-disabled': 'true' });
      $el.addClass('cursor-default');
    }
    // Icon + text dim together for a disabled tool, but the "เร็วๆ นี้" tag
    // stays a sibling so it keeps its own saturated color.
    var $text = $('<span>').addClass('flex-1 min-w-0');
    if (!tool.enabled) $text.addClass('opacity-60');
    var $title = $('<span>').addClass('flex items-center gap-1.5 flex-wrap');
    $title.append($('<span>').addClass('text-[14.5px] font-extrabold text-ink leading-tight').text(tool.label));
    if (!tool.enabled) {
      $title.append(
        $('<span>').addClass('inline-flex items-center gap-1 rounded-full bg-badsoft px-2 py-0.5').append(
          $('<span>').addClass('h-1.5 w-1.5 flex-none rounded-full bg-bad').attr('aria-hidden', 'true'),
          $('<span>').addClass('text-[9.5px] font-bold text-bad leading-none whitespace-nowrap').text('เร็วๆ นี้')
        )
      );
    }
    $text.append($title, $('<span>').addClass('block text-[12px] text-inksoft mt-0.5 truncate').text(tool.desc));
    $el.append(
      $('<span>').addClass('flex h-11 w-11 flex-none items-center justify-center rounded-xl overflow-hidden bg-cardicon shadow-sm')
        .append($('<img>').attr({ src: tool.img, alt: '' }).addClass('h-full w-full object-cover')),
      $text,
      $('<span>').addClass('flex h-8 w-8 flex-none items-center justify-center rounded-full bg-cardicon shadow-sm').addClass(theme.arrow)
        .append($('<i>').addClass('bi bi-arrow-right text-sm leading-none'))
    );
    if (tool.id === 'convert') {
      $el.on('click', function () { openView($viewPdf); });
    } else if (tool.id === 'merge') {
      $el.on('click', function () {
        $.when(mergeViewReady).done(function () { openView($viewMerge); });
      });
    } else if (tool.id === 'split') {
      $el.on('click', function () {
        $.when(splitViewReady).done(function () { openView($viewSplit); });
      });
    } else if (tool.id === 'convert-files') {
      $el.on('click', function () {
        $.when(convertFilesViewReady).done(function () {
          if (convertFilesViewApi) convertFilesViewApi.reset();
          openView($viewConvertFiles);
        });
      });
    } else if (tool.id === 'video-convert') {
      $el.on('click', function () {
        $.when(videoConvertViewReady).done(function () { openView($viewVideoConvert); });
      });
    } else if (tool.id === 'text-gen') {
      $el.on('click', function () {
        $.when(textGenViewReady).done(function () { openView($viewTextGen); });
      });
    } else if (tool.id === 'test-file') {
      $el.on('click', function () {
        $.when(testFileViewReady).done(function () { openView($viewTestFile); });
      });
    } else if (tool.id === 'file-resize') {
      $el.on('click', function () {
        $.when(fileResizeViewReady).done(function () { openView($viewFileResize); });
      });
    } else if (tool.id === 'file-encrypt') {
      $el.on('click', function () {
        $.when(fileEncryptViewReady).done(function () { openView($viewFileEncrypt); });
      });
    }
    return $el;
  }

  function renderCategories() {
    var query = $toolSearch.val().trim().toLowerCase();
    $categoryGrid.empty();
    var visible = query ? TOOLS.filter(function (t) { return t.label.toLowerCase().indexOf(query) !== -1; }) : TOOLS;
    if (!visible.length) {
      $categoryGrid.append($('<p>').addClass('sm:col-span-2 text-sm text-inksoft text-center py-4').text('ไม่พบเครื่องมือที่ค้นหา'));
      return;
    }
    visible.forEach(function (t) { $categoryGrid.append(makeToolTile(t)); });
  }

  $toolSearch.on('input', renderCategories);
  renderCategories();

  // ---------- Helpers ----------
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function pad(n, max) { var len = String(max).length; var s = String(n); while (s.length < len) s = '0' + s; return s; }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function parsePageList(spec, maxPage) {
    if (!spec || !spec.trim()) return null;
    var parts = spec.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var pages = {};
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var m = parts[i].match(/^(\d+)(?:-(\d+))?$/);
      if (!m) throw new Error('รูปแบบไม่ถูกต้อง: "' + parts[i] + '"');
      var start = parseInt(m[1], 10);
      var end = m[2] ? parseInt(m[2], 10) : start;
      if (start < 1 || end < 1 || start > maxPage || end > maxPage || start > end) {
        throw new Error('หมายเลขหน้าไม่ถูกต้อง: "' + parts[i] + '" (เอกสารมี ' + maxPage + ' หน้า)');
      }
      for (var p = start; p <= end; p++) { if (!pages[p]) { pages[p] = true; out.push(p); } }
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function parsePageGroups(spec, maxPage) {
    var parts = spec.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) throw new Error('กรุณาระบุช่วงหน้าที่ต้องการแยก');
    var groups = [];
    for (var i = 0; i < parts.length; i++) {
      var m = parts[i].match(/^(\d+)(?:-(\d+))?$/);
      if (!m) throw new Error('รูปแบบไม่ถูกต้อง: "' + parts[i] + '"');
      var start = parseInt(m[1], 10);
      var end = m[2] ? parseInt(m[2], 10) : start;
      if (start < 1 || end < 1 || start > maxPage || end > maxPage || start > end) {
        throw new Error('หมายเลขหน้าไม่ถูกต้อง: "' + parts[i] + '" (เอกสารมี ' + maxPage + ' หน้า)');
      }
      var pages = [];
      for (var p = start; p <= end; p++) pages.push(p);
      groups.push(pages);
    }
    return groups;
  }

  async function renderPageToCanvas(pdfDoc, pageNum, scale) {
    var page = await pdfDoc.getPage(pageNum);
    var viewport = page.getViewport({ scale: scale });
    var canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    var ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    return canvas;
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob); else reject(new Error('แปลงรูปภาพล้มเหลว'));
      }, mime, quality);
    });
  }

  async function deliverFiles(files, zipBaseName) {
    var finalName, finalBlob;
    if (files.length === 1) {
      finalName = files[0].name;
      finalBlob = files[0].blob;
    } else {
      var zip = new JSZip();
      for (var i = 0; i < files.length; i++) zip.file(files[i].name, files[i].blob);
      finalBlob = await zip.generateAsync({ type: 'blob' });
      finalName = zipBaseName + '.zip';
    }

    if (CLAUDE_MODE) {
      if (!claudeDownloads) throw new Error('การบันทึกไฟล์ไม่พร้อมใช้งานในมุมมองนี้');
      return claudeDownloads.save({ filename: finalName, data: finalBlob });
    }

    triggerBlobDownload(finalName, finalBlob);
    return { status: 'saved' };
  }

  function describeDownloadError(err) {
    if (err && err.code === 'declined') return 'ยกเลิกการบันทึกไฟล์';
    if (err && err.code === 'rate_limited') return 'กำลังมีการบันทึกไฟล์อื่นอยู่ ลองใหม่อีกครั้ง';
    if (err && err.code === 'too_large') return 'ไฟล์มีขนาดใหญ่เกินไปสำหรับปลายทางที่เลือก';
    if (err && err.message) return err.message;
    return 'เกิดข้อผิดพลาดระหว่างบันทึกไฟล์';
  }

  // ---------- Upload ----------
  var $dropzone = $('#dropzone');
  var $fileInput = $('#file-input');
  var $uploadError = $('#upload-error');
  var $docCard = $('#doc-card');
  var $docThumb = $('#doc-thumb');
  var $docName = $('#doc-name');
  var $docPages = $('#doc-pages');
  var $docSize = $('#doc-size');
  var $panelConvert = $('#panel-convert');
  var $passwordCard = $('#password-card');
  var $passwordFilename = $('#password-filename');
  var $passwordInput = $('#password-input');
  var $passwordError = $('#password-error');
  var $btnUnlock = $('#btn-unlock');
  var $docLockNote = $('#doc-lock-note');
  var pendingFile = null;

  function setPanelActive($panel, active) {
    $panel.toggleClass('opacity-45 pointer-events-none', !active);
    $panel.toggleClass('opacity-100 pointer-events-auto', active);
  }

  $dropzone.on('click', function () { $fileInput.trigger('click'); });
  $dropzone.on('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $fileInput.trigger('click'); }
  });
  $dropzone.on('dragenter dragover', function (e) {
    e.preventDefault();
    $dropzone.removeClass('border-line').addClass('border-accent bg-accentsoft');
  });
  $dropzone.on('dragleave drop', function (e) {
    e.preventDefault();
    $dropzone.removeClass('border-accent bg-accentsoft').addClass('border-line');
  });
  $dropzone.on('drop', function (e) {
    var dt = e.originalEvent.dataTransfer;
    var f = dt && dt.files && dt.files[0];
    if (f) handleFile(f);
  });
  $fileInput.on('change', function () {
    if ($fileInput[0].files[0]) handleFile($fileInput[0].files[0]);
    $fileInput.val('');
  });
  $('#doc-clear').on('click', function () {
    state.pdf = null;
    pendingFile = null;
    $docCard.css('display', 'none');
    hidePasswordPrompt();
    setPanelActive($panelConvert, false);
    setConvertStatus('', 'neutral');
  });

  function isPasswordException(err) {
    return !!err && (err.name === 'PasswordException' || /password/i.test(err.message || ''));
  }

  async function handleFile(file) {
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { showUploadError('รองรับเฉพาะไฟล์ PDF เท่านั้น'); return; }
    if (!window.pdfjsLib) { showUploadError('ไม่สามารถโหลดไลบรารีอ่าน PDF ได้ ลองรีเฟรชหน้านี้'); return; }
    showUploadError('');
    hidePasswordPrompt();
    $docCard.css('display', 'none');
    $dropzone.css('opacity', '.6');
    try {
      var buf = await file.arrayBuffer();
      var doc;
      try {
        doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      } catch (err) {
        if (isPasswordException(err)) {
          pendingFile = file;
          showPasswordPrompt(file.name);
          return;
        }
        throw err;
      }
      await finalizeLoadedDoc(file, doc, null);
    } catch (err) {
      showUploadError('ไม่สามารถอ่านไฟล์ PDF นี้ได้ ไฟล์อาจเสียหาย');
      state.pdf = null;
    } finally {
      $dropzone.css('opacity', '1');
    }
  }

  function showPasswordPrompt(filename) {
    $passwordFilename.text(filename);
    $passwordError.text('');
    $passwordInput.val('');
    $passwordCard.css('display', 'flex');
    $passwordInput.trigger('focus');
  }
  function hidePasswordPrompt() {
    $passwordCard.css('display', 'none');
    $passwordError.text('');
    $passwordInput.val('');
  }
  function setUnlockBusy(busy) {
    $btnUnlock.prop('disabled', busy);
    $btnUnlock.toggleClass('busy', busy);
    $btnUnlock.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
    $passwordInput.prop('disabled', busy);
  }

  async function submitPassword() {
    if (!pendingFile) return;
    var pw = $passwordInput.val();
    if (!pw) { $passwordError.text('กรุณากรอกรหัสผ่าน'); return; }
    setUnlockBusy(true);
    $passwordError.text('');
    try {
      var buf = await pendingFile.arrayBuffer();
      var doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), password: pw }).promise;
      var file = pendingFile;
      pendingFile = null;
      hidePasswordPrompt();
      await finalizeLoadedDoc(file, doc, pw);
    } catch (err) {
      if (isPasswordException(err)) {
        $passwordError.text('รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง');
      } else {
        $passwordError.text('ไม่สามารถปลดล็อกไฟล์นี้ได้');
      }
    } finally {
      setUnlockBusy(false);
    }
  }
  $btnUnlock.on('click', submitPassword);
  $passwordInput.on('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitPassword(); }
  });

  async function finalizeLoadedDoc(file, doc, password) {
    var baseName = file.name.replace(/\.pdf$/i, '') || 'document';
    state.pdf = { file: file, doc: doc, pageCount: doc.numPages, baseName: baseName, size: file.size, password: password || null };
    await renderSummary();
    setPanelActive($panelConvert, true);
    setConvertStatus('', 'neutral');
    $('#convert-pages').val('');
  }

  async function renderSummary() {
    $docName.text(state.pdf.file.name);
    $docPages.text(state.pdf.pageCount + ' หน้า');
    $docSize.text(formatSize(state.pdf.size));
    $docLockNote.css('display', state.pdf.password ? 'flex' : 'none');
    $docThumb.empty();
    try {
      var canvas = await renderPageToCanvas(state.pdf.doc, 1, 0.3);
      $(canvas).addClass('w-full h-full object-cover block');
      $docThumb.append(canvas);
    } catch (e) { /* thumbnail is best-effort */ }
    $docCard.css('display', 'flex');
  }

  function showUploadError(msg) { $uploadError.text(msg || ''); }

  // ---------- Convert to images ----------
  var $btnConvert = $('#btn-convert');
  var $convertProgress = $('#convert-progress');
  var $convertStatusEl = $('#convert-status');

  function setConvertStatus(msg, kind) {
    $convertStatusEl.text(msg || '');
    $convertStatusEl.removeClass('text-good text-bad text-inksoft');
    if (kind === 'good') $convertStatusEl.addClass('text-good');
    else if (kind === 'bad') $convertStatusEl.addClass('text-bad');
    else $convertStatusEl.addClass('text-inksoft');
  }
  function setConvertBusy(busy) {
    $btnConvert.prop('disabled', busy);
    $btnConvert.toggleClass('busy', busy);
    $btnConvert.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
    $convertProgress.toggleClass('hidden', !busy);
    if (!busy) $convertProgress.find('.progress-fill').css('width', '0%');
  }
  function updateConvertProgress(done, total) {
    $convertProgress.find('.progress-fill').css('width', Math.round((done / total) * 100) + '%');
    setConvertStatus('กำลังแปลงหน้า ' + done + '/' + total + '…', 'neutral');
  }

  $btnConvert.on('click', async function () {
    if (!state.pdf) return;
    var format = $('#convert-format').val();
    var scaleMultiplier = Number($('#convert-scale').val());
    var pagesInput = $('#convert-pages').val();
    var pages;
    try {
      pages = parsePageList(pagesInput, state.pdf.pageCount) || range(1, state.pdf.pageCount);
    } catch (err) { setConvertStatus(err.message, 'bad'); return; }

    setConvertBusy(true);
    try {
      var mime = format === 'png' ? 'image/png' : 'image/jpeg';
      var ext = format === 'png' ? 'png' : 'jpg';
      var items = [];
      for (var i = 0; i < pages.length; i++) {
        updateConvertProgress(i, pages.length);
        var canvas = await renderPageToCanvas(state.pdf.doc, pages[i], scaleMultiplier * 1.5);
        var blob = await canvasToBlob(canvas, mime, mime === 'image/jpeg' ? 0.92 : undefined);
        items.push({
          name: state.pdf.baseName + '-page-' + pad(pages[i], state.pdf.pageCount) + '.' + ext,
          blob: blob,
          url: URL.createObjectURL(blob),
          page: pages[i],
          selected: true
        });
      }
      updateConvertProgress(pages.length, pages.length);
      setConvertStatus('', 'neutral');
      openGallery(items);
    } catch (err) {
      setConvertStatus(err && err.message ? err.message : 'เกิดข้อผิดพลาดระหว่างแปลงไฟล์', 'bad');
    } finally {
      setConvertBusy(false);
    }
  });

  // ---------- Gallery ----------
  var $galleryGrid = $('#gallery-grid');
  var $galleryCounter = $('#gallery-counter');
  var $btnGalleryToggleAll = $('#btn-gallery-toggle-all');
  var $btnGallerySave = $('#btn-gallery-save');
  var $gallerySaveLabel = $('#gallery-save-label');
  var $galleryStatusEl = $('#gallery-status');
  var gallery = { items: [] };

  function revokeGalleryUrls() {
    gallery.items.forEach(function (it) { URL.revokeObjectURL(it.url); });
  }

  function setGalleryStatus(msg, kind) {
    $galleryStatusEl.text(msg || '');
    $galleryStatusEl.removeClass('text-good text-bad text-inksoft');
    if (kind === 'good') $galleryStatusEl.addClass('text-good');
    else if (kind === 'bad') $galleryStatusEl.addClass('text-bad');
    else if (kind === 'neutral') $galleryStatusEl.addClass('text-inksoft');
  }

  function updateGalleryCounter() {
    var total = gallery.items.length;
    var selected = gallery.items.filter(function (it) { return it.selected; }).length;
    $galleryCounter.text('เลือก ' + selected + ' จาก ' + total + ' รูป');
    $btnGalleryToggleAll.text(selected === total ? 'ไม่เลือกเลย' : 'เลือกทั้งหมด');
    $btnGallerySave.prop('disabled', selected === 0);
    $gallerySaveLabel.text(selected > 0 ? ('ดาวน์โหลด (' + selected + ')') : 'ดาวน์โหลด');
  }

  function setItemSelected($item, item, selected) {
    item.selected = selected;
    $item.toggleClass('border-accent shadow-[0_0_0_2px_var(--accent)_inset]', selected);
    $item.toggleClass('border-line shadow-sm', !selected);
    $item.find('img').toggleClass('opacity-100', selected).toggleClass('opacity-35', !selected);
  }

  function openGallery(items) {
    gallery.items = items;
    $galleryGrid.empty();
    items.forEach(function (item) {
      var $label = $('<label>').addClass('relative block aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border border-accent shadow-[0_0_0_2px_var(--accent)_inset] bg-surface');
      var $checkbox = $('<input>').attr('type', 'checkbox').addClass('absolute top-2 left-2 z-[2] w-[19px] h-[19px] accent-accent cursor-pointer').prop('checked', true);
      var $img = $('<img>').attr({ src: item.url, alt: 'หน้า ' + item.page }).addClass('w-full h-full object-contain block bg-surface2 transition-opacity duration-150 opacity-100');
      var $caption = $('<span>').addClass('absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent text-white text-[11px] font-bold text-center pt-2.5 pb-1 px-1').text('หน้า ' + item.page);
      $label.append($checkbox, $img, $caption);
      $checkbox.on('change', function () {
        setItemSelected($label, item, $checkbox.prop('checked'));
        updateGalleryCounter();
      });
      $galleryGrid.append($label);
    });
    setGalleryStatus('', '');
    updateGalleryCounter();
    $viewPdf.attr('hidden', true);
    $viewGallery.removeAttr('hidden');
  }

  function closeGallery() {
    revokeGalleryUrls();
    gallery.items = [];
    $galleryGrid.empty();
    $viewGallery.attr('hidden', true);
    $viewPdf.removeAttr('hidden');
  }

  $btnGalleryToggleAll.on('click', function () {
    var total = gallery.items.length;
    var selectedCount = gallery.items.filter(function (it) { return it.selected; }).length;
    var makeSelected = selectedCount !== total;
    gallery.items.forEach(function (it, idx) {
      var $item = $galleryGrid.children().eq(idx);
      $item.find('input').prop('checked', makeSelected);
      setItemSelected($item, it, makeSelected);
    });
    updateGalleryCounter();
  });

  $('#btn-gallery-back').on('click', closeGallery);

  // Always saves each selected page as its own image file — never bundled
  // into a zip — so what lands in Downloads (or Photos) is exactly the
  // pictures picked.
  async function saveGalleryImages(selected) {
    if (CLAUDE_MODE) {
      if (!claudeDownloads) {
        setGalleryStatus('การบันทึกไฟล์ไม่พร้อมใช้งานในมุมมองนี้', 'bad');
        return;
      }
      var savedCount = 0;
      for (var i = 0; i < selected.length; i++) {
        setGalleryStatus('กำลังบันทึกรูปที่ ' + (i + 1) + '/' + selected.length + '…', 'neutral');
        try {
          await claudeDownloads.save({ filename: selected[i].name, data: selected[i].blob });
          savedCount++;
        } catch (err) {
          if (err && err.code === 'declined') break;
          setGalleryStatus(describeDownloadError(err), 'bad');
          return;
        }
      }
      setGalleryStatus('บันทึกแล้ว ' + savedCount + ' จาก ' + selected.length + ' รูป', 'good');
      return;
    }

    /* On a device that supports the Web Share API with files (phones —
       Android Chrome, iOS Safari), sharing hands the images straight to the
       OS share sheet where "Save Image(s)"/"Save to Photos" drops them into
       the Camera Roll in one tap. Desktop browsers generally don't support
       sharing files, so they fall through to the plain <a download> loop,
       which saves straight into the browser's default Downloads folder with
       no extra dialog. There's no way to skip the share-sheet tap on mobile
       — browsers don't allow a page to write to Photos silently. */
    var shareFiles = selected.map(function (it) { return new File([it.blob], it.name, { type: it.blob.type }); });
    if (navigator.canShare && navigator.canShare({ files: shareFiles })) {
      try {
        await navigator.share({ files: shareFiles });
        setGalleryStatus('บันทึกแล้ว ' + selected.length + ' รูป', 'good');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') {
          setGalleryStatus('ยกเลิกการบันทึก', 'neutral');
          return;
        }
        // Sharing failed for another reason — fall through to direct download.
      }
    }

    for (var j = 0; j < selected.length; j++) {
      triggerBlobDownload(selected[j].name, selected[j].blob);
      await new Promise(function (resolve) { setTimeout(resolve, 180); });
    }
    setGalleryStatus('ดาวน์โหลดแล้ว ' + selected.length + ' รูป', 'good');
  }

  $btnGallerySave.on('click', async function () {
    var selected = gallery.items.filter(function (it) { return it.selected; });
    if (!selected.length) return;
    $btnGallerySave.prop('disabled', true).addClass('busy');
    $btnGallerySave.find('.spinner').removeClass('hidden').addClass('inline-block');
    setGalleryStatus('', 'neutral');
    try {
      await saveGalleryImages(selected);
    } finally {
      $btnGallerySave.removeClass('busy');
      $btnGallerySave.find('.spinner').addClass('hidden').removeClass('inline-block');
      updateGalleryCounter();
    }
  });

  // ---------- Split ----------
  // Wires up the "split PDF" view once its markup (views/split.html) has been
  // fetched and mounted — see splitViewReady above. This view has its own
  // independent single-file upload/password flow (separate element ids and
  // state from the "convert to images" view's #dropzone/#file-input above),
  // since the two are now separate top-level tools instead of sharing one
  // uploaded document.
  function initSplitView() {
    var splitState = { pdf: null };
    var pendingSplitFile = null;

    var $dropzone = $('#split-dropzone');
    var $fileInput = $('#split-file-input');
    var $uploadError = $('#split-upload-error');
    var $docCard = $('#split-doc-card');
    var $docThumb = $('#split-doc-thumb');
    var $docName = $('#split-doc-name');
    var $docPages = $('#split-doc-pages');
    var $docSize = $('#split-doc-size');
    var $docLockNote = $('#split-doc-lock-note');
    var $panel = $('#split-panel');
    var $passwordCard = $('#split-password-card');
    var $passwordFilename = $('#split-password-filename');
    var $passwordInput = $('#split-password-input');
    var $passwordError = $('#split-password-error');
    var $btnUnlock = $('#btn-split-unlock');

    var $btnSplit = $('#btn-split');
    var $splitProgress = $('#split-progress');
    var $splitStatusEl = $('#split-status');
    var $splitRangesField = $('#split-ranges-field');

    $('input[name="split-mode"]').on('change', function () {
      $splitRangesField.css('display', $('input[name="split-mode"]:checked').val() === 'custom' ? 'block' : 'none');
    });

    function setSplitStatus(msg, kind) {
      $splitStatusEl.text(msg || '');
      $splitStatusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $splitStatusEl.addClass('text-good');
      else if (kind === 'bad') $splitStatusEl.addClass('text-bad');
      else $splitStatusEl.addClass('text-inksoft');
    }
    function setSplitBusy(busy) {
      $btnSplit.prop('disabled', busy);
      $btnSplit.toggleClass('busy', busy);
      $btnSplit.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
      $splitProgress.toggleClass('hidden', !busy);
      if (!busy) $splitProgress.find('.progress-fill').css('width', '0%');
    }
    function updateSplitProgress(done, total) {
      $splitProgress.find('.progress-fill').css('width', Math.round((done / total) * 100) + '%');
      setSplitStatus('กำลังแยกไฟล์ ' + done + '/' + total + '…', 'neutral');
    }

    function showUploadError(msg) { $uploadError.text(msg || ''); }

    function isPasswordExceptionLocal(err) {
      return !!err && (err.name === 'PasswordException' || /password/i.test(err.message || ''));
    }

    function showPasswordPrompt(filename) {
      $passwordFilename.text(filename);
      $passwordError.text('');
      $passwordInput.val('');
      $passwordCard.css('display', 'flex');
      $passwordInput.trigger('focus');
    }
    function hidePasswordPrompt() {
      $passwordCard.css('display', 'none');
      $passwordError.text('');
      $passwordInput.val('');
    }
    function setUnlockBusy(busy) {
      $btnUnlock.prop('disabled', busy);
      $btnUnlock.toggleClass('busy', busy);
      $btnUnlock.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
      $passwordInput.prop('disabled', busy);
    }

    async function handleFile(file) {
      var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf) { showUploadError('รองรับเฉพาะไฟล์ PDF เท่านั้น'); return; }
      if (!window.pdfjsLib) { showUploadError('ไม่สามารถโหลดไลบรารีอ่าน PDF ได้ ลองรีเฟรชหน้านี้'); return; }
      showUploadError('');
      hidePasswordPrompt();
      $docCard.css('display', 'none');
      $dropzone.css('opacity', '.6');
      try {
        var buf = await file.arrayBuffer();
        var doc;
        try {
          doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        } catch (err) {
          if (isPasswordExceptionLocal(err)) {
            pendingSplitFile = file;
            showPasswordPrompt(file.name);
            return;
          }
          throw err;
        }
        await finalizeLoadedDoc(file, doc, null);
      } catch (err) {
        showUploadError('ไม่สามารถอ่านไฟล์ PDF นี้ได้ ไฟล์อาจเสียหาย');
        splitState.pdf = null;
      } finally {
        $dropzone.css('opacity', '1');
      }
    }

    async function submitPassword() {
      if (!pendingSplitFile) return;
      var pw = $passwordInput.val();
      if (!pw) { $passwordError.text('กรุณากรอกรหัสผ่าน'); return; }
      setUnlockBusy(true);
      $passwordError.text('');
      try {
        var buf = await pendingSplitFile.arrayBuffer();
        var doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), password: pw }).promise;
        var file = pendingSplitFile;
        pendingSplitFile = null;
        hidePasswordPrompt();
        await finalizeLoadedDoc(file, doc, pw);
      } catch (err) {
        if (isPasswordExceptionLocal(err)) {
          $passwordError.text('รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง');
        } else {
          $passwordError.text('ไม่สามารถปลดล็อกไฟล์นี้ได้');
        }
      } finally {
        setUnlockBusy(false);
      }
    }
    $btnUnlock.on('click', submitPassword);
    $passwordInput.on('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitPassword(); }
    });

    async function finalizeLoadedDoc(file, doc, password) {
      var baseName = file.name.replace(/\.pdf$/i, '') || 'document';
      splitState.pdf = { file: file, doc: doc, pageCount: doc.numPages, baseName: baseName, size: file.size, password: password || null };
      await renderSummary();
      $panel.css('display', 'block');
      setSplitStatus('', 'neutral');
      $('#split-ranges').val('');
    }

    async function renderSummary() {
      $docName.text(splitState.pdf.file.name);
      $docPages.text(splitState.pdf.pageCount + ' หน้า');
      $docSize.text(formatSize(splitState.pdf.size));
      $docLockNote.css('display', splitState.pdf.password ? 'flex' : 'none');
      $docThumb.empty();
      try {
        var canvas = await renderPageToCanvas(splitState.pdf.doc, 1, 0.3);
        $(canvas).addClass('w-full h-full object-cover block');
        $docThumb.append(canvas);
      } catch (e) { /* thumbnail is best-effort */ }
      $docCard.css('display', 'flex');
    }

    $dropzone.on('click', function () { $fileInput.trigger('click'); });
    $dropzone.on('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $fileInput.trigger('click'); }
    });
    $dropzone.on('dragenter dragover', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-line').addClass('border-accent bg-accentsoft');
    });
    $dropzone.on('dragleave drop', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-accent bg-accentsoft').addClass('border-line');
    });
    $dropzone.on('drop', function (e) {
      var dt = e.originalEvent.dataTransfer;
      var f = dt && dt.files && dt.files[0];
      if (f) handleFile(f);
    });
    $fileInput.on('change', function () {
      if ($fileInput[0].files[0]) handleFile($fileInput[0].files[0]);
      $fileInput.val('');
    });
    $docCard.find('#split-doc-clear').on('click', function () {
      splitState.pdf = null;
      pendingSplitFile = null;
      $docCard.css('display', 'none');
      hidePasswordPrompt();
      $panel.css('display', 'none');
      setSplitStatus('', 'neutral');
    });

    $btnSplit.on('click', async function () {
      if (!splitState.pdf) return;
      if (!window.PDFLib) { setSplitStatus('ไม่สามารถโหลดไลบรารีแยกไฟล์ PDF ได้ ลองรีเฟรชหน้านี้', 'bad'); return; }
      var mode = $('input[name="split-mode"]:checked').val();
      var groups;
      try {
        groups = mode === 'each'
          ? range(1, splitState.pdf.pageCount).map(function (p) { return [p]; })
          : parsePageGroups($('#split-ranges').val(), splitState.pdf.pageCount);
      } catch (err) { setSplitStatus(err.message, 'bad'); return; }

      setSplitBusy(true);
      try {
        var srcBytes = await splitState.pdf.file.arrayBuffer();
        var srcDoc = await PDFLib.PDFDocument.load(srcBytes, { password: splitState.pdf.password || '', ignoreEncryption: true });
        var files = [];
        for (var i = 0; i < groups.length; i++) {
          updateSplitProgress(i, groups.length);
          var group = groups[i];
          var newDoc = await PDFLib.PDFDocument.create();
          var indices = group.map(function (p) { return p - 1; });
          var copied = await newDoc.copyPages(srcDoc, indices);
          copied.forEach(function (p) { newDoc.addPage(p); });
          var bytes = await newDoc.save();
          var label = group.length === 1 ? ('page-' + pad(group[0], splitState.pdf.pageCount)) : ('p' + group[0] + '-' + group[group.length - 1]);
          files.push({ name: splitState.pdf.baseName + '-' + label + '.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) });
        }
        updateSplitProgress(groups.length, groups.length);
        var res = await deliverFiles(files, splitState.pdf.baseName + '-split');
        setSplitStatus(res.status === 'saved' ? 'บันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        setSplitStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      } finally {
        setSplitBusy(false);
      }
    });
  }

  // ---------- Merge ----------
  // Wires up the merge view once its markup (views/merge.html) has been
  // fetched and mounted — see mergeViewReady above. Supports multiple files,
  // reordering, removing, and per-file password unlock for encrypted PDFs.
  function initMergeView() {
    var $mergeDropzone = $('#merge-dropzone');
    var $mergeFileInput = $('#merge-file-input');
    var $mergeUploadError = $('#merge-upload-error');
    var $mergeList = $('#merge-list');
    var $btnMerge = $('#btn-merge');
    var $mergeCount = $('#merge-count');
    var $mergeProgress = $('#merge-progress');
    var $mergeStatusEl = $('#merge-status');
    var mergeItems = []; // { file, pageCount, password, locked, error }

    function setMergeStatus(msg, kind) {
      $mergeStatusEl.text(msg || '');
      $mergeStatusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $mergeStatusEl.addClass('text-good');
      else if (kind === 'bad') $mergeStatusEl.addClass('text-bad');
      else $mergeStatusEl.addClass('text-inksoft');
    }

    function mergeReady() {
      return mergeItems.length >= 2 && mergeItems.every(function (it) { return !it.locked; });
    }

    function renderMergeList() {
      $mergeList.empty();
      mergeItems.forEach(function (item, idx) {
        var $row = $('<div>').attr({ draggable: 'true', 'data-index': idx })
          .addClass('flex items-center gap-2 bg-surface border border-line rounded-xl pl-1.5 pr-3 py-2.5 shadow-sm transition-opacity duration-150');
        var $grip = $('<span>').addClass('flex-none w-5 flex items-center justify-center text-inkfaint cursor-grab active:cursor-grabbing')
          .append($('<i>').addClass('bi bi-grip-vertical text-base leading-none'));
        var $badge = $('<span>').attr('draggable', 'false').addClass('flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accentsoft text-accent')
          .append($('<i>').addClass('bi bi-file-earmark-pdf text-base leading-none'));
        var $meta = $('<div>').attr('draggable', 'false').addClass('flex-1 min-w-0');
        $meta.append($('<div>').addClass('font-semibold text-[13px] truncate').text(item.file.name));

        if (item.locked) {
          var $pwInput = $('<input>').attr({ type: 'password', placeholder: 'รหัสผ่าน', autocomplete: 'off' })
            .addClass('flex-1 min-w-0 px-2 py-1 rounded-lg border border-line bg-surface2 text-ink text-[12px] focus:outline focus:outline-2 focus:outline-accent focus:outline-offset-1');
          var $unlockBtn = $('<button>').attr('type', 'button')
            .addClass('flex-none px-2.5 py-1 rounded-lg bg-accent text-accentink text-[12px] font-bold cursor-pointer hover:bg-accentdeep')
            .text('ปลดล็อก');
          var $lockRow = $('<div>').addClass('flex items-center gap-1.5 mt-1.5').append($pwInput, $unlockBtn);
          $meta.append($lockRow);
          if (item.error) $meta.append($('<div>').addClass('text-[11px] text-bad mt-1').text(item.error));
          $unlockBtn.on('click', function () { unlockItem(idx, $pwInput.val()); });
          $pwInput.on('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); unlockItem(idx, $pwInput.val()); } });
        } else {
          $meta.append($('<div>').addClass('text-[11.5px] text-inksoft').text(item.pageCount + ' หน้า · ' + formatSize(item.file.size)));
        }

        var $upBtn = $('<button>').attr('type', 'button')
          .addClass('flex h-7 w-7 items-center justify-center rounded-lg text-inksoft hover:text-ink hover:bg-surface2 disabled:opacity-30 disabled:pointer-events-none')
          .prop('disabled', idx === 0)
          .append($('<i>').addClass('bi bi-chevron-up text-sm leading-none'))
          .on('click', function () { moveItem(idx, -1); });
        var $downBtn = $('<button>').attr('type', 'button')
          .addClass('flex h-7 w-7 items-center justify-center rounded-lg text-inksoft hover:text-ink hover:bg-surface2 disabled:opacity-30 disabled:pointer-events-none')
          .prop('disabled', idx === mergeItems.length - 1)
          .append($('<i>').addClass('bi bi-chevron-down text-sm leading-none'))
          .on('click', function () { moveItem(idx, 1); });
        var $removeBtn = $('<button>').attr('type', 'button')
          .addClass('flex h-7 w-7 items-center justify-center rounded-lg text-inksoft hover:text-bad hover:bg-badsoft')
          .append($('<i>').addClass('bi bi-x-lg text-sm leading-none'))
          .on('click', function () { removeItem(idx); });
        var $actions = $('<div>').attr('draggable', 'false').addClass('flex items-center gap-1 flex-none').append($upBtn, $downBtn, $removeBtn);

        $row.append($grip, $badge, $meta, $actions);
        $mergeList.append($row);
      });
      $mergeCount.text(mergeItems.length);
      $btnMerge.prop('disabled', !mergeReady());
    }

    function moveItem(idx, dir) {
      var target = idx + dir;
      if (target < 0 || target >= mergeItems.length) return;
      var tmp = mergeItems[idx];
      mergeItems[idx] = mergeItems[target];
      mergeItems[target] = tmp;
      renderMergeList();
    }

    // Drag-to-reorder: rows carry draggable="true" + data-index; buttons and
    // the password field opt out via draggable="false" so clicking them
    // doesn't hijack the drag gesture. Delegated once on the list container
    // since rows are torn down and rebuilt on every renderMergeList() call.
    $mergeList
      .on('dragstart', '[data-index]', function (e) {
        e.originalEvent.dataTransfer.effectAllowed = 'move';
        e.originalEvent.dataTransfer.setData('text/plain', String($(this).data('index')));
        $(this).addClass('opacity-40');
      })
      .on('dragend', '[data-index]', function () {
        $(this).removeClass('opacity-40');
        $mergeList.children().removeClass('border-accent');
      })
      .on('dragover', '[data-index]', function (e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'move';
        $(this).addClass('border-accent');
      })
      .on('dragleave', '[data-index]', function () {
        $(this).removeClass('border-accent');
      })
      .on('drop', '[data-index]', function (e) {
        e.preventDefault();
        $(this).removeClass('border-accent');
        var fromIdx = Number(e.originalEvent.dataTransfer.getData('text/plain'));
        var toIdx = $(this).data('index');
        if (isNaN(fromIdx) || fromIdx === toIdx) return;
        var moved = mergeItems.splice(fromIdx, 1)[0];
        mergeItems.splice(toIdx, 0, moved);
        renderMergeList();
      });

    function removeItem(idx) {
      mergeItems.splice(idx, 1);
      renderMergeList();
    }

    function isPasswordExceptionLocal(err) {
      return !!err && (err.name === 'PasswordException' || /password/i.test(err.message || ''));
    }

    async function unlockItem(idx, pw) {
      var item = mergeItems[idx];
      if (!pw) { item.error = 'กรุณากรอกรหัสผ่าน'; renderMergeList(); return; }
      try {
        var buf = await item.file.arrayBuffer();
        var doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), password: pw }).promise;
        item.pageCount = doc.numPages;
        item.password = pw;
        item.locked = false;
        item.error = null;
      } catch (err) {
        item.error = isPasswordExceptionLocal(err) ? 'รหัสผ่านไม่ถูกต้อง' : 'ไม่สามารถปลดล็อกไฟล์นี้ได้';
      }
      renderMergeList();
    }

    async function addMergeFiles(fileList) {
      $mergeUploadError.text('');
      if (!window.pdfjsLib) { $mergeUploadError.text('ไม่สามารถโหลดไลบรารีอ่าน PDF ได้ ลองรีเฟรชหน้านี้'); return; }
      var files = Array.prototype.filter.call(fileList, function (f) {
        return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      });
      if (!files.length) { $mergeUploadError.text('รองรับเฉพาะไฟล์ PDF เท่านั้น'); return; }
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var item = { file: file, pageCount: null, password: null, locked: false, error: null };
        try {
          var buf = await file.arrayBuffer();
          var doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
          item.pageCount = doc.numPages;
        } catch (err) {
          if (isPasswordExceptionLocal(err)) {
            item.locked = true;
          } else {
            $mergeUploadError.text('ไม่สามารถอ่านไฟล์ "' + file.name + '" ได้ ไฟล์อาจเสียหาย');
            continue;
          }
        }
        mergeItems.push(item);
      }
      renderMergeList();
    }

    $mergeDropzone.on('click', function () { $mergeFileInput.trigger('click'); });
    $mergeDropzone.on('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $mergeFileInput.trigger('click'); }
    });
    $mergeDropzone.on('dragenter dragover', function (e) {
      e.preventDefault();
      $mergeDropzone.removeClass('border-line').addClass('border-accent bg-accentsoft');
    });
    $mergeDropzone.on('dragleave drop', function (e) {
      e.preventDefault();
      $mergeDropzone.removeClass('border-accent bg-accentsoft').addClass('border-line');
    });
    $mergeDropzone.on('drop', function (e) {
      var dt = e.originalEvent.dataTransfer;
      if (dt && dt.files && dt.files.length) addMergeFiles(dt.files);
    });
    $mergeFileInput.on('change', function () {
      if ($mergeFileInput[0].files.length) addMergeFiles($mergeFileInput[0].files);
      $mergeFileInput.val('');
    });

    function setMergeBusy(busy) {
      $btnMerge.prop('disabled', busy || !mergeReady());
      $btnMerge.toggleClass('busy', busy);
      $btnMerge.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
      $mergeProgress.toggleClass('hidden', !busy);
      if (!busy) $mergeProgress.find('.progress-fill').css('width', '0%');
    }
    function updateMergeProgress(done, total) {
      $mergeProgress.find('.progress-fill').css('width', Math.round((done / total) * 100) + '%');
      setMergeStatus('กำลังรวมไฟล์ ' + done + '/' + total + '…', 'neutral');
    }

    $btnMerge.on('click', async function () {
      if (!mergeReady()) return;
      if (!window.PDFLib) { setMergeStatus('ไม่สามารถโหลดไลบรารีรวมไฟล์ PDF ได้ ลองรีเฟรชหน้านี้', 'bad'); return; }
      setMergeBusy(true);
      setMergeStatus('', 'neutral');
      try {
        var mergedDoc = await PDFLib.PDFDocument.create();
        for (var i = 0; i < mergeItems.length; i++) {
          updateMergeProgress(i, mergeItems.length);
          var item = mergeItems[i];
          var bytes = await item.file.arrayBuffer();
          var srcDoc = await PDFLib.PDFDocument.load(bytes, { password: item.password || '', ignoreEncryption: true });
          var indices = srcDoc.getPageIndices();
          var copied = await mergedDoc.copyPages(srcDoc, indices);
          copied.forEach(function (p) { mergedDoc.addPage(p); });
        }
        updateMergeProgress(mergeItems.length, mergeItems.length);
        var mergedBytes = await mergedDoc.save();
        var res = await deliverFiles([{ name: 'merged.pdf', blob: new Blob([mergedBytes], { type: 'application/pdf' }) }], 'merged');
        setMergeStatus(res.status === 'saved' ? 'บันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        setMergeStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      } finally {
        setMergeBusy(false);
      }
    });
  }

  // ---------- Convert files ----------
  // Wires up the "แปลงไฟล์" view once its markup (views/convert-files.html)
  // has been fetched and mounted — see convertFilesViewReady above. One
  // generic upload/convert panel (#convert-stage) is reconfigured by the
  // PAIRS table below instead of duplicating markup per from/to pair.
  //
  // Every "-> PDF" conversion renders real DOM into the off-screen
  // #convert-render element and rasterizes it with html2canvas before
  // slicing it across PDF pages (renderElementToPdf) — deliberately not
  // jsPDF's native vector text, which only ships Latin fonts and would
  // break on Thai content. Routing everything through the browser's own
  // text rendering keeps Thai working everywhere without embedding a font.
  function initConvertFilesView() {
    var $fromSelect = $('#convert-from');
    var $toSelect = $('#convert-to');
    var $note = $('#convert-stage-note');
    var $stage = $('#convert-stage');
    var $stageDisabled = $('#convert-stage-disabled');
    var $stageAlias = $('#convert-stage-alias');
    var $dropzone = $('#convert-dropzone');
    var $dropzoneTitle = $('#convert-dropzone-title');
    var $dropzoneHint = $('#convert-dropzone-hint');
    var $fileInput = $('#convert-file-input');
    var $uploadError = $('#convert-upload-error');
    var $fileList = $('#convert-file-list');
    var $btnRun = $('#btn-convert-run');
    var $runLabel = $('#convert-run-label');
    var $progress = $('#convert-stage-progress');
    var $statusEl = $('#convert-stage-status');
    var $render = $('#convert-render');

    var items = []; // currently staged files for the active pair: { file, url }

    var TO_OPTIONS = {
      word: [{ value: 'pdf', label: 'PDF' }],
      excel: [{ value: 'pdf', label: 'PDF' }, { value: 'markdown', label: 'Markdown (.md)' }, { value: 'text', label: 'ข้อความ (.txt)' }, { value: 'csv', label: 'CSV (.csv)' }],
      powerpoint: [{ value: 'pdf', label: 'PDF' }],
      image: [
        { value: 'pdf', label: 'PDF' },
        { value: 'jpg', label: 'JPG' },
        { value: 'png', label: 'PNG' },
        { value: 'webp', label: 'WebP' }
      ],
      html: [{ value: 'pdf', label: 'PDF' }],
      text: [{ value: 'pdf', label: 'PDF' }],
      pdf: [
        { value: 'word', label: 'Word (.docx)' },
        { value: 'excel', label: 'Excel (.xlsx)' },
        { value: 'powerpoint', label: 'PowerPoint (.pptx)' },
        { value: 'image', label: 'รูปภาพ (JPG/PNG)' }
      ]
    };

    function escapeXml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }
    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function loadImageEl(url) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('โหลดรูปภาพไม่สำเร็จ')); };
        img.src = url;
      });
    }

    // Shared html2canvas -> jsPDF pipeline: rasterizes `el` into one tall
    // image, then slices it across successive A4 pages by shifting the
    // image's vertical offset each page (the standard technique for turning
    // an arbitrarily-tall HTML render into a paginated PDF).
    async function renderElementToPdf(el) {
      var canvas = await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      var imgData = canvas.toDataURL('image/jpeg', 0.92);
      var pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
      var pageWidth = pdf.internal.pageSize.getWidth();
      var pageHeight = pdf.internal.pageSize.getHeight();
      var imgWidth = pageWidth;
      var imgHeight = canvas.height * (imgWidth / canvas.width);
      var heightLeft = imgHeight;
      var position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
    }

    async function readWorkbook(file) {
      if (!window.XLSX) throw new Error('ไม่สามารถโหลดไลบรารีอ่าน Excel ได้ ลองรีเฟรชหน้านี้');
      if (/\.csv$/i.test(file.name)) {
        var text = await file.text();
        return XLSX.read(text, { type: 'string' });
      }
      var buf = await file.arrayBuffer();
      return XLSX.read(buf, { type: 'array' });
    }
    function sheetToRows(ws) {
      return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    }

    function validateExcelFile(file) {
      return /\.(xlsx|xls|csv)$/i.test(file.name) ? null : 'รองรับเฉพาะไฟล์ .xlsx, .xls, .csv เท่านั้น';
    }
    function validatePdfFile(file) {
      return /\.pdf$/i.test(file.name) ? null : 'รองรับเฉพาะไฟล์ .pdf เท่านั้น';
    }

    var IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp';
    function validateImageFile(file) {
      return (/^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name))
        ? null : 'รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP, GIF, BMP) เท่านั้น';
    }
    // Draws the decoded source image onto a same-size canvas — normalizes
    // every source format (including ones jsPDF/toBlob can't read directly,
    // like GIF/BMP) into pixel data any target format can be encoded from.
    async function loadImageAsCanvas(url) {
      var img = await loadImageEl(url);
      var canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      return { canvas: canvas, ctx: canvas.getContext('2d'), img: img };
    }

    // ----- run handlers: each takes plain File[] (+ onProgress) and
    // resolves to an array of { name, blob } handed to deliverFiles -----

    // docx-preview "123.4pt" style value -> CSS px.
    function cssPtToPx(value, fallbackPx) {
      var m = /^([\d.]+)pt$/.exec(value || '');
      return m ? parseFloat(m[1]) / 0.75 : fallbackPx;
    }

    function isCanvasRowBlank(data, width, row) {
      for (var x = 0; x < width; x += 3) {
        var i = (row * width + x) * 4;
        if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) return false;
      }
      return true;
    }

    // Walks up from `to` looking for an all-white row so page cuts fall
    // between text lines instead of through them.
    function findBlankRowCut(ctx, width, from, to) {
      if (to - from <= 0) return to;
      var data = ctx.getImageData(0, from, width, to - from).data;
      for (var r = to - from - 1; r >= 0; r--) {
        if (isCanvasRowBlank(data, width, r)) return from + r;
      }
      return to;
    }

    function isCanvasRegionBlank(ctx, width, from, height) {
      var data = ctx.getImageData(0, from, width, height).data;
      for (var r = 0; r < height; r += 4) {
        if (!isCanvasRowBlank(data, width, r)) return false;
      }
      return true;
    }

    // Each docx-preview <section> is one Word page (or a whole section when
    // the file has no saved page-break hints); overflow is split onto extra
    // pages, repeating the top margin on continuation pages.
    async function addDocxSectionToPdf(state, section) {
      var cs = window.getComputedStyle(section);
      var widthPx = section.offsetWidth;
      var pageHpx = cssPtToPx(section.style.minHeight, widthPx * Math.SQRT2);
      var padTop = parseFloat(cs.paddingTop) || 0;
      var padBottom = parseFloat(cs.paddingBottom) || 0;
      var canvas = await window.html2canvas(section, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      var ctx = canvas.getContext('2d');
      var s = canvas.width / widthPx;
      var pageW = widthPx * 0.75, pageH = pageHpx * 0.75;
      var orientation = pageW > pageH ? 'landscape' : 'portrait';
      var y = 0;
      while (y < canvas.height - 1) {
        var offset = y === 0 ? 0 : Math.round(padTop * s);
        var remaining = canvas.height - y;
        var room = Math.floor(pageHpx * s) - offset;
        var len;
        if (remaining <= room) {
          if (y > 0 && isCanvasRegionBlank(ctx, canvas.width, y, remaining)) break;
          len = remaining;
        } else {
          var target = Math.max(Math.floor(room - padBottom * s), Math.floor(room * 0.5));
          len = findBlankRowCut(ctx, canvas.width, y + Math.floor(target * 0.8), y + target) - y;
          if (len < 1) len = target;
        }
        var slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = len;
        var sctx = slice.getContext('2d');
        sctx.fillStyle = '#ffffff';
        sctx.fillRect(0, 0, slice.width, len);
        sctx.drawImage(canvas, 0, y, canvas.width, len, 0, 0, canvas.width, len);
        if (!state.pdf) state.pdf = new window.jspdf.jsPDF({ unit: 'pt', format: [pageW, pageH], orientation: orientation });
        else state.pdf.addPage([pageW, pageH], orientation);
        state.pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, (offset / s) * 0.75, pageW, (len / s) * 0.75);
        y += len;
      }
    }

    async function runWordToPdf(files, onProgress) {
      if (!window.docx || !window.docx.renderAsync) throw new Error('ไม่สามารถโหลดไลบรารีแปลงไฟล์ Word ได้ ลองรีเฟรชหน้านี้');
      if (!window.jspdf || !window.jspdf.jsPDF || !window.html2canvas) throw new Error('ไม่สามารถโหลดไลบรารีสร้าง PDF ได้ ลองรีเฟรชหน้านี้');
      var file = files[0];
      var buf = await file.arrayBuffer();
      var prevWidth = $render[0].style.width;
      var state = { pdf: null };
      try {
        $render.empty();
        // Pages carry their own width (landscape pages exceed the 794px default).
        $render[0].style.width = 'auto';
        await window.docx.renderAsync(buf, $render[0], $render[0], {
          inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false,
          experimental: true, useBase64URL: true
        });
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        var sections = $render.children('section').toArray();
        if (!sections.length) throw new Error('ไม่พบเนื้อหาในไฟล์ Word');
        for (var i = 0; i < sections.length; i++) {
          onProgress(i, sections.length);
          await addDocxSectionToPdf(state, sections[i]);
        }
        onProgress(sections.length, sections.length);
      } finally {
        $render.empty();
        $render[0].style.width = prevWidth;
      }
      if (!state.pdf) throw new Error('ไม่พบเนื้อหาในไฟล์ Word');
      var blob = new Blob([state.pdf.output('arraybuffer')], { type: 'application/pdf' });
      var baseName = file.name.replace(/\.docx$/i, '') || 'document';
      return [{ name: baseName + '.pdf', blob: blob }];
    }

    async function runExcelToPdf(files, onProgress) {
      if (!window.jspdf || !window.jspdf.jsPDF || !window.html2canvas) throw new Error('ไม่สามารถโหลดไลบรารีสร้าง PDF ได้ ลองรีเฟรชหน้านี้');
      var out = [];
      for (var i = 0; i < files.length; i++) {
        onProgress(i, files.length);
        var file = files[i];
        var wb = await readWorkbook(file);
        var html = '<div style="font-family: Arial, sans-serif; padding:24px;">';
        wb.SheetNames.forEach(function (name) {
          var rows = sheetToRows(wb.Sheets[name]);
          html += '<h3 style="margin:0 0 8px;">' + escapeHtml(name) + '</h3>';
          html += '<table style="border-collapse:collapse; width:100%; margin-bottom:24px; font-size:12px;">';
          rows.forEach(function (row, rIdx) {
            html += '<tr>';
            row.forEach(function (cell) {
              var tag = rIdx === 0 ? 'th' : 'td';
              html += '<' + tag + ' style="border:1px solid #999; padding:4px 6px; text-align:left;' + (rIdx === 0 ? 'background:#eee;' : '') + '">' + escapeHtml(cell) + '</' + tag + '>';
            });
            html += '</tr>';
          });
          html += '</table>';
        });
        html += '</div>';
        $render.empty();
        $render[0].innerHTML = html;
        var blob = await renderElementToPdf($render[0]);
        $render.empty();
        var baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, '') || 'sheet';
        out.push({ name: baseName + '.pdf', blob: blob });
      }
      onProgress(files.length, files.length);
      return out;
    }

    async function runExcelToMarkdown(files, onProgress) {
      var out = [];
      for (var i = 0; i < files.length; i++) {
        onProgress(i, files.length);
        var file = files[i];
        var wb = await readWorkbook(file);
        var md = wb.SheetNames.map(function (name) {
          var rows = sheetToRows(wb.Sheets[name]);
          if (!rows.length) return '## ' + name + '\n\n_(ไม่มีข้อมูล)_';
          var width = rows.reduce(function (max, r) { return Math.max(max, r.length); }, 0);
          var norm = rows.map(function (r) {
            var row = r.slice();
            while (row.length < width) row.push('');
            return row.map(function (c) { return String(c).replace(/\|/g, '\\|').replace(/\n/g, ' '); });
          });
          var lines = ['| ' + norm[0].join(' | ') + ' |', '| ' + norm[0].map(function () { return '---'; }).join(' | ') + ' |'];
          for (var r = 1; r < norm.length; r++) lines.push('| ' + norm[r].join(' | ') + ' |');
          return '## ' + name + '\n\n' + lines.join('\n');
        }).join('\n\n');
        var baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, '') || 'sheet';
        out.push({ name: baseName + '.md', blob: new Blob([md], { type: 'text/markdown' }) });
      }
      onProgress(files.length, files.length);
      return out;
    }

    async function runExcelToText(files, onProgress) {
      var out = [];
      for (var i = 0; i < files.length; i++) {
        onProgress(i, files.length);
        var file = files[i];
        var wb = await readWorkbook(file);
        var text = wb.SheetNames.map(function (name) {
          var rows = sheetToRows(wb.Sheets[name]);
          var body = rows.map(function (row) { return row.join('\t'); }).join('\n');
          return '=== ' + name + ' ===\n' + body;
        }).join('\n\n');
        var baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, '') || 'sheet';
        out.push({ name: baseName + '.txt', blob: new Blob([text], { type: 'text/plain' }) });
      }
      onProgress(files.length, files.length);
      return out;
    }

    async function runExcelToCsv(files, onProgress) {
      var out = [];
      for (var i = 0; i < files.length; i++) {
        onProgress(i, files.length);
        var file = files[i];
        var wb = await readWorkbook(file);
        var baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, '') || 'sheet';
        var multiSheet = wb.SheetNames.length > 1;
        wb.SheetNames.forEach(function (name) {
          var csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
          var outName = multiSheet ? baseName + '_' + name + '.csv' : baseName + '.csv';
          out.push({ name: outName, blob: new Blob([csv], { type: 'text/csv' }) });
        });
      }
      onProgress(files.length, files.length);
      return out;
    }

    async function runImageToPdf(files) {
      if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('ไม่สามารถโหลดไลบรารีสร้าง PDF ได้ ลองรีเฟรชหน้านี้');
      var pdf = null;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var url = URL.createObjectURL(file);
        try {
          var loaded = await loadImageAsCanvas(url);
          loaded.ctx.drawImage(loaded.img, 0, 0);
          var w = loaded.canvas.width * 0.75;
          var h = loaded.canvas.height * 0.75;
          var dataUrl = loaded.canvas.toDataURL('image/png');
          if (!pdf) {
            pdf = new window.jspdf.jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h] });
          } else {
            pdf.addPage([w, h], w > h ? 'landscape' : 'portrait');
          }
          pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      if (!pdf) throw new Error('ไม่มีรูปภาพให้แปลง');
      return [{ name: 'images.pdf', blob: new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }) }];
    }

    var IMAGE_TARGETS = {
      jpg: { mime: 'image/jpeg', ext: 'jpg' },
      png: { mime: 'image/png', ext: 'png' },
      webp: { mime: 'image/webp', ext: 'webp' }
    };
    // One runner shared by image|jpg, image|png, image|webp — differs only
    // in target mime/extension, so it's a factory instead of three near-
    // identical functions.
    function makeImageConvertRunner(target) {
      var spec = IMAGE_TARGETS[target];
      return async function (files, onProgress) {
        var out = [];
        for (var i = 0; i < files.length; i++) {
          onProgress(i, files.length);
          var file = files[i];
          var url = URL.createObjectURL(file);
          try {
            var loaded = await loadImageAsCanvas(url);
            if (target === 'jpg') {
              // JPEG has no alpha channel — fill white first so a
              // transparent PNG/WebP source doesn't turn black.
              loaded.ctx.fillStyle = '#ffffff';
              loaded.ctx.fillRect(0, 0, loaded.canvas.width, loaded.canvas.height);
            }
            loaded.ctx.drawImage(loaded.img, 0, 0);
            var blob = await new Promise(function (resolve, reject) {
              loaded.canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('แปลงรูปภาพล้มเหลว')); }, spec.mime, 0.92);
            });
            var baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
            out.push({ name: baseName + '.' + spec.ext, blob: blob });
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        onProgress(files.length, files.length);
        return out;
      };
    }

    async function runHtmlToPdf(files) {
      if (!window.jspdf || !window.jspdf.jsPDF || !window.html2canvas) throw new Error('ไม่สามารถโหลดไลบรารีสร้าง PDF ได้ ลองรีเฟรชหน้านี้');
      var file = files[0];
      var text = await file.text();
      var parsed = new DOMParser().parseFromString(text, 'text/html');
      Array.prototype.forEach.call(parsed.querySelectorAll('script'), function (s) { s.remove(); });
      $render.empty();
      $render[0].innerHTML = parsed.body ? parsed.body.innerHTML : text;
      var blob = await renderElementToPdf($render[0]);
      $render.empty();
      var baseName = file.name.replace(/\.html?$/i, '') || 'page';
      return [{ name: baseName + '.pdf', blob: blob }];
    }

    async function runTextToPdf(files, onProgress) {
      if (!window.jspdf || !window.jspdf.jsPDF || !window.html2canvas) throw new Error('ไม่สามารถโหลดไลบรารีสร้าง PDF ได้ ลองรีเฟรชหน้านี้');
      var out = [];
      for (var i = 0; i < files.length; i++) {
        onProgress(i, files.length);
        var file = files[i];
        var text = await file.text();
        $render.empty();
        $render[0].innerHTML = '<pre style="margin:0; padding:32px; white-space:pre-wrap; word-break:break-word; font-family:inherit; font-size:13px; line-height:1.6;"></pre>';
        $render.find('pre').text(text);
        var blob = await renderElementToPdf($render[0]);
        $render.empty();
        var baseName = file.name.replace(/\.txt$/i, '') || 'text';
        out.push({ name: baseName + '.pdf', blob: blob });
      }
      onProgress(files.length, files.length);
      return out;
    }

    // ----- PDF -> Word -----
    // Rebuilds each PDF page as flowing Word paragraphs (one Word section per
    // PDF page, same page size). Runs keep font/size/bold/italic/colour, lines
    // are re-joined into paragraphs, and images are placed in reading order;
    // large page-covering images are anchored behind text at their exact spot.
    // Hand-rolled OOXML via JSZip, so no docx-authoring library is needed.

    var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    var THAI_CHAR_RE = /[฀-๿]/;

    // Keys are PostScript names lowercased with subset tag, style suffix and
    // "PSMT"/"MT" already stripped.
    var PDF_FONT_NAMES = {
      arial: 'Arial', helvetica: 'Arial', timesnewroman: 'Times New Roman', times: 'Times New Roman',
      couriernew: 'Courier New', courier: 'Courier New', calibri: 'Calibri', cambria: 'Cambria',
      tahoma: 'Tahoma', verdana: 'Verdana', georgia: 'Georgia', garamond: 'Garamond',
      segoeui: 'Segoe UI', trebuchetms: 'Trebuchet MS', comicsansms: 'Comic Sans MS',
      microsoftsansserif: 'Microsoft Sans Serif', bookantiqua: 'Book Antiqua', centurygothic: 'Century Gothic',
      consolas: 'Consolas', symbol: 'Symbol', wingdings: 'Wingdings',
      thsarabunnew: 'TH Sarabun New', thsarabunpsk: 'TH SarabunPSK', thsarabunit9: 'TH SarabunIT๙',
      sarabun: 'Sarabun', angsananew: 'Angsana New', angsanaupc: 'AngsanaUPC', cordianew: 'Cordia New',
      cordiaupc: 'CordiaUPC', browallianew: 'Browallia New', leelawadee: 'Leelawadee', leelawadeeui: 'Leelawadee UI'
    };

    function sanitizeXmlText(s) {
      return String(s).replace(/[\t\n\r]/g, ' ').replace(/[\u0000-\u001F￾￿]/g, '');
    }
    function ptToTwip(pt) { return Math.round(pt * 20); }
    function ptToEmu(pt) { return Math.round(pt * 12700); }
    function clampNum(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

    function cleanPdfFontName(raw) {
      if (!raw) return null;
      var name = sanitizeXmlText(raw).replace(/^[A-Z]{6}\+/, '').split(/[,-]/)[0];
      var stripped = name.replace(/(Bold|Italic|Oblique|Regular|Roman|Medium|Light|Black|SemiBold|Semibold|Demi)+$/, '');
      if (stripped) name = stripped;
      name = name.replace(/(PSMT|MT)$/, '');
      var key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (PDF_FONT_NAMES[key]) return PDF_FONT_NAMES[key];
      name = name.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim();
      return name ? name.slice(0, 31) : null;
    }

    // Font objects only reach commonObjs after getOperatorList(), which
    // runPdfToWord always calls before reading text content.
    function getPdfFontInfo(page, styles, fontName, cache) {
      if (cache[fontName]) return cache[fontName];
      var font = null;
      try { if (page.commonObjs.has(fontName)) font = page.commonObjs.get(fontName); } catch (e) { font = null; }
      var rawName = (font && font.name) || '';
      var generic = styles && styles[fontName] ? styles[fontName].fontFamily : '';
      var family = cleanPdfFontName(rawName);
      if (!family) family = generic === 'serif' ? 'Times New Roman' : generic === 'monospace' ? 'Courier New' : null;
      var info = {
        family: family,
        bold: !!(font && (font.bold || font.black)) || /bold|black|heavy|semibold|demi/i.test(rawName),
        italic: !!(font && font.italic) || /italic|oblique/i.test(rawName)
      };
      cache[fontName] = info;
      return info;
    }

    function pdfColorToHex(args) {
      if (typeof args[0] === 'string') return args[0].replace('#', '').toUpperCase();
      var hex = '';
      for (var i = 0; i < 3; i++) hex += ('0' + clampNum(Math.round(args[i] || 0), 0, 255).toString(16)).slice(-2);
      return hex.toUpperCase();
    }

    function unitSquareBox(m) {
      var xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
      var ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
      var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
      return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
    }

    // Replays the operator list to recover what getTextContent() drops:
    // fill colour and invisible-text mode per glyph, and image placements.
    function walkPdfOperators(opList, baseTransform) {
      var OPS = pdfjsLib.OPS;
      var Util = pdfjsLib.Util;
      var state = { ctm: baseTransform.slice(), color: '000000', hidden: false };
      var stack = [];
      var chars = [];
      var images = [];
      function pushState() { stack.push({ ctm: state.ctm.slice(), color: state.color, hidden: state.hidden }); }
      for (var i = 0; i < opList.fnArray.length; i++) {
        var fn = opList.fnArray[i];
        var args = opList.argsArray[i] || [];
        if (fn === OPS.save) pushState();
        else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) { if (stack.length) state = stack.pop(); }
        else if (fn === OPS.paintFormXObjectBegin) { pushState(); if (args[0]) state.ctm = Util.transform(state.ctm, args[0]); }
        else if (fn === OPS.transform) state.ctm = Util.transform(state.ctm, args);
        else if (fn === OPS.setFillRGBColor) state.color = pdfColorToHex(args);
        else if (fn === OPS.setTextRenderingMode) state.hidden = args[0] === 3 || args[0] === 7;
        else if (fn === OPS.showText || fn === OPS.showSpacedText) {
          var glyphs = args[0] || [];
          for (var g = 0; g < glyphs.length; g++) {
            var uni = glyphs[g] && glyphs[g].unicode;
            if (!uni) continue;
            Array.from(uni).forEach(function (ch) {
              if (!/\s/.test(ch)) chars.push({ ch: ch, color: state.color, hidden: state.hidden });
            });
          }
        }
        else if (fn === OPS.paintImageXObject) images.push({ objId: args[0], box: unitSquareBox(state.ctm) });
        else if (fn === OPS.paintInlineImageXObject) images.push({ data: args[0], box: unitSquareBox(state.ctm) });
      }
      return { chars: chars, images: images };
    }

    // Text items and showText glyphs come out in the same content-stream
    // order, so a forward-only cursor with a small look-ahead aligns them.
    function matchPdfTextStyle(str, chars, cursor) {
      var first = null, total = 0, hidden = 0;
      Array.from(str).forEach(function (ch) {
        if (/\s/.test(ch)) return;
        total++;
        var end = Math.min(chars.length, cursor.i + 40);
        for (var k = cursor.i; k < end; k++) {
          if (chars[k].ch === ch) {
            cursor.i = k + 1;
            if (!first) first = chars[k];
            if (chars[k].hidden) hidden++;
            return;
          }
        }
      });
      return { color: first ? first.color : '000000', hidden: total > 0 && hidden === total };
    }

    function getPdfObject(page, objId) {
      var store = /^g_/.test(objId) ? page.commonObjs : page.objs;
      return new Promise(function (resolve) {
        var timer = setTimeout(function () { resolve(null); }, 15000);
        try {
          store.get(objId, function (data) { clearTimeout(timer); resolve(data); });
        } catch (e) { clearTimeout(timer); resolve(null); }
      });
    }

    async function pdfImageToPng(img) {
      if (!img || !img.width || !img.height) return null;
      var canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      var ctx = canvas.getContext('2d');
      if (img.bitmap) {
        ctx.drawImage(img.bitmap, 0, 0);
      } else if (img.data) {
        var out = ctx.createImageData(img.width, img.height);
        var d = out.data, src = img.data, K = pdfjsLib.ImageKind;
        if (img.kind === K.RGBA_32BPP) {
          d.set(src.length > d.length ? src.subarray(0, d.length) : src);
        } else if (img.kind === K.RGB_24BPP) {
          for (var i = 0, j = 0; j < d.length && i + 2 < src.length; i += 3, j += 4) {
            d[j] = src[i]; d[j + 1] = src[i + 1]; d[j + 2] = src[i + 2]; d[j + 3] = 255;
          }
        } else if (img.kind === K.GRAYSCALE_1BPP) {
          var rowBytes = (img.width + 7) >> 3;
          for (var y = 0; y < img.height; y++) {
            for (var x = 0; x < img.width; x++) {
              var v = (src[y * rowBytes + (x >> 3)] & (128 >> (x & 7))) ? 255 : 0;
              var o = (y * img.width + x) * 4;
              d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
            }
          }
        } else {
          return null;
        }
        ctx.putImageData(out, 0, 0);
      } else {
        return null;
      }
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    }

    function pdfLineStartsListItem(text) {
      return /^\s*([•●○◦■□▪▫►▸➢✓✔*\-–—]|\(?[0-9๐-๙]{1,3}[.)]|\(?[a-zA-Zก-ฮ][.)])\s/.test(text);
    }

    function finalizePdfLine(line) {
      line.items.sort(function (a, b) { return a.x - b.x; });
      var weights = {}, best = -1, prev = null;
      line.segs = [];
      line.tabStops = [];
      line.text = '';
      line.maxSize = 0;
      line.right = -Infinity;
      line.items.forEach(function (it) {
        var key = Math.round(it.size * 2);
        weights[key] = (weights[key] || 0) + it.str.length;
        if (weights[key] > best) { best = weights[key]; line.size = it.size; }
        line.maxSize = Math.max(line.maxSize, it.size);
        line.right = Math.max(line.right, it.x + it.w);
        if (prev) {
          var gap = it.x - (prev.x + prev.w);
          var unit = Math.min(prev.size, it.size);
          if (gap > unit * 1.5) {
            line.segs.push({ tab: true, style: prev });
            line.tabStops.push(it.x);
            line.text += '\t';
          } else if (gap > unit * 0.15 && !/\s$/.test(prev.str) && !/^\s/.test(it.str)) {
            line.segs.push({ text: ' ', style: prev });
            line.text += ' ';
          }
        }
        line.segs.push({ text: it.str, style: it });
        line.text += it.str;
        prev = it;
      });
      line.x = line.items[0].x;
      return line;
    }

    function groupPdfLines(items) {
      var sorted = items.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      var lines = [];
      sorted.forEach(function (it) {
        var line = lines[lines.length - 1];
        if (line && Math.abs(it.y - line.y) <= Math.max(1.5, Math.min(it.size, line.items[0].size) * 0.45)) line.items.push(it);
        else lines.push({ y: it.y, items: [it] });
      });
      return lines.map(finalizePdfLine);
    }

    function pdfLineContinuesParagraph(para, line, textRight) {
      var last = para.lines[para.lines.length - 1];
      var size = last.size;
      if (last.tabStops.length || line.tabStops.length) return false;
      if (Math.abs(line.size - size) > size * 0.15) return false;
      var pitch = line.y - last.y;
      if (pitch < size * 0.9 || pitch > size * 2) return false;
      if (para.lines.length > 1) {
        var prevPitch = last.y - para.lines[para.lines.length - 2].y;
        if (Math.abs(pitch - prevPitch) > size * 0.25) return false;
        if (Math.abs(line.x - last.x) > size * 0.8) return false;
      } else if (Math.abs(line.x - last.x) > size * 4) {
        return false;
      }
      // A line that stops well short of the column edge ended its paragraph.
      if (last.right < textRight - size * 3) return false;
      return !pdfLineStartsListItem(line.text);
    }

    function groupPdfParagraphs(lines) {
      var textRight = -Infinity;
      lines.forEach(function (l) { textRight = Math.max(textRight, l.right); });
      var paras = [];
      lines.forEach(function (line) {
        var para = paras[paras.length - 1];
        if (para && pdfLineContinuesParagraph(para, line, textRight)) para.lines.push(line);
        else paras.push({ lines: [line] });
      });
      return paras;
    }

    async function readPdfPageLayout(page, fontCache, imageCache, media) {
      var viewport = page.getViewport({ scale: 1 });
      var opList = await page.getOperatorList();
      var content = await page.getTextContent();
      var walked = walkPdfOperators(opList, viewport.transform);
      var cursor = { i: 0 };
      var items = [];
      content.items.forEach(function (item) {
        if (!item.str || !item.str.trim()) return;
        var tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        var size = Math.hypot(tx[2], tx[3]);
        var matched = matchPdfTextStyle(item.str, walked.chars, cursor);
        if (!size || matched.hidden) return;
        var str = sanitizeXmlText(item.str);
        if (!str) return;
        items.push({
          str: str, x: tx[4], y: tx[5], w: item.width || 0, size: size,
          font: getPdfFontInfo(page, content.styles, item.fontName, fontCache), color: matched.color
        });
      });

      var pageArea = viewport.width * viewport.height;
      var images = [];
      for (var i = 0; i < walked.images.length; i++) {
        var im = walked.images[i];
        if (im.box.w < 4 || im.box.h < 4) continue;
        var entry;
        if (im.objId && Object.prototype.hasOwnProperty.call(imageCache, im.objId)) {
          entry = imageCache[im.objId];
        } else {
          var bytes = await pdfImageToPng(im.data || (im.objId ? await getPdfObject(page, im.objId) : null));
          entry = null;
          if (bytes) {
            var n = media.length + 1;
            entry = { rid: 'rIdImg' + n, name: 'image' + n + '.png', bytes: bytes };
            media.push(entry);
          }
          if (im.objId) imageCache[im.objId] = entry;
        }
        if (entry) {
          images.push({
            media: entry, x: im.box.x, y: im.box.y, w: im.box.w, h: im.box.h,
            behind: im.box.w * im.box.h >= pageArea * 0.4
          });
        }
      }

      var lines = groupPdfLines(items);
      return { width: viewport.width, height: viewport.height, lines: lines, paras: groupPdfParagraphs(lines), images: images };
    }

    function detectPdfAlignment(para, area) {
      var lines = para.lines;
      var size = lines[0].size;
      var tol = Math.max(size, 6);
      var centered = lines.every(function (l) {
        return Math.abs((l.x + l.right) / 2 - area.mid) <= tol && l.x - area.left > size * 2;
      });
      if (centered) return 'center';
      var rightAligned = lines.every(function (l) {
        return Math.abs(l.right - area.right) <= tol && l.x > area.mid;
      });
      if (rightAligned) return 'right';
      if (lines.length > 2) {
        var rights = lines.slice(0, -1).map(function (l) { return l.right; });
        if (Math.max.apply(null, rights) - Math.min.apply(null, rights) <= size * 0.4) return 'both';
      }
      return 'left';
    }

    function pdfRunXml(seg) {
      var s = seg.style;
      var rPr = '';
      if (s.font.family) {
        var f = escapeXml(s.font.family);
        rPr += '<w:rFonts w:ascii="' + f + '" w:hAnsi="' + f + '" w:eastAsia="' + f + '" w:cs="' + f + '"/>';
      }
      if (s.font.bold) rPr += '<w:b/><w:bCs/>';
      if (s.font.italic) rPr += '<w:i/><w:iCs/>';
      if (s.color && s.color !== '000000') rPr += '<w:color w:val="' + s.color + '"/>';
      var hp = Math.max(2, Math.round(s.size * 2));
      rPr += '<w:sz w:val="' + hp + '"/><w:szCs w:val="' + hp + '"/>';
      var body = seg.tab ? '<w:tab/>' : '<w:t xml:space="preserve">' + escapeXml(seg.text) + '</w:t>';
      return '<w:r><w:rPr>' + rPr + '</w:rPr>' + body + '</w:r>';
    }

    function pdfStyleKey(s) {
      return [s.font.family, s.font.bold, s.font.italic, s.color, Math.round(s.size * 2)].join('|');
    }

    function pdfParagraphRunsXml(para) {
      var segs = [];
      para.lines.forEach(function (line, idx) {
        if (idx > 0 && segs.length) {
          var a = para.lines[idx - 1].text.slice(-1), b = line.text.charAt(0);
          var noSpace = /[\s\-]/.test(a) || /\s/.test(b) || (THAI_CHAR_RE.test(a) && THAI_CHAR_RE.test(b));
          if (!noSpace) segs.push({ text: ' ', style: segs[segs.length - 1].style });
        }
        segs = segs.concat(line.segs);
      });
      var merged = [];
      segs.forEach(function (seg) {
        var last = merged[merged.length - 1];
        if (last && !last.tab && !seg.tab && pdfStyleKey(last.style) === pdfStyleKey(seg.style)) last.text += seg.text;
        else merged.push({ tab: seg.tab, text: seg.text, style: seg.style });
      });
      return merged.map(pdfRunXml).join('');
    }

    function docxDrawingXml(entry, wPt, hPt, id, anchor) {
      var cx = ptToEmu(wPt), cy = ptToEmu(hPt);
      var docPr = '<wp:docPr id="' + id + '" name="Picture ' + id + '"/>' +
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>';
      var graphic = '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + entry.name + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="' + entry.rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
      if (anchor) {
        return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="' + id +
          '" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
          '<wp:positionH relativeFrom="page"><wp:posOffset>' + ptToEmu(anchor.x) + '</wp:posOffset></wp:positionH>' +
          '<wp:positionV relativeFrom="page"><wp:posOffset>' + ptToEmu(anchor.y) + '</wp:posOffset></wp:positionV>' +
          '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
          docPr + graphic + '</wp:anchor></w:drawing></w:r>';
      }
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
        '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
        docPr + graphic + '</wp:inline></w:drawing></w:r>';
    }

    function pdfPageMargins(pages) {
      var ext = { left: Infinity, right: Infinity, top: Infinity, bottom: Infinity };
      pages.forEach(function (pg) {
        pg.lines.forEach(function (l) {
          ext.left = Math.min(ext.left, l.x);
          ext.right = Math.min(ext.right, pg.width - l.right);
          ext.top = Math.min(ext.top, l.y - l.maxSize);
          ext.bottom = Math.min(ext.bottom, pg.height - (l.y + l.maxSize * 0.3));
        });
        pg.images.forEach(function (im) {
          if (im.behind) return;
          ext.left = Math.min(ext.left, im.x);
          ext.right = Math.min(ext.right, pg.width - (im.x + im.w));
          ext.top = Math.min(ext.top, im.y);
          ext.bottom = Math.min(ext.bottom, pg.height - (im.y + im.h));
        });
      });
      function pick(v, hi) { return clampNum(isFinite(v) ? v : hi, 14, hi); }
      // Small bottom margin leaves slack for Word font metrics running longer than the PDF.
      return { left: pick(ext.left, 90), right: pick(ext.right, 90), top: pick(ext.top, 90), bottom: pick(ext.bottom, 36) };
    }

    // Typical baseline pitch / font size ratio, used for single-line paragraphs.
    function pdfPitchRatio(pages) {
      var ratios = [];
      pages.forEach(function (pg) {
        pg.paras.forEach(function (para) {
          for (var i = 1; i < para.lines.length; i++) ratios.push((para.lines[i].y - para.lines[i - 1].y) / para.lines[i].size);
        });
      });
      if (!ratios.length) return 1.2;
      ratios.sort(function (a, b) { return a - b; });
      return clampNum(ratios[Math.floor(ratios.length / 2)], 1.05, 2);
    }

    function pdfSectPrXml(pg, m) {
      var w = clampNum(ptToTwip(pg.width), 1440, 31680), h = clampNum(ptToTwip(pg.height), 1440, 31680);
      return '<w:sectPr><w:pgSz w:w="' + w + '" w:h="' + h + '"' + (w > h ? ' w:orient="landscape"' : '') + '/>' +
        '<w:pgMar w:top="' + ptToTwip(m.top) + '" w:right="' + ptToTwip(m.right) + '" w:bottom="' + ptToTwip(m.bottom) +
        '" w:left="' + ptToTwip(m.left) + '" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
    }

    function buildPdfPageBody(pg, m, ratio, isLast, ids) {
      var area = { left: m.left, right: pg.width - m.right };
      area.mid = (area.left + area.right) / 2;
      var maxW = Math.max(36, area.right - area.left);
      var maxH = Math.max(36, pg.height - m.top - m.bottom);

      var blocks = pg.paras.map(function (para) {
        return { top: para.lines[0].y - para.lines[0].size, para: para };
      });
      var inline = pg.images.filter(function (im) { return !im.behind; }).sort(function (a, b) { return a.y - b.y; });
      inline.forEach(function (im) {
        var group = blocks.length && blocks[blocks.length - 1].images ? blocks[blocks.length - 1] : null;
        if (group && im.y < group.bottom - 2) {
          group.images.push(im);
          group.bottom = Math.max(group.bottom, im.y + im.h);
        } else {
          blocks.push({ top: im.y, bottom: im.y + im.h, images: [im] });
        }
      });
      blocks.sort(function (a, b) { return a.top - b.top; });

      var paragraphs = [];
      var cursor = m.top;
      blocks.forEach(function (block) {
        var pPr, runs;
        if (block.para) {
          var lines = block.para.lines;
          var first = lines[0], last = lines[lines.length - 1];
          var pitch = lines.length > 1 ? (last.y - first.y) / (lines.length - 1) : first.size * ratio;
          lines.forEach(function (l) { pitch = Math.max(pitch, l.maxSize * 1.05); });
          var before = Math.max(0, first.y - pitch * 0.8 - cursor);
          cursor = last.y + pitch * 0.2;
          var align = detectPdfAlignment(block.para, area);
          pPr = '';
          if (first.tabStops.length) {
            pPr += '<w:tabs>' + first.tabStops.map(function (x) {
              return '<w:tab w:val="left" w:pos="' + Math.max(0, ptToTwip(x - area.left)) + '"/>';
            }).join('') + '</w:tabs>';
          }
          pPr += '<w:spacing w:before="' + ptToTwip(before) + '" w:after="0" w:line="' + ptToTwip(pitch) + '" w:lineRule="exact"/>';
          if (align === 'left' || align === 'both') {
            var bodyX = lines.length > 1 ? lines[1].x : first.x;
            var indent = first.x - bodyX;
            pPr += '<w:ind w:left="' + Math.max(0, ptToTwip(bodyX - area.left)) + '"' +
              (indent > 0.5 ? ' w:firstLine="' + ptToTwip(indent) + '"' : indent < -0.5 ? ' w:hanging="' + ptToTwip(-indent) + '"' : '') + '/>';
          }
          if (align !== 'left') pPr += '<w:jc w:val="' + align + '"/>';
          runs = pdfParagraphRunsXml(block.para);
        } else {
          var imgs = block.images.sort(function (a, b) { return a.x - b.x; });
          var totalW = 0, maxImgH = 0;
          imgs.forEach(function (im) { totalW += im.w; maxImgH = Math.max(maxImgH, im.h); });
          var scale = Math.min(1, maxW / totalW, maxH / maxImgH);
          var gapBefore = Math.max(0, block.top - cursor);
          cursor = block.bottom;
          var left = imgs[0].x, right = imgs[imgs.length - 1].x + imgs[imgs.length - 1].w;
          pPr = '<w:spacing w:before="' + ptToTwip(gapBefore) + '" w:after="0" w:line="240" w:lineRule="auto"/>';
          if (Math.abs((left + right) / 2 - area.mid) <= 6 && left - area.left > 12) pPr += '<w:jc w:val="center"/>';
          else pPr += '<w:ind w:left="' + Math.max(0, ptToTwip(Math.min(left - area.left, maxW - totalW * scale))) + '"/>';
          runs = imgs.map(function (im) { return docxDrawingXml(im.media, im.w * scale, im.h * scale, ++ids.n); }).join('');
        }
        paragraphs.push({ pPr: pPr, runs: runs });
      });

      var behind = pg.images.filter(function (im) { return im.behind; }).map(function (im) {
        return docxDrawingXml(im.media, im.w, im.h, ++ids.n, { x: im.x, y: im.y });
      }).join('');
      if (!paragraphs.length) paragraphs.push({ pPr: '<w:spacing w:before="0" w:after="0"/>', runs: '' });
      paragraphs[0].runs = behind + paragraphs[0].runs;

      var sectPr = pdfSectPrXml(pg, m);
      var xml = paragraphs.map(function (p, idx) {
        var extra = !isLast && idx === paragraphs.length - 1 ? sectPr : '';
        return '<w:p><w:pPr>' + p.pPr + extra + '</w:pPr>' + p.runs + '</w:p>';
      }).join('');
      return { xml: xml, sectPr: sectPr };
    }

    function buildPdfDocx(pages, media) {
      var margins = pdfPageMargins(pages);
      var ratio = pdfPitchRatio(pages);
      var ids = { n: 0 };
      var body = '', finalSectPr = '';
      pages.forEach(function (pg, idx) {
        var out = buildPdfPageBody(pg, margins, ratio, idx === pages.length - 1, ids);
        body += out.xml;
        finalSectPr = out.sectPr;
      });

      var xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      var documentXml = xmlHead +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
        ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
        ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
        ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<w:body>' + body + finalSectPr + '</w:body></w:document>';
      var stylesXml = xmlHead +
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Tahoma"/>' +
        '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:bidi="th-TH"/></w:rPr></w:rPrDefault>' +
        '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
      var contentTypesXml = xmlHead +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '</Types>';
      var relsXml = xmlHead +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>';
      var docRelsXml = xmlHead +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        media.map(function (e) {
          return '<Relationship Id="' + e.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + e.name + '"/>';
        }).join('') +
        '</Relationships>';

      var zip = new JSZip();
      zip.file('[Content_Types].xml', contentTypesXml);
      zip.file('_rels/.rels', relsXml);
      zip.file('word/document.xml', documentXml);
      zip.file('word/styles.xml', stylesXml);
      zip.file('word/_rels/document.xml.rels', docRelsXml);
      media.forEach(function (e) { zip.file('word/media/' + e.name, e.bytes); });
      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: DOCX_MIME });
    }

    async function runPdfToWord(files, onProgress) {
      if (!window.pdfjsLib) throw new Error('ไม่สามารถโหลดไลบรารีอ่าน PDF ได้ ลองรีเฟรชหน้านี้');
      if (!window.JSZip) throw new Error('ไม่สามารถโหลดไลบรารีสร้างไฟล์ Word ได้ ลองรีเฟรชหน้านี้');
      var file = files[0];
      var buf = await file.arrayBuffer();
      var doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      var pages = [], media = [], fontCache = {}, imageCache = {};
      try {
        for (var p = 1; p <= doc.numPages; p++) {
          onProgress(p - 1, doc.numPages);
          var page = await doc.getPage(p);
          pages.push(await readPdfPageLayout(page, fontCache, imageCache, media));
          page.cleanup();
        }
        onProgress(doc.numPages, doc.numPages);
      } finally {
        doc.destroy();
      }
      var blob = await buildPdfDocx(pages, media);
      var baseName = file.name.replace(/\.pdf$/i, '') || 'document';
      return [{ name: baseName + '.docx', blob: blob }];
    }

    // Clusters text items into rows by Y position, then columns by X gaps —
    // an approximation; PDFs with complex table layouts may not line up
    // perfectly, but it's the realistic ceiling without a layout-analysis
    // model running client-side.
    function groupTextIntoGrid(items) {
      var rows = [];
      items.forEach(function (item) {
        var y = Math.round(item.transform[5]);
        var x = item.transform[4];
        var row = null;
        for (var i = 0; i < rows.length; i++) {
          if (Math.abs(rows[i].y - y) <= 3) { row = rows[i]; break; }
        }
        if (!row) { row = { y: y, cells: [] }; rows.push(row); }
        row.cells.push({ x: x, str: item.str });
      });
      rows.sort(function (a, b) { return b.y - a.y; });
      return rows.map(function (row) {
        row.cells.sort(function (a, b) { return a.x - b.x; });
        var cols = [];
        var lastX = null;
        var buffer = '';
        row.cells.forEach(function (cell) {
          if (lastX !== null && cell.x - lastX > 10) { cols.push(buffer.trim()); buffer = ''; }
          buffer += cell.str;
          lastX = cell.x + cell.str.length * 5;
        });
        if (buffer.trim()) cols.push(buffer.trim());
        return cols;
      });
    }

    async function runPdfToExcel(files) {
      if (!window.pdfjsLib) throw new Error('ไม่สามารถโหลดไลบรารีอ่าน PDF ได้ ลองรีเฟรชหน้านี้');
      if (!window.XLSX) throw new Error('ไม่สามารถโหลดไลบรารีสร้างไฟล์ Excel ได้ ลองรีเฟรชหน้านี้');
      var file = files[0];
      var buf = await file.arrayBuffer();
      var doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      var wb = XLSX.utils.book_new();
      for (var p = 1; p <= doc.numPages; p++) {
        var page = await doc.getPage(p);
        var content = await page.getTextContent();
        var ws = XLSX.utils.aoa_to_sheet(groupTextIntoGrid(content.items));
        XLSX.utils.book_append_sheet(wb, ws, 'Page' + p);
      }
      var out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      var baseName = file.name.replace(/\.pdf$/i, '') || 'document';
      return [{ name: baseName + '.xlsx', blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) }];
    }

    var PAIRS = {
      'word|pdf': {
        accept: '.docx,.doc', multiple: false, icon: 'bi-filetype-docx',
        title: 'ลากไฟล์ Word มาวางที่นี่',
        hint: 'รองรับเฉพาะ .docx — ไฟล์ .doc รูปแบบเก่าต้องแปลงเป็น .docx ก่อน',
        note: 'แปลงฝั่งเบราว์เซอร์ล้วนๆ รองรับข้อความ ตาราง และรูปแบบพื้นฐาน — เอกสารที่มีเลย์เอาต์ซับซ้อนอาจไม่ตรงกับ Word ทุกประการ',
        runLabel: 'แปลงเป็น PDF', zipBaseName: 'word-to-pdf',
        validate: function (file) {
          if (/\.doc$/i.test(file.name)) return 'ไม่รองรับไฟล์ .doc รูปแบบเก่า กรุณาบันทึกเป็น .docx ก่อนแล้วลองใหม่';
          if (!/\.docx$/i.test(file.name)) return 'รองรับเฉพาะไฟล์ .docx เท่านั้น';
          return null;
        },
        run: runWordToPdf
      },
      'excel|pdf': {
        accept: '.xlsx,.xls,.csv', multiple: true, icon: 'bi-filetype-xlsx',
        title: 'ลากไฟล์ Excel/CSV มาวางที่นี่', hint: 'เลือกได้หลายไฟล์ (.xlsx, .xls, .csv)',
        note: 'แปลงทุกชีตในไฟล์เป็นตารางบน PDF (แต่ละไฟล์ = 1 PDF)',
        runLabel: 'แปลงเป็น PDF', zipBaseName: 'excel-to-pdf',
        validate: validateExcelFile, run: runExcelToPdf
      },
      'excel|markdown': {
        accept: '.xlsx,.xls,.csv', multiple: true, icon: 'bi-filetype-xlsx',
        title: 'ลากไฟล์ Excel/CSV มาวางที่นี่', hint: 'เลือกได้หลายไฟล์ (.xlsx, .xls, .csv)',
        note: 'แปลงทุกชีตในไฟล์เป็นตาราง Markdown (แต่ละไฟล์ = 1 .md)',
        runLabel: 'แปลงเป็น Markdown', zipBaseName: 'excel-to-markdown',
        validate: validateExcelFile, run: runExcelToMarkdown
      },
      'excel|text': {
        accept: '.xlsx,.xls,.csv', multiple: true, icon: 'bi-filetype-xlsx',
        title: 'ลากไฟล์ Excel/CSV มาวางที่นี่', hint: 'เลือกได้หลายไฟล์ (.xlsx, .xls, .csv)',
        note: 'แปลงทุกชีตในไฟล์เป็นข้อความคั่นด้วย Tab (แต่ละไฟล์ = 1 .txt)',
        runLabel: 'แปลงเป็นข้อความ', zipBaseName: 'excel-to-text',
        validate: validateExcelFile, run: runExcelToText
      },
      'excel|csv': {
        accept: '.xlsx,.xls,.csv', multiple: true, icon: 'bi-filetype-xlsx',
        title: 'ลากไฟล์ Excel/CSV มาวางที่นี่', hint: 'เลือกได้หลายไฟล์ (.xlsx, .xls, .csv)',
        note: 'แปลงแต่ละชีตเป็นไฟล์ .csv แยกกัน (ถ้าไฟล์มีหลายชีต)',
        runLabel: 'แปลงเป็น CSV', zipBaseName: 'excel-to-csv',
        validate: validateExcelFile, run: runExcelToCsv
      },
      'powerpoint|pdf': { disabled: true },
      'image|pdf': {
        accept: IMAGE_ACCEPT, multiple: true, thumb: true, reorderable: true, icon: 'bi-filetype-jpg',
        title: 'ลากรูปภาพมาวางที่นี่', hint: 'เลือกได้หลายไฟล์ — ลำดับรายการคือลำดับหน้าใน PDF',
        note: '', runLabel: 'รวมเป็น PDF', zipBaseName: 'images',
        validate: validateImageFile, run: runImageToPdf
      },
      'image|jpg': {
        accept: IMAGE_ACCEPT, multiple: true, thumb: true, icon: 'bi-filetype-jpg',
        title: 'ลากรูปภาพมาวางที่นี่', hint: 'เลือกได้หลายไฟล์ — แปลงเป็น JPG ทีละไฟล์',
        note: 'พื้นหลังโปร่งใส (PNG/WebP) จะถูกเติมสีขาว เพราะ JPG ไม่รองรับความโปร่งใส · GIF เคลื่อนไหวจะแปลงเฉพาะเฟรมแรก',
        runLabel: 'แปลงเป็น JPG', zipBaseName: 'converted-jpg',
        validate: validateImageFile, run: makeImageConvertRunner('jpg')
      },
      'image|png': {
        accept: IMAGE_ACCEPT, multiple: true, thumb: true, icon: 'bi-filetype-png',
        title: 'ลากรูปภาพมาวางที่นี่', hint: 'เลือกได้หลายไฟล์ — แปลงเป็น PNG ทีละไฟล์',
        note: 'GIF เคลื่อนไหวจะแปลงเฉพาะเฟรมแรก',
        runLabel: 'แปลงเป็น PNG', zipBaseName: 'converted-png',
        validate: validateImageFile, run: makeImageConvertRunner('png')
      },
      'image|webp': {
        accept: IMAGE_ACCEPT, multiple: true, thumb: true, icon: 'bi-file-earmark-image',
        title: 'ลากรูปภาพมาวางที่นี่', hint: 'เลือกได้หลายไฟล์ — แปลงเป็น WebP ทีละไฟล์',
        note: 'GIF เคลื่อนไหวจะแปลงเฉพาะเฟรมแรก',
        runLabel: 'แปลงเป็น WebP', zipBaseName: 'converted-webp',
        validate: validateImageFile, run: makeImageConvertRunner('webp')
      },
      'html|pdf': {
        accept: '.html,.htm,text/html', multiple: false, icon: 'bi-filetype-html',
        title: 'ลากไฟล์ HTML มาวางที่นี่', hint: 'รองรับไฟล์ HTML แบบสแตนด์อโลน (inline CSS) เท่านั้น',
        note: 'รูปภาพ/สไตล์ที่อ้างอิงจากไฟล์ภายนอกจะไม่ถูกโหลด เพราะไม่มีการเชื่อมต่อเซิร์ฟเวอร์',
        runLabel: 'แปลงเป็น PDF', zipBaseName: 'html-to-pdf',
        validate: function (file) { return /\.html?$/i.test(file.name) ? null : 'รองรับเฉพาะไฟล์ .html/.htm เท่านั้น'; },
        run: runHtmlToPdf
      },
      'text|pdf': {
        accept: '.txt,text/plain', multiple: true, icon: 'bi-filetype-txt',
        title: 'ลากไฟล์ข้อความมาวางที่นี่', hint: 'เลือกได้หลายไฟล์ (.txt)',
        note: '', runLabel: 'แปลงเป็น PDF', zipBaseName: 'text-to-pdf',
        validate: function (file) { return /\.txt$/i.test(file.name) ? null : 'รองรับเฉพาะไฟล์ .txt เท่านั้น'; },
        run: runTextToPdf
      },
      'pdf|word': {
        accept: '.pdf,application/pdf', multiple: false, icon: 'bi-file-earmark-pdf',
        title: 'ลากไฟล์ PDF มาวางที่นี่', hint: '',
        note: 'คงฟอนต์ ขนาด ตัวหนา/เอียง สี ย่อหน้า การจัดแนว ขนาดหน้า และรูปภาพไว้ใกล้เคียงต้นฉบับ — ตารางจะออกมาเป็นข้อความจัดด้วย Tab, ขีดเส้นใต้/เส้นกรอบไม่ถูกดึงมา และ PDF ที่สแกนจะได้เป็นรูปภาพ',
        runLabel: 'แปลงเป็น Word', zipBaseName: 'pdf-to-word',
        validate: validatePdfFile, run: runPdfToWord
      },
      'pdf|excel': {
        accept: '.pdf,application/pdf', multiple: false, icon: 'bi-file-earmark-pdf',
        title: 'ลากไฟล์ PDF มาวางที่นี่', hint: '',
        note: 'จัดข้อความเป็นแถว/คอลัมน์ตามตำแหน่งบนหน้า PDF — อาจไม่ตรงกับตารางเป๊ะ 100% สำหรับ PDF ที่มีเลย์เอาต์ซับซ้อน',
        runLabel: 'แปลงเป็น Excel', zipBaseName: 'pdf-to-excel',
        validate: validatePdfFile, run: runPdfToExcel
      },
      'pdf|powerpoint': { disabled: true },
      'pdf|image': { alias: true }
    };

    function currentPairKey() { return $fromSelect.val() + '|' + $toSelect.val(); }

    function setStageStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }
    function setStageBusy(busy) {
      $btnRun.prop('disabled', busy || items.length === 0);
      $btnRun.toggleClass('busy', busy);
      $btnRun.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
      $progress.toggleClass('hidden', !busy);
      if (!busy) $progress.find('.progress-fill').css('width', '0%');
    }
    function updateStageProgress(done, total) {
      $progress.find('.progress-fill').css('width', Math.round((done / total) * 100) + '%');
      setStageStatus('กำลังแปลงไฟล์ ' + done + '/' + total + '…', 'neutral');
    }
    function updateRunButton() { $btnRun.prop('disabled', items.length === 0); }

    function moveItem(idx, dir, cfg) {
      var target = idx + dir;
      if (target < 0 || target >= items.length) return;
      var tmp = items[idx]; items[idx] = items[target]; items[target] = tmp;
      renderFileList(cfg);
    }

    function renderFileList(cfg) {
      $fileList.empty();
      items.forEach(function (item, idx) {
        var $row = $('<div>').addClass('flex items-center gap-2.5 bg-surface border border-line rounded-xl px-3 py-2.5 shadow-sm');
        if (cfg.thumb && item.url) {
          $row.append($('<img>').attr('src', item.url).addClass('h-9 w-9 flex-none rounded-lg object-cover border border-line'));
        } else {
          $row.append($('<span>').addClass('flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accentsoft text-accent')
            .append($('<i>').addClass('bi ' + (cfg.icon || 'bi-file-earmark') + ' text-base leading-none')));
        }
        $row.append($('<div>').addClass('flex-1 min-w-0').append(
          $('<div>').addClass('font-semibold text-[13px] truncate').text(item.file.name),
          $('<div>').addClass('text-[11.5px] text-inksoft').text(formatSize(item.file.size))
        ));
        var $actions = $('<div>').addClass('flex items-center gap-1 flex-none');
        if (cfg.reorderable) {
          $actions.append(
            $('<button>').attr('type', 'button').addClass('flex h-7 w-7 items-center justify-center rounded-lg text-inksoft hover:text-ink hover:bg-surface2 disabled:opacity-30 disabled:pointer-events-none')
              .prop('disabled', idx === 0).append($('<i>').addClass('bi bi-chevron-up text-sm leading-none'))
              .on('click', function () { moveItem(idx, -1, cfg); }),
            $('<button>').attr('type', 'button').addClass('flex h-7 w-7 items-center justify-center rounded-lg text-inksoft hover:text-ink hover:bg-surface2 disabled:opacity-30 disabled:pointer-events-none')
              .prop('disabled', idx === items.length - 1).append($('<i>').addClass('bi bi-chevron-down text-sm leading-none'))
              .on('click', function () { moveItem(idx, 1, cfg); })
          );
        }
        $actions.append($('<button>').attr('type', 'button').addClass('flex h-7 w-7 items-center justify-center rounded-lg text-inksoft hover:text-bad hover:bg-badsoft')
          .append($('<i>').addClass('bi bi-x-lg text-sm leading-none'))
          .on('click', function () {
            if (item.url) URL.revokeObjectURL(item.url);
            items.splice(idx, 1);
            renderFileList(cfg);
          }));
        $row.append($actions);
        $fileList.append($row);
      });
      updateRunButton();
    }

    function addFiles(fileList, cfg) {
      $uploadError.text('');
      var incoming = Array.prototype.slice.call(fileList);
      if (!cfg.multiple) { incoming = incoming.slice(0, 1); items = []; }
      for (var i = 0; i < incoming.length; i++) {
        var file = incoming[i];
        var err = cfg.validate ? cfg.validate(file) : null;
        if (err) { $uploadError.text(err); continue; }
        items.push({ file: file, url: cfg.thumb ? URL.createObjectURL(file) : null });
      }
      renderFileList(cfg);
    }

    function resetStageFiles() {
      items.forEach(function (it) { if (it.url) URL.revokeObjectURL(it.url); });
      items = [];
      $fileList.empty();
      $uploadError.text('');
      setStageStatus('', 'neutral');
      updateRunButton();
    }

    function updatePairUI() {
      resetStageFiles();
      var key = currentPairKey();
      var cfg = PAIRS[key];
      $stage.attr('hidden', true);
      $stageDisabled.attr('hidden', true);
      $stageAlias.attr('hidden', true);
      $note.text('');
      if (!cfg) return;
      if (cfg.disabled) { $stageDisabled.removeAttr('hidden'); return; }
      if (cfg.alias) { $stageAlias.removeAttr('hidden'); return; }
      $note.text(cfg.note || '');
      $dropzoneTitle.text(cfg.title);
      $dropzoneHint.html('หรือ <span class="text-accentdeep font-semibold underline underline-offset-2">เลือกไฟล์จากเครื่อง</span>' + (cfg.hint ? ' — ' + cfg.hint : ''));
      $fileInput.attr('accept', cfg.accept);
      if (cfg.multiple) $fileInput.attr('multiple', 'multiple'); else $fileInput.removeAttr('multiple');
      $runLabel.text(cfg.runLabel || 'แปลงไฟล์');
      $stage.removeAttr('hidden');
    }

    function populateToOptions() {
      var from = $fromSelect.val();
      var opts = TO_OPTIONS[from] || [];
      var prevTo = $toSelect.val();
      $toSelect.empty();
      opts.forEach(function (o) { $toSelect.append($('<option>').val(o.value).text(o.label)); });
      var stillValid = opts.some(function (o) { return o.value === prevTo; });
      if (stillValid) $toSelect.val(prevTo);
      updatePairUI();
    }

    $fromSelect.on('change', populateToOptions);
    $toSelect.on('change', updatePairUI);

    $('#btn-convert-alias-pdf-image').on('click', function () {
      $viewConvertFiles.attr('hidden', true);
      openView($viewPdf);
    });

    $dropzone.on('click', function () { $fileInput.trigger('click'); });
    $dropzone.on('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $fileInput.trigger('click'); }
    });
    $dropzone.on('dragenter dragover', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-line').addClass('border-accent bg-accentsoft');
    });
    $dropzone.on('dragleave drop', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-accent bg-accentsoft').addClass('border-line');
    });
    $dropzone.on('drop', function (e) {
      var cfg = PAIRS[currentPairKey()];
      if (!cfg || cfg.disabled || cfg.alias) return;
      var dt = e.originalEvent.dataTransfer;
      if (dt && dt.files && dt.files.length) addFiles(dt.files, cfg);
    });
    $fileInput.on('change', function () {
      var cfg = PAIRS[currentPairKey()];
      if (cfg && $fileInput[0].files.length) addFiles($fileInput[0].files, cfg);
      $fileInput.val('');
    });

    $btnRun.on('click', async function () {
      var cfg = PAIRS[currentPairKey()];
      if (!cfg || !items.length) return;
      setStageBusy(true);
      setStageStatus('', 'neutral');
      try {
        var outFiles = await cfg.run(items.map(function (it) { return it.file; }), updateStageProgress);
        if (!outFiles || !outFiles.length) throw new Error('ไม่มีไฟล์ผลลัพธ์');
        var res = await deliverFiles(outFiles, cfg.zipBaseName || 'converted');
        setStageStatus(res.status === 'saved' ? 'บันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        setStageStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      } finally {
        setStageBusy(false);
      }
    });

    populateToOptions();

    return {
      reset: function () {
        $fromSelect.val('word');
        populateToOptions();
      }
    };
  }

  // ---------- Text generator ----------
  // Wires up the "สร้างข้อความ" view once its markup (views/text-gen.html)
  // has been fetched and mounted. Two independent sub-tools: generate a
  // string of an exact character count (Lorem Ipsum / random / repeated
  // pattern), and a live character/word/line counter for pasted text.
  var LOREM_IPSUM_BASE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ';

  function repeatToLength(base, length) {
    if (!base) return '';
    var out = '';
    while (out.length < length) out += base;
    return out.slice(0, length);
  }
  function randomStringOfLength(length, pool) {
    var chars = new Array(length);
    for (var i = 0; i < length; i++) chars[i] = pool.charAt(Math.floor(Math.random() * pool.length));
    return chars.join('');
  }

  function initTextGenView() {
    var $length = $('#textgen-length');
    var $mode = $('#textgen-mode');
    var $randomOptions = $('#textgen-random-options');
    var $repeatOptions = $('#textgen-repeat-options');
    var $optUpper = $('#textgen-opt-upper');
    var $optLower = $('#textgen-opt-lower');
    var $optDigits = $('#textgen-opt-digits');
    var $optSymbols = $('#textgen-opt-symbols');
    var $repeatPattern = $('#textgen-repeat-pattern');
    var $btnGenerate = $('#btn-textgen-generate');
    var $output = $('#textgen-output');
    var $outputCount = $('#textgen-output-count');
    var $btnCopy = $('#btn-textgen-copy');
    var $btnDownload = $('#btn-textgen-download');
    var $btnSendToCounter = $('#btn-textgen-send-to-counter');
    var $statusEl = $('#textgen-status');

    var $countInput = $('#textcount-input');
    var $countChars = $('#textcount-chars');
    var $countCharsNoSpace = $('#textcount-chars-no-space');
    var $countWords = $('#textcount-words');
    var $countLines = $('#textcount-lines');

    function setStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }

    function updateOutputCount() {
      $outputCount.text('ผลลัพธ์: ' + $output.val().length.toLocaleString() + ' ตัวอักษร');
    }

    $mode.on('change', function () {
      var mode = $mode.val();
      $randomOptions.attr('hidden', mode !== 'random');
      $repeatOptions.attr('hidden', mode !== 'repeat');
    });

    $btnGenerate.on('click', function () {
      var length = Math.max(1, Math.min(1000000, parseInt($length.val(), 10) || 0));
      if (!length) { setStatus('กรุณาระบุจำนวนตัวอักษรที่ต้องการ (อย่างน้อย 1)', 'bad'); return; }
      var mode = $mode.val();
      var text;
      if (mode === 'lorem') {
        text = repeatToLength(LOREM_IPSUM_BASE, length);
      } else if (mode === 'repeat') {
        var pattern = $repeatPattern.val();
        if (!pattern) { setStatus('กรุณาระบุข้อความที่ต้องการทำซ้ำ', 'bad'); return; }
        text = repeatToLength(pattern, length);
      } else {
        var pool = '';
        if ($optUpper.prop('checked')) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if ($optLower.prop('checked')) pool += 'abcdefghijklmnopqrstuvwxyz';
        if ($optDigits.prop('checked')) pool += '0123456789';
        if ($optSymbols.prop('checked')) pool += '!@#$%^&*()-_=+[]{};:,.<>?';
        if (!pool) pool = 'abcdefghijklmnopqrstuvwxyz';
        text = randomStringOfLength(length, pool);
      }
      $output.val(text);
      updateOutputCount();
      setStatus('', 'neutral');
    });

    $btnCopy.on('click', async function () {
      var text = $output.val();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setStatus('คัดลอกแล้ว', 'good');
      } catch (err) {
        $output.trigger('select');
        setStatus('ไม่สามารถคัดลอกอัตโนมัติได้ ข้อความถูกเลือกไว้แล้ว กด Ctrl+C', 'bad');
      }
    });

    $btnDownload.on('click', async function () {
      var text = $output.val();
      if (!text) return;
      try {
        var res = await deliverFiles([{ name: 'generated-text.txt', blob: new Blob([text], { type: 'text/plain' }) }], 'generated-text');
        setStatus(res.status === 'saved' ? 'บันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      }
    });

    $btnSendToCounter.on('click', function () {
      $countInput.val($output.val());
      updateCounts();
      $countInput.trigger('focus');
    });

    function updateCounts() {
      var text = $countInput.val();
      var chars = text.length;
      var charsNoSpace = text.replace(/\s/g, '').length;
      var words = text.trim() ? text.trim().split(/\s+/).length : 0;
      var lines = text ? text.split(/\n/).length : 0;
      $countChars.text(chars.toLocaleString());
      $countCharsNoSpace.text(charsNoSpace.toLocaleString());
      $countWords.text(words.toLocaleString());
      $countLines.text(lines.toLocaleString());
    }
    $countInput.on('input', updateCounts);

    updateOutputCount();
    updateCounts();
  }

  // ---------- Test file generator ----------
  // Builds a dummy file of a requested size, named with the chosen
  // extension, entirely client-side — for exercising upload flows / file
  // size limits. Three tiers, from most to least "real":
  //  1. REAL_EXTS — genuinely valid, openable files built with libraries
  //     already loaded by this app (jsPDF-equivalent hand-rolled PDF,
  //     JSZip for docx/xlsx-as-zip/zip, SheetJS for xlsx/xls, canvas for
  //     jpg/png/webp, hand-rolled BMP/WAV). Padded as close to the
  //     requested size as the format allows — exact for byte-container
  //     formats, approximate for compressed/encoded ones (images).
  //  2. TEXT_EXTS — a minimal valid wrapper for the format (so it at least
  //     opens as plain text/XML) padded with Lorem Ipsum to an exact size.
  //  3. Everything else — real magic-byte header (so naive content-sniffing
  //     recognizes the type) followed by pseudo-random filler. This does
  //     NOT open as a real file of that format — no client-side encoder is
  //     available for these (legacy OLE doc/ppt, audio/video codecs,
  //     rar/7z, tiff/heic, gif). Only extension and byte size are exact.
  var TEXT_EXTS = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'py', 'sql', 'svg', 'rtf'];
  var REAL_EXTS = ['pdf', 'docx', 'xlsx', 'xls', 'zip', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'wav'];

  function asciiBytes(str) {
    var arr = [];
    for (var i = 0; i < str.length; i++) arr.push(str.charCodeAt(i) & 0xFF);
    return arr;
  }
  function riffHeader(formatTag) {
    return asciiBytes('RIFF').concat([0x00, 0x00, 0x00, 0x00], asciiBytes(formatTag));
  }
  function isoBmffHeader(brand) {
    return [0x00, 0x00, 0x00, 0x18].concat(asciiBytes('ftyp'), asciiBytes(brand));
  }

  var OOXML_ZIP_HEADER = [0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00];
  var OLE_HEADER = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

  var MIME_MAP = {
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    rtf: 'application/rtf', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', tiff: 'image/tiff', heic: 'image/heic',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg',
    mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime', webm: 'video/webm',
    zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar', gz: 'application/gzip',
    json: 'application/json', xml: 'application/xml', html: 'text/html', css: 'text/css',
    js: 'text/javascript', ts: 'text/plain', py: 'text/x-python', sql: 'application/sql'
  };

  // Only formats with no real client-side encoder land here (see REAL_EXTS
  // above for the ones that don't).
  var MAGIC_MAP = {
    doc: OLE_HEADER, ppt: OLE_HEADER,
    pptx: OOXML_ZIP_HEADER,
    gif: asciiBytes('GIF89a'),
    tiff: [0x49, 0x49, 0x2A, 0x00],
    heic: isoBmffHeader('heic'),
    mp3: asciiBytes('ID3').concat([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    m4a: isoBmffHeader('M4A '),
    flac: asciiBytes('fLaC'),
    ogg: asciiBytes('OggS'),
    mp4: isoBmffHeader('mp42'),
    mov: isoBmffHeader('qt  '),
    mkv: [0x1A, 0x45, 0xDF, 0xA3],
    webm: [0x1A, 0x45, 0xDF, 0xA3],
    avi: riffHeader('AVI '),
    rar: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00],
    '7z': [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C],
    gz: [0x1F, 0x8B, 0x08],
    tar: []
  };

  var TEXT_WRAP = {
    json: { prefix: '{"test_data":"', suffix: '"}' },
    xml: { prefix: '<?xml version="1.0" encoding="UTF-8"?><testFile><![CDATA[', suffix: ']]></testFile>' },
    html: { prefix: '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><!-- ', suffix: ' --></body></html>' },
    css: { prefix: '/* test data */\nbody::before{content:"', suffix: '"}' },
    js: { prefix: '// test data\nvar testFileFiller = "', suffix: '";\n' },
    ts: { prefix: '// test data\nconst testFileFiller: string = "', suffix: '";\n' },
    py: { prefix: '# test data\ntest_file_filler = "', suffix: '"\n' },
    sql: { prefix: "-- test data\nSELECT '", suffix: "';\n" },
    svg: { prefix: '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><!-- ', suffix: ' --></svg>' },
    rtf: { prefix: '{\\rtf1\\ansi\\deff0 ', suffix: ' }' }
  };

  function buildTextContent(ext, totalBytes) {
    if (ext === 'csv') return repeatToLength('test,file,generator,data\n', totalBytes);
    if (ext === 'txt' || ext === 'md') return repeatToLength(LOREM_IPSUM_BASE, totalBytes);
    var wrap = TEXT_WRAP[ext] || { prefix: '', suffix: '' };
    var overhead = wrap.prefix.length + wrap.suffix.length;
    if (overhead >= totalBytes) return repeatToLength(LOREM_IPSUM_BASE, totalBytes);
    return wrap.prefix + repeatToLength(LOREM_IPSUM_BASE, totalBytes - overhead) + wrap.suffix;
  }

  function buildRandomFill(length) {
    var chunk = new Uint8Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
      var STEP = 65536; // crypto.getRandomValues caps out per call
      for (var offset = 0; offset < length; offset += STEP) {
        chunk.set(window.crypto.getRandomValues(new Uint8Array(Math.min(STEP, length - offset))), offset);
      }
    } else {
      for (var i = 0; i < length; i++) chunk[i] = Math.floor(Math.random() * 256);
    }
    return chunk;
  }

  function buildBinaryBytes(ext, totalBytes) {
    var header = MAGIC_MAP[ext] || [];
    var bytes = new Uint8Array(totalBytes);
    var headerLen = Math.min(header.length, totalBytes);
    for (var h = 0; h < headerLen; h++) bytes[h] = header[h];
    var fillLen = totalBytes - headerLen;
    if (fillLen > 0) {
      // One small random "seed" tiled across the remaining space — far
      // faster than filling byte-by-byte for large requested sizes, while
      // still avoiding an all-zero (trivially compressible) file.
      var seedLen = Math.min(fillLen, 65536);
      var seed = buildRandomFill(seedLen);
      var pos = headerLen;
      while (pos < totalBytes) {
        var take = Math.min(seedLen, totalBytes - pos);
        bytes.set(seed.subarray(0, take), pos);
        pos += take;
      }
    }
    return bytes;
  }

  // ----- REAL_EXTS builders: each returns (a Promise of) a genuinely
  // openable Blob, padded as close to totalBytes as the format allows. -----

  function pad10(n) {
    var s = String(n);
    while (s.length < 10) s = '0' + s;
    return s;
  }

  // Hand-rolled minimal single-page PDF (no jsPDF dependency needed — full
  // control over byte offsets means the requested size can be hit exactly
  // via a trailing `%` comment, which PDF readers ignore like any comment).
  function buildPdfString(paddingLen) {
    var padding = paddingLen > 0 ? repeatToLength(LOREM_IPSUM_BASE, paddingLen) : '';
    var contentStream = 'BT /F1 14 Tf 20 270 Td (Generated test file) Tj ET';
    var defs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      '<< /Length ' + contentStream.length + ' >>\nstream\n' + contentStream + '\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    var body = '%PDF-1.4\n';
    var offsets = [];
    for (var i = 0; i < defs.length; i++) {
      offsets.push(body.length);
      body += (i + 1) + ' 0 obj\n' + defs[i] + '\nendobj\n';
    }
    if (padding) body += '% ' + padding + '\n';
    var xrefOffset = body.length;
    var xref = 'xref\n0 ' + (defs.length + 1) + '\n0000000000 65535 f \n';
    for (var j = 0; j < offsets.length; j++) xref += pad10(offsets[j]) + ' 00000 n \n';
    body += xref + 'trailer\n<< /Size ' + (defs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
    return body;
  }
  function buildRealPdfBlob(totalBytes) {
    var text = buildPdfString(0);
    var fillerLen = 0;
    for (var i = 0; i < 4 && text.length !== totalBytes; i++) {
      fillerLen = Math.max(0, fillerLen + (totalBytes - text.length));
      text = buildPdfString(fillerLen);
    }
    return new Blob([text], { type: 'application/pdf' });
  }

  // Hand-rolled minimal OOXML .docx via JSZip (same technique the "PDF to
  // Word" converter above uses) — STORE (no DEFLATE) so appending N bytes
  // of padding text grows the final file by ~N bytes, making the target
  // size reachable in a couple of measure-and-retry passes.
  async function buildDocxZip(paddingLen) {
    var padding = paddingLen > 0 ? repeatToLength(LOREM_IPSUM_BASE, paddingLen) : '';
    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t xml:space="preserve">Generated test file. ' + padding + '</w:t></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>' +
      '</w:body></w:document>';
    var contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>';
    var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';
    var zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypesXml);
    zip.folder('_rels').file('.rels', relsXml);
    zip.folder('word').file('document.xml', documentXml);
    return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: MIME_MAP.docx });
  }
  async function buildRealDocxBlob(totalBytes) {
    var blob = await buildDocxZip(0);
    var fillerLen = 0;
    for (var i = 0; i < 2 && blob.size !== totalBytes; i++) {
      fillerLen = Math.max(0, fillerLen + (totalBytes - blob.size));
      blob = await buildDocxZip(fillerLen);
    }
    return blob;
  }

  // A generic .zip containing one padded text file (STORE mode — same
  // exact-size-by-measurement trick as the docx builder above).
  async function buildZipContainer(paddingLen) {
    var content = 'Generated test file.\n' + (paddingLen > 0 ? repeatToLength(LOREM_IPSUM_BASE, paddingLen) : '');
    var zip = new JSZip();
    zip.file('test-file.txt', content);
    return zip.generateAsync({ type: 'blob', compression: 'STORE' });
  }
  async function buildRealZipBlob(totalBytes) {
    var blob = await buildZipContainer(0);
    var fillerLen = 0;
    for (var i = 0; i < 2 && blob.size !== totalBytes; i++) {
      fillerLen = Math.max(0, fillerLen + (totalBytes - blob.size));
      blob = await buildZipContainer(fillerLen);
    }
    return blob;
  }

  // SheetJS workbook, padding spread across multiple rows (one cell can't
  // exceed Excel's ~32,767-character limit) so even a large requested size
  // stays a workbook Excel accepts rather than one oversized cell.
  function buildPaddedWorkbook(paddingLen) {
    var CELL_CAP = 30000;
    var rows = [['Generated test file']];
    var remaining = paddingLen;
    while (remaining > 0) {
      var take = Math.min(CELL_CAP, remaining);
      rows.push([repeatToLength(LOREM_IPSUM_BASE, take)]);
      remaining -= take;
    }
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
    return wb;
  }
  function buildRealXlsxBlob(totalBytes) {
    var out = XLSX.write(buildPaddedWorkbook(0), { bookType: 'xlsx', type: 'array', compression: false });
    var fillerLen = 0;
    for (var i = 0; i < 2 && out.length !== totalBytes; i++) {
      fillerLen = Math.max(0, fillerLen + (totalBytes - out.length));
      out = XLSX.write(buildPaddedWorkbook(fillerLen), { bookType: 'xlsx', type: 'array', compression: false });
    }
    return new Blob([out], { type: MIME_MAP.xlsx });
  }
  function buildRealXlsBlob(totalBytes) {
    var out = XLSX.write(buildPaddedWorkbook(0), { bookType: 'biff8', type: 'array' });
    var fillerLen = 0;
    for (var i = 0; i < 2 && out.length !== totalBytes; i++) {
      fillerLen = Math.max(0, fillerLen + (totalBytes - out.length));
      out = XLSX.write(buildPaddedWorkbook(fillerLen), { bookType: 'biff8', type: 'array' });
    }
    return new Blob([out], { type: MIME_MAP.xls });
  }

  // Real raster image via canvas.toBlob (same API the image-conversion
  // tools above already use) filled with pseudo-random pixels. Compressed
  // output size can't be dictated directly, so this scales canvas
  // dimensions by the observed size ratio and re-encodes a few times to
  // converge close to the target — never exact for jpg/png/webp.
  function buildNoiseCanvas(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(width, height);
    for (var i = 0; i < imgData.data.length; i += 4) {
      var n = Math.floor(Math.random() * 256);
      imgData.data[i] = n;
      imgData.data[i + 1] = (n + 85) % 256;
      imgData.data[i + 2] = (n + 170) % 256;
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }
  function canvasToBlobAsync(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('เข้ารหัสรูปภาพล้มเหลว')); }, mime, quality);
    });
  }
  async function buildRealImageBlob(ext, totalBytes) {
    var mime = MIME_MAP[ext];
    var quality = (ext === 'jpg' || ext === 'jpeg') ? 0.85 : undefined;
    var width = Math.max(8, Math.round(Math.sqrt(Math.max(64, totalBytes / 1.2))));
    var height = width;
    var blob = await canvasToBlobAsync(buildNoiseCanvas(width, height), mime, quality);
    for (var i = 0; i < 4 && Math.abs(blob.size - totalBytes) > Math.max(512, totalBytes * 0.05); i++) {
      var scale = Math.sqrt(totalBytes / Math.max(1, blob.size));
      width = Math.max(8, Math.round(width * scale));
      height = Math.max(8, Math.round(height * scale));
      blob = await canvasToBlobAsync(buildNoiseCanvas(width, height), mime, quality);
    }
    return blob;
  }

  // Hand-rolled uncompressed 24bpp BMP — the simplest real image format to
  // size precisely, since file size is pure arithmetic (54-byte header +
  // width x height x 3, row-padded to 4 bytes) with no encoder involved.
  function buildBmpBlob(totalBytes) {
    var HEADER_SIZE = 54;
    var available = Math.max(3, totalBytes - HEADER_SIZE);
    var width = Math.max(1, Math.round(Math.sqrt(available / 3)));
    var rowSize = Math.ceil(width * 3 / 4) * 4;
    var height = Math.max(1, Math.floor(available / rowSize));
    var pixelDataSize = rowSize * height;
    var fileSize = HEADER_SIZE + pixelDataSize;
    var buf = new Uint8Array(fileSize);
    var dv = new DataView(buf.buffer);
    buf[0] = 0x42; buf[1] = 0x4D; // 'BM'
    dv.setUint32(2, fileSize, true);
    dv.setUint32(10, HEADER_SIZE, true);
    dv.setUint32(14, 40, true);
    dv.setInt32(18, width, true);
    dv.setInt32(22, height, true);
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    dv.setUint32(34, pixelDataSize, true);
    dv.setInt32(38, 2835, true);
    dv.setInt32(42, 2835, true);
    for (var i = HEADER_SIZE; i < fileSize; i++) buf[i] = (i * 37) & 0xFF;
    return new Blob([buf], { type: MIME_MAP.bmp });
  }

  // Hand-rolled 16-bit mono PCM WAV (silence) — like BMP, an uncompressed
  // format where size is pure arithmetic, so the target is hit exactly
  // (within 1 byte, rounded to a whole sample).
  function writeAscii(buf, offset, str) {
    for (var i = 0; i < str.length; i++) buf[offset + i] = str.charCodeAt(i) & 0xFF;
  }
  function buildWavBlob(totalBytes) {
    var HEADER_SIZE = 44;
    var dataSize = Math.max(0, totalBytes - HEADER_SIZE);
    dataSize -= (dataSize % 2); // whole 16-bit samples
    var fileSize = HEADER_SIZE + dataSize;
    var buf = new Uint8Array(fileSize);
    var dv = new DataView(buf.buffer);
    var sampleRate = 44100;
    writeAscii(buf, 0, 'RIFF');
    dv.setUint32(4, fileSize - 8, true);
    writeAscii(buf, 8, 'WAVE');
    writeAscii(buf, 12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, sampleRate * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    writeAscii(buf, 36, 'data');
    dv.setUint32(40, dataSize, true);
    return new Blob([buf], { type: MIME_MAP.wav });
  }

  async function buildRealBlob(ext, totalBytes) {
    switch (ext) {
      case 'pdf': return buildRealPdfBlob(totalBytes);
      case 'docx': return buildRealDocxBlob(totalBytes);
      case 'xlsx': return buildRealXlsxBlob(totalBytes);
      case 'xls': return buildRealXlsBlob(totalBytes);
      case 'zip': return buildRealZipBlob(totalBytes);
      case 'jpg': case 'jpeg': case 'png': case 'webp': return buildRealImageBlob(ext, totalBytes);
      case 'bmp': return buildBmpBlob(totalBytes);
      case 'wav': return buildWavBlob(totalBytes);
    }
  }

  function initTestFileView() {
    var $extSelect = $('#testfile-ext');
    var $sizeInput = $('#testfile-size');
    var $unitSelect = $('#testfile-unit');
    var $nameInput = $('#testfile-filename');
    var $btnGenerate = $('#btn-testfile-generate');
    var $statusEl = $('#testfile-status');

    var UNIT_BYTES = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
    var MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB safety cap — larger blobs risk crashing the tab

    function setStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }
    function setBusy(busy) {
      $btnGenerate.prop('disabled', busy);
      $btnGenerate.toggleClass('busy', busy);
      $btnGenerate.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
    }

    $btnGenerate.on('click', async function () {
      var sizeVal = parseFloat($sizeInput.val());
      if (!sizeVal || sizeVal <= 0) { setStatus('กรุณาระบุขนาดไฟล์ที่มากกว่า 0', 'bad'); return; }
      var totalBytes = Math.round(sizeVal * (UNIT_BYTES[$unitSelect.val()] || 1));
      if (totalBytes <= 0) { setStatus('กรุณาระบุขนาดไฟล์ที่มากกว่า 0', 'bad'); return; }
      if (totalBytes > MAX_BYTES) { setStatus('ขนาดไฟล์เกินขีดจำกัด 2 GB ต่อไฟล์', 'bad'); return; }

      var ext = $extSelect.val();
      var baseName = ($nameInput.val() || 'test-file').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'test-file';
      var fileName = baseName + '.' + ext;

      setBusy(true);
      setStatus('', 'neutral');
      try {
        var blob;
        if (REAL_EXTS.indexOf(ext) !== -1) {
          blob = await buildRealBlob(ext, totalBytes);
        } else if (TEXT_EXTS.indexOf(ext) !== -1) {
          blob = new Blob([buildTextContent(ext, totalBytes)], { type: MIME_MAP[ext] || 'text/plain' });
        } else {
          blob = new Blob([buildBinaryBytes(ext, totalBytes)], { type: MIME_MAP[ext] || 'application/octet-stream' });
        }
        var sizeNote = blob.size === totalBytes ? formatSize(blob.size) : formatSize(blob.size) + ' — ขอไว้ ' + formatSize(totalBytes);
        var res = await deliverFiles([{ name: fileName, blob: blob }], baseName);
        setStatus((res.status === 'saved' ? 'สร้างไฟล์และบันทึกสำเร็จ (' : 'สร้างไฟล์และส่งเรียบร้อย (') + sizeNote + ')', 'good');
      } catch (err) {
        setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      } finally {
        setBusy(false);
      }
    });
  }

  // ---------- Video convert (ffmpeg.wasm) ----------
  // Unlike every other library in this app, @ffmpeg/ffmpeg 0.12 ships ESM
  // only, so it's loaded with dynamic import() (valid in a classic script,
  // just not a static `import` statement) instead of a <script src> tag in
  // index.html — and only once the user actually opens this view, since the
  // core is a ~30MB WASM download nobody should pay for on every page load.
  // The single-thread core (dist/esm) is used deliberately: the multi-thread
  // core needs cross-origin-isolation (COOP/COEP) response headers, which a
  // plain static file host (see .claude/launch.json, GitHub Pages, etc.)
  // does not guarantee.
  //
  // FFmpeg's own worker (dist/esm/worker.js) does `new Worker(cdnURL)`
  // internally, which every browser blocks with a SecurityError because
  // worker scripts must be same-origin — same underlying restriction noted
  // for pdf.worker above, just enforced for a different API. The fix is the
  // same shape as toBlobURL() already does for the core: fetch the worker
  // script's text ourselves, rewrite its two relative imports (./const.js,
  // ./errors.js) to absolute CDN URLs, and hand FFmpeg a blob: URL of that
  // (via classWorkerURL) — blob: URLs share this page's origin, so the
  // Worker constructor allows it. Must be the dist/esm core build too (not
  // dist/umd): FFmpeg's module-worker fallback path does
  // `(await import(coreURL)).default`, which is `undefined` for a UMD
  // script, silently failing core init ("failed to import ffmpeg-core.js").
  var FFMPEG_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/';
  var FFMPEG_JS_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm';
  var FFMPEG_UTIL_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/+esm';
  var FFMPEG_CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

  var VIDEO_FORMATS = {
    mp4: { label: 'MP4', ext: 'mp4', mime: 'video/mp4', fromExts: ['mp4'] },
    mkv: { label: 'MKV (Matroska)', ext: 'mkv', mime: 'video/x-matroska', fromExts: ['mkv'] },
    avi: { label: 'AVI', ext: 'avi', mime: 'video/x-msvideo', fromExts: ['avi'] },
    mov: { label: 'MOV (QuickTime)', ext: 'mov', mime: 'video/quicktime', fromExts: ['mov'] },
    wmv: { label: 'WMV', ext: 'wmv', mime: 'video/x-ms-wmv', fromExts: ['wmv'] },
    flv: { label: 'FLV', ext: 'flv', mime: 'video/x-flv', fromExts: ['flv'] },
    webm: { label: 'WebM', ext: 'webm', mime: 'video/webm', fromExts: ['webm'] },
    mpeg: { label: 'MPEG / MPG', ext: 'mpg', mime: 'video/mpeg', fromExts: ['mpeg', 'mpg'] },
    '3gp': { label: '3GP', ext: '3gp', mime: 'video/3gpp', fromExts: ['3gp'] },
    vob: { label: 'VOB', ext: 'vob', mime: 'video/dvd', fromExts: ['vob'] },
    m4v: { label: 'M4V', ext: 'm4v', mime: 'video/x-m4v', fromExts: ['m4v'] },
    ts: { label: 'TS / MTS / M2TS', ext: 'ts', mime: 'video/mp2t', fromExts: ['ts', 'mts', 'm2ts'] },
    gif: { label: 'GIF (เคลื่อนไหว)', ext: 'gif', mime: 'image/gif', fromExts: ['gif'] }
  };
  var VIDEO_FORMAT_ORDER = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mpeg', '3gp', 'vob', 'm4v', 'ts', 'gif'];
  // Every encoder below needs even width/height (chroma subsampling), so
  // every non-GIF, non-3GP target scales down to the nearest even pixel
  // instead of failing outright on odd-dimensioned source video.
  var EVEN_SCALE_FILTER = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

  function buildFfmpegArgs(inputName, outFmt, opts) {
    var fmt = VIDEO_FORMATS[outFmt];
    var outName = 'output.' + fmt.ext;
    var args = ['-i', inputName];
    switch (outFmt) {
      case 'mp4':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', outName]);
        break;
      case 'm4v':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mp4', outName]);
        break;
      case 'mkv':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', outName]);
        break;
      case 'mov':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', outName]);
        break;
      case 'ts':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mpegts', outName]);
        break;
      case 'webm':
        // -pix_fmt yuv420p matters more here than for the other targets:
        // libvpx's auto_alt_ref refuses to init on a source with an alpha
        // channel (common for GIF input) unless the alpha is stripped first.
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-pix_fmt', 'yuv420p', '-c:v', 'libvpx', '-b:v', '1500k', '-c:a', 'libvorbis', outName]);
        break;
      case 'avi':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'mpeg4', '-vtag', 'xvid', '-qscale:v', '4', '-c:a', 'libmp3lame', outName]);
        break;
      case 'wmv':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'wmv2', '-b:v', '2000k', '-c:a', 'wmav2', outName]);
        break;
      case 'flv':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'flv', '-b:v', '1500k', '-c:a', 'libmp3lame', outName]);
        break;
      case 'mpeg':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'mpeg2video', '-b:v', '3000k', '-c:a', 'mp2', '-f', 'mpeg', outName]);
        break;
      case 'vob':
        args = args.concat(['-vf', EVEN_SCALE_FILTER, '-c:v', 'mpeg2video', '-b:v', '4000k', '-c:a', 'ac3', '-f', 'mpeg', outName]);
        break;
      case '3gp':
        // h263 only accepts a handful of fixed frame sizes, so this target
        // ignores the source aspect ratio and forces QCIF instead of the
        // generic even-dimension scale used by every other format above.
        args = args.concat(['-vf', 'scale=176:144', '-c:v', 'h263', '-c:a', 'aac', '-ar', '8000', '-b:a', '32k', outName]);
        break;
      case 'gif':
        var fps = opts.gifFps || 10;
        var width = opts.gifWidth || 480;
        args = args.concat(['-vf', 'fps=' + fps + ',scale=' + width + ':-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer', outName]);
        break;
    }
    return { args: args, outName: outName };
  }

  var ffmpegLoadPromise = null;
  var ffmpegProgressHandler = null;
  function loadFFmpegEngine() {
    if (!ffmpegLoadPromise) {
      ffmpegLoadPromise = (async function () {
        var workerRes = await fetch(FFMPEG_BASE + 'worker.js');
        if (!workerRes.ok) throw new Error('ไม่สามารถโหลดตัวแปลงวิดีโอได้ (worker.js)');
        var workerText = await workerRes.text();
        workerText = workerText.replace(/from\s*(["'])\.\//g, 'from $1' + FFMPEG_BASE);
        var workerBlobUrl = URL.createObjectURL(new Blob([workerText], { type: 'text/javascript' }));

        var ffmpegMod = await import(/* webpackIgnore: true */ FFMPEG_JS_URL);
        var utilMod = await import(/* webpackIgnore: true */ FFMPEG_UTIL_URL);
        var ffmpeg = new ffmpegMod.FFmpeg();
        ffmpeg.on('progress', function (e) { if (ffmpegProgressHandler) ffmpegProgressHandler(e); });
        await ffmpeg.load({
          classWorkerURL: workerBlobUrl,
          coreURL: await utilMod.toBlobURL(FFMPEG_CORE_BASE + '/ffmpeg-core.js', 'text/javascript'),
          wasmURL: await utilMod.toBlobURL(FFMPEG_CORE_BASE + '/ffmpeg-core.wasm', 'application/wasm')
        });
        return ffmpeg;
      })();
    }
    return ffmpegLoadPromise;
  }

  // Wires up the "video convert" view once its markup (views/video-convert.html)
  // has been fetched and mounted — see videoConvertViewReady above. A "from"
  // + "to" dropdown pair (populated from VIDEO_FORMATS, not hardcoded twice
  // in the markup) covers every pair — unlike the explicit per-pair PAIRS
  // map in initConvertFilesView, ffmpeg transcodes any supported input to
  // any supported output through the same one-argument-array pipeline built
  // by buildFfmpegArgs above, so "from" only drives the dropzone's accepted
  // extension/validation, not a different code path.
  function initVideoConvertView() {
    var state = { file: null };

    var $dropzone = $('#video-dropzone');
    var $dropzoneTitle = $('#video-dropzone-title');
    var $fileInput = $('#video-file-input');
    var $uploadError = $('#video-upload-error');
    var $docCard = $('#video-doc-card');
    var $docName = $('#video-doc-name');
    var $docMeta = $('#video-doc-meta');
    var $panel = $('#video-panel');
    var $formatFrom = $('#video-format-from');
    var $formatSelect = $('#video-format');
    var $gifOptions = $('#video-gif-options');
    var $gifHint = $('#video-gif-hint');
    var $gifFps = $('#video-gif-fps');
    var $gifWidth = $('#video-gif-width');
    var $btnConvert = $('#btn-video-convert');
    var $progress = $('#video-progress');
    var $statusEl = $('#video-status');

    VIDEO_FORMAT_ORDER.forEach(function (key) {
      var opt = '<option value="' + key + '">' + VIDEO_FORMATS[key].label + '</option>';
      $formatFrom.append(opt);
      $formatSelect.append(opt);
    });
    $formatFrom.val('mp4');
    $formatSelect.val('mkv');

    function setStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }
    function setBusy(busy) {
      $btnConvert.prop('disabled', busy);
      $btnConvert.toggleClass('busy', busy);
      $btnConvert.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
      $formatFrom.prop('disabled', busy);
      $formatSelect.prop('disabled', busy);
      $progress.toggleClass('hidden', !busy);
      if (!busy) $progress.find('.progress-fill').css('width', '0%');
    }
    function updateProgress(frac) {
      var pct = Math.max(0, Math.min(100, Math.round((frac || 0) * 100)));
      $progress.find('.progress-fill').css('width', pct + '%');
      setStatus('กำลังแปลงไฟล์… ' + pct + '%', 'neutral');
    }
    function showUploadError(msg) { $uploadError.text(msg || ''); }

    function refreshDropzoneForFrom() {
      var fmt = VIDEO_FORMATS[$formatFrom.val()];
      $fileInput.attr('accept', fmt.fromExts.map(function (e) { return '.' + e; }).join(','));
      $dropzoneTitle.text('ลากไฟล์ ' + fmt.label + ' มาวางที่นี่');
      // Switching "from" invalidates whatever was already uploaded under
      // the previous format, same as switching pairs in initConvertFilesView.
      if (state.file) {
        state.file = null;
        $docCard.css('display', 'none');
        $panel.css('display', 'none');
      }
      showUploadError('');
      setStatus('', 'neutral');
    }
    $formatFrom.on('change', function () {
      if ($formatFrom.val() === $formatSelect.val()) {
        var idx = VIDEO_FORMAT_ORDER.indexOf($formatFrom.val());
        $formatSelect.val(VIDEO_FORMAT_ORDER[(idx + 1) % VIDEO_FORMAT_ORDER.length]);
      }
      refreshDropzoneForFrom();
    });
    refreshDropzoneForFrom();

    $formatSelect.on('change', function () {
      if ($formatSelect.val() === $formatFrom.val()) {
        var idx = VIDEO_FORMAT_ORDER.indexOf($formatSelect.val());
        $formatFrom.val(VIDEO_FORMAT_ORDER[(idx + 1) % VIDEO_FORMAT_ORDER.length]);
      }
      var isGif = $formatSelect.val() === 'gif';
      $gifOptions.css('display', isGif ? 'grid' : 'none');
      $gifHint.css('display', isGif ? 'block' : 'none');
    });

    function handleFile(file) {
      var fromFmt = VIDEO_FORMATS[$formatFrom.val()];
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      if (fromFmt.fromExts.indexOf(ext) === -1) {
        showUploadError('ไฟล์นี้ไม่ใช่ ' + fromFmt.label + ' — เลือกฟอร์แมตต้นทางให้ตรงกับไฟล์ในช่อง "จากไฟล์" ก่อน หรืออัปโหลดไฟล์ ' + fromFmt.label);
        return;
      }
      showUploadError('');
      state.file = file;
      $docName.text(file.name);
      $docMeta.text(ext.toUpperCase() + ' · ' + formatSize(file.size));
      $docCard.css('display', 'flex');
      $panel.css('display', 'block');
      setStatus('', 'neutral');
    }

    $dropzone.on('click', function () { $fileInput.trigger('click'); });
    $dropzone.on('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $fileInput.trigger('click'); }
    });
    $dropzone.on('dragenter dragover', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-line').addClass('border-accent bg-accentsoft');
    });
    $dropzone.on('dragleave drop', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-accent bg-accentsoft').addClass('border-line');
    });
    $dropzone.on('drop', function (e) {
      var dt = e.originalEvent.dataTransfer;
      var f = dt && dt.files && dt.files[0];
      if (f) handleFile(f);
    });
    $fileInput.on('change', function () {
      if ($fileInput[0].files[0]) handleFile($fileInput[0].files[0]);
      $fileInput.val('');
    });
    $docCard.find('#video-doc-clear').on('click', function () {
      state.file = null;
      $docCard.css('display', 'none');
      $panel.css('display', 'none');
      setStatus('', 'neutral');
    });

    $btnConvert.on('click', async function () {
      if (!state.file) return;
      var outFmt = $formatSelect.val();
      var opts = { gifFps: parseInt($gifFps.val(), 10) || 10, gifWidth: parseInt($gifWidth.val(), 10) || 480 };

      setBusy(true);
      setStatus('กำลังโหลดตัวแปลงวิดีโอ (ครั้งแรกใช้เวลาสักครู่ ~30MB)…', 'neutral');
      var inputName = null;
      var outputName = null;
      var ffmpeg = null;
      try {
        ffmpeg = await loadFFmpegEngine();
        ffmpegProgressHandler = updateProgress;

        var inputExt = (state.file.name.split('.').pop() || 'bin').toLowerCase();
        inputName = 'input.' + inputExt;
        var data = new Uint8Array(await state.file.arrayBuffer());
        await ffmpeg.writeFile(inputName, data);

        setStatus('กำลังแปลงไฟล์…', 'neutral');
        var built = buildFfmpegArgs(inputName, outFmt, opts);
        outputName = built.outName;
        // ffmpeg.exec() resolves with ffmpeg's own process exit code instead
        // of rejecting on failure — a non-zero code (e.g. an encoder that
        // refuses this input, like libvpx on a source with an alpha
        // channel) still resolves, so it has to be checked explicitly or a
        // broken/empty file would silently reach deliverFiles below.
        var exitCode = await ffmpeg.exec(built.args);
        if (exitCode !== 0) throw new Error('แปลงไฟล์ไม่สำเร็จ — ไฟล์ต้นฉบับหรือฟอร์แมตปลายทางนี้อาจไม่รองรับ (ffmpeg exit code ' + exitCode + ')');

        var outData = await ffmpeg.readFile(outputName);
        if (!outData || !outData.length) throw new Error('แปลงไฟล์ไม่สำเร็จ — ได้ไฟล์ผลลัพธ์ว่างเปล่า');
        var fmt = VIDEO_FORMATS[outFmt];
        var outBlob = new Blob([outData], { type: fmt.mime });
        var baseName = state.file.name.replace(/\.[^.]+$/, '') || 'video';
        var outFileName = baseName + '.' + fmt.ext;

        var res = await deliverFiles([{ name: outFileName, blob: outBlob }], baseName + '-converted');
        setStatus(res.status === 'saved' ? 'แปลงและบันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        console.error(err);
        setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      } finally {
        ffmpegProgressHandler = null;
        if (ffmpeg && inputName) { try { await ffmpeg.deleteFile(inputName); } catch (e) { /* best-effort cleanup */ } }
        if (ffmpeg && outputName) { try { await ffmpeg.deleteFile(outputName); } catch (e) { /* best-effort cleanup */ } }
        setBusy(false);
      }
    });
  }

  // ---------- File resize ----------
  // Pads or truncates an uploaded file's raw bytes to hit an exact target
  // size — not a real compressor/upscaler. Growing is done by appending a
  // zero-filled tail (Blob concatenation, so the original bytes are never
  // read into JS memory — works fine even for large files), which most
  // formats that store their critical structure near the start (JPEG/PNG
  // trailing bytes, PDF trailing %%EOF, plain text) tolerate; shrinking
  // truncates the tail outright, which is destructive for nearly every
  // structured format (ZIP's central directory, Office, video containers
  // all keep essential structure at the end) — the view's copy and the
  // in-panel note both say so, this isn't a real "compress" feature.
  function initFileResizeView() {
    var state = { file: null };
    var MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB safety cap, same as initTestFileView
    var UNIT_BYTES = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };

    var $dropzone = $('#fileresize-dropzone');
    var $fileInput = $('#fileresize-file-input');
    var $uploadError = $('#fileresize-upload-error');
    var $docCard = $('#fileresize-doc-card');
    var $docName = $('#fileresize-doc-name');
    var $docMeta = $('#fileresize-doc-meta');
    var $panel = $('#fileresize-panel');
    var $sizeInput = $('#fileresize-size');
    var $unitSelect = $('#fileresize-unit');
    var $directionNote = $('#fileresize-direction-note');
    var $btnRun = $('#btn-fileresize-run');
    var $progress = $('#fileresize-progress');
    var $statusEl = $('#fileresize-status');

    function setStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }
    function setBusy(busy) {
      $btnRun.prop('disabled', busy);
      $btnRun.toggleClass('busy', busy);
      $btnRun.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
      $progress.toggleClass('hidden', !busy);
      if (!busy) $progress.find('.progress-fill').css('width', '100%');
    }
    function showUploadError(msg) { $uploadError.text(msg || ''); }

    function bestUnitFor(bytes) {
      if (bytes >= UNIT_BYTES.gb) return 'gb';
      if (bytes >= UNIT_BYTES.mb) return 'mb';
      if (bytes >= UNIT_BYTES.kb) return 'kb';
      return 'b';
    }

    function updateDirectionNote() {
      if (!state.file) { $directionNote.text(''); return; }
      var targetBytes = Math.round((parseFloat($sizeInput.val()) || 0) * (UNIT_BYTES[$unitSelect.val()] || 1));
      if (targetBytes > state.file.size) {
        $directionNote.removeClass('text-bad').addClass('text-good').text('จะเพิ่มขนาด (เติม ' + formatSize(targetBytes - state.file.size) + ' ต่อท้ายไฟล์)');
      } else if (targetBytes < state.file.size) {
        $directionNote.removeClass('text-good').addClass('text-bad').text('จะลดขนาด (ตัดท้ายไฟล์ทิ้ง ' + formatSize(state.file.size - targetBytes) + ' — ไฟล์มีโอกาสสูงที่จะเปิดไม่ได้)');
      } else {
        $directionNote.removeClass('text-good text-bad').text('ขนาดเป้าหมายเท่ากับไฟล์เดิมอยู่แล้ว');
      }
    }
    $sizeInput.on('input', updateDirectionNote);
    $unitSelect.on('change', updateDirectionNote);

    function handleFile(file) {
      showUploadError('');
      state.file = file;
      $docName.text(file.name);
      $docMeta.text(formatSize(file.size));
      $docCard.css('display', 'flex');
      $panel.css('display', 'block');
      setStatus('', 'neutral');
      var unit = bestUnitFor(file.size);
      $unitSelect.val(unit);
      $sizeInput.val(unit === 'b' ? file.size : Math.round((file.size / UNIT_BYTES[unit]) * 100) / 100);
      updateDirectionNote();
    }

    $dropzone.on('click', function () { $fileInput.trigger('click'); });
    $dropzone.on('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $fileInput.trigger('click'); }
    });
    $dropzone.on('dragenter dragover', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-line').addClass('border-accent bg-accentsoft');
    });
    $dropzone.on('dragleave drop', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-accent bg-accentsoft').addClass('border-line');
    });
    $dropzone.on('drop', function (e) {
      var dt = e.originalEvent.dataTransfer;
      var f = dt && dt.files && dt.files[0];
      if (f) handleFile(f);
    });
    $fileInput.on('change', function () {
      if ($fileInput[0].files[0]) handleFile($fileInput[0].files[0]);
      $fileInput.val('');
    });
    $docCard.find('#fileresize-doc-clear').on('click', function () {
      state.file = null;
      $docCard.css('display', 'none');
      $panel.css('display', 'none');
      setStatus('', 'neutral');
    });

    $btnRun.on('click', async function () {
      if (!state.file) return;
      var targetBytes = Math.round((parseFloat($sizeInput.val()) || 0) * (UNIT_BYTES[$unitSelect.val()] || 1));
      if (targetBytes <= 0) { setStatus('กรุณาระบุขนาดเป้าหมายที่มากกว่า 0', 'bad'); return; }
      if (targetBytes > MAX_BYTES) { setStatus('ขนาดไฟล์เกินขีดจำกัด 2 GB', 'bad'); return; }
      if (targetBytes === state.file.size) { setStatus('ขนาดเป้าหมายเท่ากับไฟล์เดิมอยู่แล้ว ไม่ต้องปรับ', 'neutral'); return; }

      setBusy(true);
      try {
        var file = state.file;
        var blob = targetBytes > file.size
          ? new Blob([file, new Uint8Array(targetBytes - file.size)], { type: file.type || 'application/octet-stream' })
          : file.slice(0, targetBytes, file.type || 'application/octet-stream');

        var dotIdx = file.name.lastIndexOf('.');
        var baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
        var ext = dotIdx > 0 ? file.name.slice(dotIdx) : '';
        var outFileName = baseName + '-resized' + ext;

        var res = await deliverFiles([{ name: outFileName, blob: blob }], baseName + '-resized');
        setStatus(res.status === 'saved' ? 'ปรับขนาดและบันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      } finally {
        setBusy(false);
      }
    });
  }

  // ---------- File encrypt ----------
  // PDF and ZIP are the only formats with a real, verified-working
  // browser-side encryption library (see CLAUDE.md) — both are lazy-loaded
  // via dynamic import() only when this view is used, same reasoning as
  // ffmpeg.wasm above. Word/Excel/PowerPoint/WinRAR are intentionally not
  // wired up here; the view's own copy explains why for each.
  var PDF_ENCRYPT_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib-plus-encrypt@1.1.0/dist/pdf-lib-plus-encrypt.esm.js';
  var ZIP_ENCRYPT_URL = 'https://cdn.jsdelivr.net/npm/@zip.js/zip.js@2.15.0/+esm';

  var pdfEncryptModPromise = null;
  // A separate module namespace from window.PDFLib (@cantoo/pdf-lib, used by
  // the convert/split/merge views) on purpose — this is an independent fork
  // (github.com/brennanmcquerry/pdf-lib-plus-encrypt) that happens to also
  // expose a global named `PDFLib` when loaded via <script src>, which would
  // silently clobber the app's existing one; importing it as an ES module
  // instead keeps its exports local to this closure only.
  function loadPdfEncryptModule() {
    if (!pdfEncryptModPromise) pdfEncryptModPromise = import(/* webpackIgnore: true */ PDF_ENCRYPT_URL);
    return pdfEncryptModPromise;
  }
  var zipEncryptModPromise = null;
  function loadZipEncryptModule() {
    if (!zipEncryptModPromise) zipEncryptModPromise = import(/* webpackIgnore: true */ ZIP_ENCRYPT_URL);
    return zipEncryptModPromise;
  }

  async function encryptPdfFile(file, password) {
    var mod = await loadPdfEncryptModule();
    var bytes = new Uint8Array(await file.arrayBuffer());
    var doc;
    try {
      doc = await mod.PDFDocument.load(bytes);
    } catch (err) {
      if (err && err.name === 'EncryptedPDFError') {
        throw new Error('ไฟล์นี้มีรหัสผ่านป้องกันอยู่แล้ว กรุณาปลดล็อกก่อน แล้วค่อยเข้ารหัสใหม่ด้วยรหัสผ่านนี้');
      }
      throw err;
    }
    await doc.encrypt({ userPassword: password, ownerPassword: password });
    var outBytes = await doc.save();
    return new Blob([outBytes], { type: 'application/pdf' });
  }

  async function encryptZipFile(file, password) {
    var mod = await loadZipEncryptModule();
    var reader = new mod.ZipReader(new mod.BlobReader(file));
    var entries;
    try {
      entries = await reader.getEntries();
    } catch (err) {
      await reader.close();
      throw new Error('ไม่สามารถอ่านไฟล์ ZIP นี้ได้ — ไฟล์อาจเสียหาย หรือมีรหัสผ่านป้องกันอยู่แล้ว');
    }
    var outWriter = new mod.BlobWriter('application/zip');
    // AES-256 (encryptionStrength 3) is the library's default whenever a
    // password is set and zipCrypto isn't forced on — left unset here on
    // purpose rather than pinned, so a future zip.js upgrade keeping its own
    // default stays in effect instead of silently going stale in this file.
    var writer = new mod.ZipWriter(outWriter, { password: password });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.directory) {
        await writer.add(entry.filename, null, { directory: true });
        continue;
      }
      var entryBlob = await entry.getData(new mod.BlobWriter());
      await writer.add(entry.filename, new mod.BlobReader(entryBlob), { password: password });
    }
    await reader.close();
    return await writer.close();
  }

  function initFileEncryptView() {
    var state = { file: null, kind: null };

    var $dropzone = $('#fileencrypt-dropzone');
    var $fileInput = $('#fileencrypt-file-input');
    var $uploadError = $('#fileencrypt-upload-error');
    var $docCard = $('#fileencrypt-doc-card');
    var $docIcon = $('#fileencrypt-doc-icon');
    var $docName = $('#fileencrypt-doc-name');
    var $docMeta = $('#fileencrypt-doc-meta');
    var $panel = $('#fileencrypt-panel');
    var $password = $('#fileencrypt-password');
    var $passwordConfirm = $('#fileencrypt-password-confirm');
    var $btnRun = $('#btn-fileencrypt-run');
    var $progress = $('#fileencrypt-progress');
    var $statusEl = $('#fileencrypt-status');

    function setStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }
    function setBusy(busy) {
      $btnRun.prop('disabled', busy);
      $btnRun.toggleClass('busy', busy);
      $btnRun.find('.spinner').toggleClass('hidden', !busy).toggleClass('inline-block', busy);
      $progress.toggleClass('hidden', !busy);
      if (!busy) $progress.find('.progress-fill').css('width', '100%');
    }
    function showUploadError(msg) { $uploadError.text(msg || ''); }

    function handleFile(file) {
      var isPdf = /\.pdf$/i.test(file.name);
      var isZip = /\.zip$/i.test(file.name);
      if (!isPdf && !isZip) {
        showUploadError('รองรับเฉพาะไฟล์ .pdf หรือ .zip เท่านั้น — ดูฟอร์แมตที่ยังไม่รองรับด้านล่าง');
        return;
      }
      showUploadError('');
      state.file = file;
      state.kind = isPdf ? 'pdf' : 'zip';
      $docIcon.attr('class', (isPdf ? 'bi bi-file-earmark-pdf' : 'bi bi-file-earmark-zip') + ' text-xl leading-none');
      $docName.text(file.name);
      $docMeta.text((isPdf ? 'PDF' : 'ZIP') + ' · ' + formatSize(file.size));
      $docCard.css('display', 'flex');
      $panel.css('display', 'block');
      $password.val('');
      $passwordConfirm.val('');
      setStatus('', 'neutral');
    }

    $dropzone.on('click', function () { $fileInput.trigger('click'); });
    $dropzone.on('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $fileInput.trigger('click'); }
    });
    $dropzone.on('dragenter dragover', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-line').addClass('border-accent bg-accentsoft');
    });
    $dropzone.on('dragleave drop', function (e) {
      e.preventDefault();
      $dropzone.removeClass('border-accent bg-accentsoft').addClass('border-line');
    });
    $dropzone.on('drop', function (e) {
      var dt = e.originalEvent.dataTransfer;
      var f = dt && dt.files && dt.files[0];
      if (f) handleFile(f);
    });
    $fileInput.on('change', function () {
      if ($fileInput[0].files[0]) handleFile($fileInput[0].files[0]);
      $fileInput.val('');
    });
    $docCard.find('#fileencrypt-doc-clear').on('click', function () {
      state.file = null;
      state.kind = null;
      $docCard.css('display', 'none');
      $panel.css('display', 'none');
      setStatus('', 'neutral');
    });

    $btnRun.on('click', async function () {
      if (!state.file) return;
      var pw = $password.val();
      if (!pw) { setStatus('กรุณาตั้งรหัสผ่าน', 'bad'); return; }
      if (pw !== $passwordConfirm.val()) { setStatus('รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'bad'); return; }

      setBusy(true);
      setStatus(state.kind === 'pdf' ? 'กำลังเข้ารหัส PDF…' : 'กำลังโหลดตัวเข้ารหัส ZIP (ครั้งแรกใช้เวลาสักครู่)…', 'neutral');
      try {
        var file = state.file;
        var blob = state.kind === 'pdf' ? await encryptPdfFile(file, pw) : await encryptZipFile(file, pw);
        var dotIdx = file.name.lastIndexOf('.');
        var baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
        var ext = dotIdx > 0 ? file.name.slice(dotIdx) : (state.kind === 'pdf' ? '.pdf' : '.zip');
        var outFileName = baseName + '-encrypted' + ext;

        var res = await deliverFiles([{ name: outFileName, blob: blob }], baseName + '-encrypted');
        setStatus(res.status === 'saved' ? 'เข้ารหัสและบันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        console.error(err);
        setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      } finally {
        setBusy(false);
      }
    });
  }
})(jQuery);
