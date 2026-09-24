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
  var $viewFileDecrypt = $(); // populated once views/file-decrypt.html is fetched and mounted
  var $viewOcr = $(); // populated once views/ocr.html is fetched and mounted
  var $viewTextCompare = $(); // populated once views/text-compare.html is fetched and mounted
  var $viewImageCompress = $(); // populated once views/image-compress.html is fetched and mounted
  var $viewHtmlPreview = $(); // populated once views/html-preview.html is fetched and mounted
  var $viewConvertCase = $(); // populated once views/convert-case.html is fetched and mounted
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
    $viewFileDecrypt.attr('hidden', true);
    $viewOcr.attr('hidden', true);
    $viewTextCompare.attr('hidden', true);
    $viewImageCompress.attr('hidden', true);
    $viewHtmlPreview.attr('hidden', true);
    $viewConvertCase.attr('hidden', true);
    // Side-by-side views need more width than the 640px tool column.
    $('.app').toggleClass('app-wide', $view.is($viewTextCompare) || $view.is($viewConvertCase))
      .toggleClass('app-full', $view.is($viewHtmlPreview));
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

  // Same fetch-and-mount pattern for the "file decrypt" view
  // (views/file-decrypt.html).
  var fileDecryptViewReady = $.get('views/file-decrypt.html').done(function (html) {
    $('#view-file-decrypt-mount').replaceWith(html);
    $viewFileDecrypt = $('#view-file-decrypt');
    $('#btn-file-decrypt-back').on('click', function () {
      $viewFileDecrypt.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initFileDecryptView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/file-decrypt.html ได้');
  });

  // Same fetch-and-mount pattern for the "OCR" view (views/ocr.html).
  var ocrViewReady = $.get('views/ocr.html').done(function (html) {
    $('#view-ocr-mount').replaceWith(html);
    $viewOcr = $('#view-ocr');
    $('#btn-ocr-back').on('click', function () {
      $viewOcr.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initOcrView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/ocr.html ได้');
  });

  // Same fetch-and-mount pattern for the "text compare" view
  // (views/text-compare.html).
  var textCompareViewReady = $.get('views/text-compare.html').done(function (html) {
    $('#view-text-compare-mount').replaceWith(html);
    $viewTextCompare = $('#view-text-compare');
    $('#btn-text-compare-back').on('click', function () {
      $viewTextCompare.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initTextCompareView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/text-compare.html ได้');
  });

  // Same fetch-and-mount pattern for the "image compress" view
  // (views/image-compress.html).
  var imageCompressViewReady = $.get('views/image-compress.html').done(function (html) {
    $('#view-image-compress-mount').replaceWith(html);
    $viewImageCompress = $('#view-image-compress');
    $('#btn-image-compress-back').on('click', function () {
      $viewImageCompress.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initImageCompressView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/image-compress.html ได้');
  });

  // Same fetch-and-mount pattern for the "HTML preview" view
  // (views/html-preview.html).
  var htmlPreviewViewReady = $.get('views/html-preview.html').done(function (html) {
    $('#view-html-preview-mount').replaceWith(html);
    $viewHtmlPreview = $('#view-html-preview');
    $('#btn-html-preview-back').on('click', function () {
      $viewHtmlPreview.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initHtmlPreviewView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/html-preview.html ได้');
  });

  // Same fetch-and-mount pattern for the "convert case" view
  // (views/convert-case.html).
  var convertCaseViewReady = $.get('views/convert-case.html').done(function (html) {
    $('#view-convert-case-mount').replaceWith(html);
    $viewConvertCase = $('#view-convert-case');
    $('#btn-convert-case-back').on('click', function () {
      $viewConvertCase.attr('hidden', true);
      $viewHome.removeAttr('hidden');
    });
    initConvertCaseView();
  }).fail(function () {
    console.error('ไม่สามารถโหลด views/convert-case.html ได้');
  });

  // ---------- Category tiles ----------
  // Each tool's home tile now carries only an icon + short bold label (no
  // description, no status tag) — disabled tools are still distinguished
  // visually (dimmed, non-interactive).
  var TOOLS = [
    { id: 'convert', label: 'แปลง PDF เป็นรูปภาพ', desc: 'แยกภาพจากไฟล์ PDF อย่างง่าย', enabled: true, img: 'assets/pdf-to-image.png', cats: ['pdf', 'image', 'convert'] },
    { id: 'split', label: 'แยกไฟล์ PDF', desc: 'แยกหน้า PDF เป็นหลายไฟล์', enabled: true, img: 'assets/split-pdf.png', cats: ['pdf'] },
    { id: 'merge', label: 'รวมไฟล์ PDF', desc: 'รวมหลายไฟล์เป็นไฟล์เดียว', enabled: true, img: 'assets/merge-pdf.png', cats: ['pdf'] },
    { id: 'convert-files', label: 'แปลงไฟล์', desc: 'แปลงไฟล์ได้หลากหลายรูปแบบ', enabled: true, img: 'assets/convert-file.png', cats: ['convert'] },
    { id: 'video-convert', label: 'แปลงวิดีโอ', desc: 'แปลงวิดีโอไปมาระหว่างฟอร์แมต', enabled: true, img: 'assets/convert-video.png', cats: ['convert'] },
    { id: 'text-gen', label: 'สร้างข้อความ', desc: 'สร้างและแก้ไขข้อความออนไลน์', enabled: true, img: 'assets/create-text.png', cats: ['text'] },
    { id: 'convert-case', label: 'แปลงตัวพิมพ์', desc: 'เปลี่ยนตัวพิมพ์เล็ก/ใหญ่ เช่น UPPER, Title Case', enabled: true, img: 'assets/convert-case.png', cats: ['text'] },
    { id: 'html-preview', label: 'พรีวิว HTML', desc: 'ดูผลลัพธ์ HTML ทันที พร้อมจัดรูปแบบโค้ด', enabled: true, img: 'assets/html-preview.png', cats: ['text'] },
    { id: 'text-compare', label: 'เปรียบเทียบข้อความ', desc: 'หาจุดที่ต่างกันระหว่างข้อความสองชุด', enabled: true, img: 'assets/compare-text.png', cats: ['text'] },
    { id: 'test-file', label: 'สร้างไฟล์ทดสอบ', desc: 'สร้างไฟล์ตัวอย่างสำหรับทดสอบ', enabled: true, img: 'assets/create-test.png', cats: ['file'] },
    { id: 'file-resize', label: 'ปรับขนาดไฟล์', desc: 'เพิ่มหรือลดขนาดไฟล์ตามที่กำหนด', enabled: true, img: 'assets/resize-file.png', cats: ['file'] },
    { id: 'file-encrypt', label: 'เข้ารหัสไฟล์', desc: 'ใส่รหัสผ่านป้องกันไฟล์', enabled: true, img: 'assets/protect-file.png', cats: ['security'] },
    { id: 'file-decrypt', label: 'ถอดรหัสไฟล์', desc: 'ปลดรหัสผ่านไฟล์ด้วยรหัสที่ถูกต้อง', enabled: true, img: 'assets/unlock-file.png', cats: ['security'] },
    { id: 'compress', label: 'บีบอัดรูปภาพ', desc: 'ลดขนาดไฟล์รูปภาพ แบบไม่เสียคุณภาพ', enabled: true, img: 'assets/compress-image.png', cats: ['image'] },
    { id: 'ocr', label: 'อ่านข้อความจากภาพ', desc: 'ดึงข้อความจากรูปภาพ (OCR)', enabled: true, img: 'assets/ocr.png', cats: ['image', 'text'] }
  ];
  // Home-page category filter; a tool can sit in more than one category.
  var TOOL_CATEGORIES = [
    { id: 'all', label: 'ทั้งหมด', icon: 'bi-grid' },
    { id: 'pdf', label: 'PDF', icon: 'bi-file-earmark-pdf' },
    { id: 'convert', label: 'แปลงไฟล์', icon: 'bi-arrow-repeat' },
    { id: 'image', label: 'รูปภาพ', icon: 'bi-image' },
    { id: 'text', label: 'ข้อความ', icon: 'bi-fonts' },
    { id: 'file', label: 'จัดการไฟล์', icon: 'bi-folder2' },
    { id: 'security', label: 'ความปลอดภัย', icon: 'bi-shield-lock' }
  ];
  var CATEGORY_STORAGE_KEY = 'toolbox.category';
  var activeCategory = 'all';
  try {
    var savedCategory = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (TOOL_CATEGORIES.some(function (c) { return c.id === savedCategory; })) activeCategory = savedCategory;
  } catch (e) { /* storage unavailable (private mode) */ }

  var $categoryGrid = $('#category-grid');
  var $toolSearch = $('#tool-search');

  function makeToolTile(tool) {
    var tag = tool.enabled ? 'button' : 'div';
    var $el = $('<' + tag + '>');
    // One shared lavender "glass" style (css/styles.css .tool-tile) so tiles follow the site tone.
    $el.addClass('flex items-center gap-3.5 rounded-2xl px-4 py-4 transition duration-150 text-left w-full')
      .addClass(tool.enabled ? 'tool-tile group' : 'tool-tile tool-tile-disabled');
    if (tool.enabled) {
      $el.attr('type', 'button');
      $el.addClass('cursor-pointer hover:-translate-y-0.5 active:translate-y-0');
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
    $text.append($title, $('<span>').addClass('block text-[12px] text-inksoft mt-0.5 leading-snug line-clamp-2').text(tool.desc));
    $el.append(
      $('<span>').addClass('flex h-11 w-11 flex-none items-center justify-center rounded-xl overflow-hidden bg-cardicon ring-1 ring-line shadow-sm')
        .append($('<img>').attr({ src: tool.img, alt: '' }).addClass('h-full w-full object-cover')),
      $text,
      $('<img>').attr({ src: 'assets/icons/icon-right-click.png', alt: '', 'aria-hidden': 'true' })
        .addClass('h-8 w-8 flex-none object-contain drop-shadow-sm transition-transform duration-150')
        .addClass(tool.enabled ? 'group-hover:translate-x-0.5' : 'grayscale opacity-50')
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
    } else if (tool.id === 'file-decrypt') {
      $el.on('click', function () {
        $.when(fileDecryptViewReady).done(function () { openView($viewFileDecrypt); });
      });
    } else if (tool.id === 'ocr') {
      $el.on('click', function () {
        $.when(ocrViewReady).done(function () { openView($viewOcr); });
      });
    } else if (tool.id === 'text-compare') {
      $el.on('click', function () {
        $.when(textCompareViewReady).done(function () { openView($viewTextCompare); });
      });
    } else if (tool.id === 'convert-case') {
      $el.on('click', function () {
        $.when(convertCaseViewReady).done(function () { openView($viewConvertCase); });
      });
    } else if (tool.id === 'html-preview') {
      $el.on('click', function () {
        $.when(htmlPreviewViewReady).done(function () { openView($viewHtmlPreview); });
      });
    } else if (tool.id === 'compress') {
      $el.on('click', function () {
        $.when(imageCompressViewReady).done(function () { openView($viewImageCompress); });
      });
    }
    return $el;
  }

  var $categoryFilter = $('#category-filter');

  function inCategory(tool, catId) {
    return catId === 'all' || tool.cats.indexOf(catId) !== -1;
  }
  function renderCategoryFilter() {
    $categoryFilter.empty();
    TOOL_CATEGORIES.forEach(function (cat) {
      var active = cat.id === activeCategory;
      var count = TOOLS.filter(function (t) { return inCategory(t, cat.id); }).length;
      var $chip = $('<button>').attr({ type: 'button', role: 'tab', 'aria-selected': active ? 'true' : 'false' })
        .addClass('inline-flex flex-none items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold whitespace-nowrap border transition-colors duration-150 cursor-pointer')
        .addClass(active ? 'bg-accent border-accent text-accentink' : 'bg-surface border-line text-inksoft hover:text-accentdeep hover:border-accent')
        .append(
          $('<i>').addClass('bi ' + cat.icon + ' text-[13px] leading-none'),
          $('<span>').text(cat.label),
          $('<span>').addClass('rounded-full px-1.5 text-[11px] leading-[18px] ' + (active ? 'bg-white/25' : 'bg-surface2')).text(count)
        );
      $chip.on('click', function () {
        activeCategory = cat.id;
        try { localStorage.setItem(CATEGORY_STORAGE_KEY, cat.id); } catch (e) { /* ignore */ }
        renderCategoryFilter();
        renderCategories();
      });
      $categoryFilter.append($chip);
    });
  }

  function renderCategories() {
    var query = $toolSearch.val().trim().toLowerCase();
    $categoryGrid.empty();
    var visible = TOOLS.filter(function (t) {
      return inCategory(t, activeCategory) && (!query || t.label.toLowerCase().indexOf(query) !== -1);
    });
    if (!visible.length) {
      $categoryGrid.append($('<p>').addClass('sm:col-span-2 text-sm text-inksoft text-center py-4')
        .text(query ? 'ไม่พบเครื่องมือที่ค้นหาในหมวดนี้' : 'ยังไม่มีเครื่องมือในหมวดนี้'));
      return;
    }
    visible.forEach(function (t) { $categoryGrid.append(makeToolTile(t)); });
  }

  $toolSearch.on('input', renderCategories);
  renderCategoryFilter();
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
      consolas: 'Consolas', symbol: 'Symbol', wingdings: 'Wingdings', wingdings2: 'Wingdings 2', wingdings3: 'Wingdings 3',
      webdings: 'Webdings',
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
      var state = { ctm: baseTransform.slice(), color: '000000', stroke: '000000', lineWidth: 1, dash: null, fillAlpha: 1, strokeAlpha: 1, hidden: false };
      var stack = [];
      var chars = [];
      var images = [];
      var paths = [];
      var pending = [];
      function pushState() {
        stack.push({
          ctm: state.ctm.slice(), color: state.color, stroke: state.stroke, lineWidth: state.lineWidth, dash: state.dash,
          fillAlpha: state.fillAlpha, strokeAlpha: state.strokeAlpha, hidden: state.hidden
        });
      }
      function paintPath(fill, stroke) {
        if (fill && state.fillAlpha <= 0) fill = false;
        if (stroke && state.strokeAlpha <= 0) stroke = false;
        if (pending.length && (fill || stroke) && paths.length < PDF_MAX_PATHS_PER_PAGE) {
          var scale = Math.sqrt(Math.abs(state.ctm[0] * state.ctm[3] - state.ctm[1] * state.ctm[2])) || 1;
          paths.push({
            cmds: pending, fill: fill ? state.color : null, stroke: stroke ? state.stroke : null,
            fillAlpha: state.fillAlpha, strokeAlpha: state.strokeAlpha,
            lineWidth: Math.max(0.25, state.lineWidth * scale),
            // Dash lengths relative to line width, the unit DrawingML custDash uses.
            dash: state.dash ? state.dash.map(function (d) { return d / (state.lineWidth || 1); }) : null
          });
        }
        pending = [];
      }
      for (var i = 0; i < opList.fnArray.length; i++) {
        var fn = opList.fnArray[i];
        var args = opList.argsArray[i] || [];
        if (fn === OPS.save) pushState();
        else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) { if (stack.length) state = stack.pop(); }
        else if (fn === OPS.paintFormXObjectBegin) { pushState(); if (args[0]) state.ctm = Util.transform(state.ctm, args[0]); }
        // Annotation appearances (e.g. highlight markups) are drawn in their own space: ctm x transform x matrix.
        else if (fn === OPS.beginAnnotation) {
          pushState();
          if (args[2]) state.ctm = Util.transform(state.ctm, args[2]);
          if (args[3]) state.ctm = Util.transform(state.ctm, args[3]);
        }
        else if (fn === OPS.endAnnotation) { if (stack.length) state = stack.pop(); }
        else if (fn === OPS.setGState) {
          (args[0] || []).forEach(function (entry) {
            if (entry[0] === 'ca') state.fillAlpha = clampNum(+entry[1], 0, 1);
            else if (entry[0] === 'CA') state.strokeAlpha = clampNum(+entry[1], 0, 1);
          });
        }
        else if (fn === OPS.transform) state.ctm = Util.transform(state.ctm, args);
        else if (fn === OPS.setFillRGBColor) state.color = pdfColorToHex(args);
        else if (fn === OPS.setStrokeRGBColor) state.stroke = pdfColorToHex(args);
        else if (fn === OPS.setLineWidth) state.lineWidth = args[0] || 0;
        else if (fn === OPS.setDash) {
          var dashArr = Array.prototype.slice.call(args[0] || []).filter(function (d) { return d >= 0; });
          state.dash = dashArr.length && dashArr.some(function (d) { return d > 0; }) ? dashArr : null;
        }
        else if (fn === OPS.constructPath) pending = pending.concat(pdfPathCommands(args[0] || [], args[1] || [], state.ctm));
        else if (fn === OPS.stroke || fn === OPS.closeStroke) paintPath(false, true);
        else if (fn === OPS.fill || fn === OPS.eoFill) paintPath(true, false);
        else if (fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) paintPath(true, true);
        else if (fn === OPS.endPath) pending = [];
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
      return { chars: chars, images: images, paths: paths };
    }

    // Caps shape count so PDFs with outlined text don't produce a docx Word chokes on.
    var PDF_MAX_PATHS_PER_PAGE = 4000;

    // Expands a pdf.js constructPath op into page-space commands (pt, top-left origin).
    function pdfPathCommands(ops, coords, ctm) {
      var OPS = pdfjsLib.OPS;
      var Util = pdfjsLib.Util;
      var out = [];
      var j = 0;
      var cur = [0, 0];
      function pt(x, y) { return Util.applyTransform([x, y], ctm); }
      for (var k = 0; k < ops.length; k++) {
        var op = ops[k];
        if (op === OPS.moveTo) {
          cur = [coords[j], coords[j + 1]]; j += 2;
          out.push({ t: 'M', p: [pt(cur[0], cur[1])] });
        } else if (op === OPS.lineTo) {
          cur = [coords[j], coords[j + 1]]; j += 2;
          out.push({ t: 'L', p: [pt(cur[0], cur[1])] });
        } else if (op === OPS.curveTo) {
          out.push({ t: 'C', p: [pt(coords[j], coords[j + 1]), pt(coords[j + 2], coords[j + 3]), pt(coords[j + 4], coords[j + 5])] });
          cur = [coords[j + 4], coords[j + 5]]; j += 6;
        } else if (op === OPS.curveTo2) {
          out.push({ t: 'C', p: [pt(cur[0], cur[1]), pt(coords[j], coords[j + 1]), pt(coords[j + 2], coords[j + 3])] });
          cur = [coords[j + 2], coords[j + 3]]; j += 4;
        } else if (op === OPS.curveTo3) {
          out.push({ t: 'C', p: [pt(coords[j], coords[j + 1]), pt(coords[j + 2], coords[j + 3]), pt(coords[j + 2], coords[j + 3])] });
          cur = [coords[j + 2], coords[j + 3]]; j += 4;
        } else if (op === OPS.closePath) {
          out.push({ t: 'Z', p: [] });
        } else if (op === OPS.rectangle) {
          var x = coords[j], y = coords[j + 1], w = coords[j + 2], h = coords[j + 3]; j += 4;
          out.push({ t: 'M', p: [pt(x, y)] }, { t: 'L', p: [pt(x + w, y)] }, { t: 'L', p: [pt(x + w, y + h)] },
            { t: 'L', p: [pt(x, y + h)] }, { t: 'Z', p: [] });
          cur = [x, y];
        }
      }
      return out;
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
      return /^\s*([•●○◦■□▪▫►▸➢✓✔*\-–—-]|\(?[0-9๐-๙]{1,3}[.)]|\(?[a-zA-Zก-ฮ][.)])\s/.test(text);
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
          // Gaps wider than half an em are layout (numbering, bullets, columns), not word spaces.
          if (gap > unit * 0.5) {
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
      // A line led by a symbol-font glyph is a bullet even when its code is a plain letter.
      return !pdfLineStartsListItem(line.text) && !PDF_SYMBOL_FONT_RE.test(line.items[0].font.family || '');
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
      return {
        width: viewport.width, height: viewport.height, lines: lines, paras: groupPdfParagraphs(lines),
        images: images, paths: walked.paths
      };
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

    var PDF_SYMBOL_FONT_RE = /^(Wingdings|Webdings|Symbol|Zapf ?Dingbats|Dingbats)/i;
    var PDF_DINGBATS_FONT_RE = /^(Zapf ?Dingbats|Dingbats)/i;
    // pdf.js reports symbol-font bullets as look-alike Unicode, which a text font draws smaller;
    // these map back to the symbol font's own code so w:sym draws the original glyph.
    var PDF_SYMBOL_UNICODE = {
      symbol: { '•': 0xF0B7 },
      wingdings: {
        '▪': 0xF0A7, '➢': 0xF0D8, '➤': 0xF0D8, '✓': 0xF0FC, '✔': 0xF0FC, '●': 0xF06C,
        '◆': 0xF075, '❖': 0xF076, '□': 0xF0A8, '☐': 0xF0A8, '■': 0xF06E, '◼': 0xF06E,
        '➔': 0xF0E8, '✗': 0xF0FB, '★': 0xF0AB, '○': 0xF0A1, '☑': 0xF0FE, '☒': 0xF0FD
      }
    };
    // Zapf Dingbats codes that Unicode placed outside the linear U+2701 + (code - 0x21) run.
    var ZAPF_DINGBATS_EXCEPTIONS = { 0x25: 0x260E, 0x2A: 0x261B, 0x2B: 0x261E, 0x48: 0x2605, 0x6C: 0x25CF, 0x6E: 0x25A0, 0x73: 0x25B2, 0x74: 0x25BC, 0x75: 0x25C6, 0x77: 0x25D7 };

    // Word has no Zapf Dingbats font, so its 8-bit codes become the matching Unicode dingbats.
    function zapfDingbatsToUnicode(text) {
      return Array.from(text).map(function (ch) {
        var code = ch.codePointAt(0);
        if (code < 0x21 || code > 0x7E) return ch;
        return String.fromCodePoint(ZAPF_DINGBATS_EXCEPTIONS[code] || 0x2701 + code - 0x21);
      }).join('');
    }

    // Symbol-font glyphs (bullets, checkboxes) arrive as PUA U+F0xx or raw 8-bit codes;
    // w:sym draws them with the symbol font, which plain text in Arial cannot.
    function pdfRunBodyXml(seg) {
      if (seg.tab) return '<w:tab/>';
      if (seg.br) return '<w:br/>';
      var family = seg.style.font.family || '';
      var text = seg.text;
      var symbolFont = PDF_SYMBOL_FONT_RE.test(family);
      if (PDF_DINGBATS_FONT_RE.test(family)) {
        text = zapfDingbatsToUnicode(text);
        symbolFont = false;
      }
      var out = '', buf = '';
      function flush() {
        if (buf) out += '<w:t xml:space="preserve">' + escapeXml(buf) + '</w:t>';
        buf = '';
      }
      Array.from(text).forEach(function (ch) {
        var code = ch.codePointAt(0);
        var sym = null;
        var lookAlike = symbolFont && PDF_SYMBOL_UNICODE[family.toLowerCase()];
        if (code >= 0xF020 && code <= 0xF0FF) sym = code;
        else if (lookAlike && lookAlike[ch]) sym = lookAlike[ch];
        else if (symbolFont && code > 0x20 && code <= 0xFF) sym = 0xF000 + code;
        if (sym === null) { buf += ch; return; }
        flush();
        var font = symbolFont ? family : (sym === 0xF0B7 ? 'Symbol' : 'Wingdings');
        out += '<w:sym w:font="' + escapeXml(font) + '" w:char="' + sym.toString(16).toUpperCase() + '"/>';
      });
      flush();
      return out;
    }

    // Splits text into spans the speller should skip or check. Skipped: Thai (no reliable
    // word boundaries from a PDF), capitalised words (names, product terms) and tokens with
    // digits/underscores (codes, versions). Lower-case English stays checked for real typos.
    function pdfProofChunks(text) {
      var parts = text.match(/[฀-๿]+|[A-Za-z0-9][A-Za-z0-9_.'’-]*|[^฀-๿A-Za-z0-9]+/g) || [];
      var out = [];
      parts.forEach(function (t) {
        var isWord = /[฀-๿A-Za-z0-9]/.test(t);
        var skip = /[฀-๿]/.test(t) || /^[A-Z]/.test(t) || /[\d_]/.test(t);
        var last = out[out.length - 1];
        // Spaces and punctuation ride along with the previous span to keep runs few.
        if (last && (!isWord || last.skip === skip)) last.text += t;
        else out.push({ text: t, skip: isWord && skip });
      });
      return out;
    }

    function pdfRunXml(seg) {
      var s = seg.style;
      var rPr = '';
      // Symbols carry their own font in w:sym; any real Unicode left in the run needs a normal font.
      if (s.font.family && !PDF_SYMBOL_FONT_RE.test(s.font.family)) {
        var f = escapeXml(s.font.family);
        rPr += '<w:rFonts w:ascii="' + f + '" w:hAnsi="' + f + '" w:eastAsia="' + f + '" w:cs="' + f + '"/>';
      }
      if (s.font.bold) rPr += '<w:b/><w:bCs/>';
      if (s.font.italic) rPr += '<w:i/><w:iCs/>';
      var colorSz = '';
      if (s.color && s.color !== '000000') colorSz += '<w:color w:val="' + s.color + '"/>';
      var hp = Math.max(2, Math.round(s.size * 2));
      colorSz += '<w:sz w:val="' + hp + '"/><w:szCs w:val="' + hp + '"/>';
      if (seg.tab || seg.br) return '<w:r><w:rPr>' + rPr + colorSz + '</w:rPr>' + pdfRunBodyXml(seg) + '</w:r>';
      return pdfProofChunks(seg.text).map(function (chunk) {
        var thai = THAI_CHAR_RE.test(chunk.text);
        return '<w:r><w:rPr>' + rPr + (chunk.skip ? '<w:noProof/>' : '') + colorSz + (thai ? '<w:lang w:bidi="th-TH"/>' : '') + '</w:rPr>' +
          pdfRunBodyXml({ text: chunk.text, style: s }) + '</w:r>';
      }).join('');
    }

    function pdfStyleKey(s) {
      return [s.font.family, s.font.bold, s.font.italic, s.color, Math.round(s.size * 2)].join('|');
    }

    function pdfParagraphRunsXml(para) {
      var segs = [];
      para.lines.forEach(function (line, idx) {
        // Keep the PDF's own line breaks; Word's wrapping never matches them exactly.
        if (idx > 0 && segs.length) segs.push({ br: true, style: segs[segs.length - 1].style });
        segs = segs.concat(line.segs);
      });
      var merged = [];
      segs.forEach(function (seg) {
        var last = merged[merged.length - 1];
        if (last && !last.tab && !seg.tab && !last.br && !seg.br && pdfStyleKey(last.style) === pdfStyleKey(seg.style)) last.text += seg.text;
        else merged.push({ tab: seg.tab, br: seg.br, text: seg.text, style: seg.style });
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

      var paragraphs = [];
      var cursor = m.top;
      pg.paras.forEach(function (para) {
        var lines = para.lines;
        var first = lines[0], last = lines[lines.length - 1];
        var pitch = lines.length > 1 ? (last.y - first.y) / (lines.length - 1) : first.size * ratio;
        lines.forEach(function (l) { pitch = Math.max(pitch, l.maxSize * 1.05); });
        var top = first.y - pitch * 0.8;
        var before = Math.max(0, top - cursor);
        // Track where Word actually ends the paragraph so a clamped overlap is absorbed by later gaps instead of drifting.
        cursor = Math.max(cursor, top) + pitch * lines.length;
        var align = detectPdfAlignment(para, area);
        var pPr = '';
        if (first.tabStops.length) {
          pPr += '<w:tabs>' + first.tabStops.map(function (x) {
            return '<w:tab w:val="left" w:pos="' + Math.max(0, ptToTwip(x - area.left)) + '"/>';
          }).join('') + '</w:tabs>';
        }
        pPr += '<w:spacing w:before="' + ptToTwip(before) + '" w:after="0" w:line="' + ptToTwip(pitch) + '" w:lineRule="exact"/>';
        if (align === 'left' || align === 'both') {
          var bodyX = lines.length > 1 ? lines[1].x : first.x;
          var indent = first.x - bodyX;
          var paraRight = Math.max.apply(null, lines.map(function (l) { return l.right; }));
          // Justified lines stretch to the paragraph's own right edge; left-aligned lines get slack
          // into the margin so a slightly wider substitute font does not add a wrap.
          var rightInd = align === 'both' ? Math.max(0, area.right - paraRight) : -Math.max(0, m.right - 7);
          pPr += '<w:ind w:left="' + Math.max(0, ptToTwip(bodyX - area.left)) + '" w:right="' + ptToTwip(rightInd) + '"' +
            (indent > 0.5 ? ' w:firstLine="' + ptToTwip(indent) + '"' : indent < -0.5 ? ' w:hanging="' + ptToTwip(-indent) + '"' : '') + '/>';
        }
        if (align !== 'left') pPr += '<w:jc w:val="' + align + '"/>';
        paragraphs.push({ pPr: pPr, runs: pdfParagraphRunsXml(para) });
      });

      // Images are page-anchored like the shapes, so borders drawn around them stay aligned.
      var pageArea = pg.width * pg.height;
      var behind = pg.paths.map(function (path) { return pdfShapeXml(path, ++ids.n, pageArea); }).join('') +
        pg.images.map(function (im) {
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
      return packPdfDocx(body + finalSectPr, media);
    }

    // Vector paths (lines, table borders, boxes) as page-anchored DrawingML
    // shapes behind the flowing text.
    function pdfShapeXml(path, id, pageArea) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      path.cmds.forEach(function (c) {
        c.p.forEach(function (q) {
          minX = Math.min(minX, q[0]); minY = Math.min(minY, q[1]);
          maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]);
        });
      });
      if (!isFinite(minX)) return '';
      var w = maxX - minX, h = maxY - minY;
      // Full-page white fills are page backgrounds Word already has.
      if (path.fill === 'FFFFFF' && !path.stroke && w * h >= pageArea * 0.9) return '';
      var cx = Math.max(1, ptToEmu(w)), cy = Math.max(1, ptToEmu(h));
      function p(q) { return '<a:pt x="' + ptToEmu(q[0] - minX) + '" y="' + ptToEmu(q[1] - minY) + '"/>'; }
      var d = path.cmds.map(function (c) {
        if (c.t === 'M') return '<a:moveTo>' + p(c.p[0]) + '</a:moveTo>';
        if (c.t === 'L') return '<a:lnTo>' + p(c.p[0]) + '</a:lnTo>';
        if (c.t === 'C') return '<a:cubicBezTo>' + p(c.p[0]) + p(c.p[1]) + p(c.p[2]) + '</a:cubicBezTo>';
        return '<a:close/>';
      }).join('');
      function clr(hex, alpha) {
        var a = alpha < 1 ? '<a:alpha val="' + Math.round(alpha * 100000) + '"/>' : '';
        return '<a:solidFill><a:srgbClr val="' + hex + '">' + a + '</a:srgbClr></a:solidFill>';
      }
      var fill = path.fill ? clr(path.fill, path.fillAlpha) : '<a:noFill/>';
      var dash = '';
      if (path.dash) {
        var arr = path.dash.length % 2 ? path.dash.concat(path.dash) : path.dash;
        dash = '<a:custDash>';
        for (var di = 0; di < arr.length; di += 2) {
          dash += '<a:ds d="' + Math.max(1, Math.round(arr[di] * 100000)) + '" sp="' + Math.max(1, Math.round(arr[di + 1] * 100000)) + '"/>';
        }
        dash += '</a:custDash>';
      }
      var ln = path.stroke ? '<a:ln w="' + ptToEmu(path.lineWidth) + '">' + clr(path.stroke, path.strokeAlpha) + dash + '</a:ln>' : '<a:ln><a:noFill/></a:ln>';
      return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="' + id +
        '" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
        '<wp:positionH relativeFrom="page"><wp:posOffset>' + ptToEmu(minX) + '</wp:posOffset></wp:positionH>' +
        '<wp:positionV relativeFrom="page"><wp:posOffset>' + ptToEmu(minY) + '</wp:posOffset></wp:positionV>' +
        '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
        '<wp:docPr id="' + id + '" name="Shape ' + id + '"/><wp:cNvGraphicFramePr/>' +
        '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
        '<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
        '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/>' +
        '<a:pathLst><a:path w="' + cx + '" h="' + cy + '"' + (path.fill ? '' : ' fill="none"') + (path.stroke ? '' : ' stroke="0"') + '>' +
        d + '</a:path></a:pathLst></a:custGeom>' + fill + ln +
        '</wps:spPr><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
    }


    function packPdfDocx(bodyXml, media) {
      var xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      var documentXml = xmlHead +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
        ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
        ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
        ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"' +
        ' xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
        '<w:body>' + bodyXml + '</w:body></w:document>';
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
        note: 'ข้อความเป็นย่อหน้าปกติพิมพ์ต่อได้เหมือน Word คงฟอนต์ ขนาด สี ระยะบรรทัด การจัดแนว และรูปภาพ พร้อมวาดเส้น ตาราง กรอบ และพื้นสีตามตำแหน่งเดิม — ถ้าเครื่องไม่มีฟอนต์ของ PDF หรือ Word ตัดบรรทัดต่างจากต้นฉบับ ข้อความอาจเลื่อนจากเส้นตารางเล็กน้อย',
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
        $fromSelect.val('pdf');
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

  var LOREM_IPSUM_TH_BASE = 'ข้อความนี้เป็นข้อความตัวอย่างสำหรับใช้ทดสอบการแสดงผลของตัวอักษรภาษาไทย ใช้สำหรับจัดวางหน้าเอกสาร ออกแบบเว็บไซต์ และตรวจสอบรูปแบบของฟอนต์ ก่อนที่จะนำเนื้อหาจริงมาใส่แทนที่ในภายหลัง การใช้ข้อความตัวอย่างช่วยให้ผู้ออกแบบมองเห็นภาพรวมของงานได้ชัดเจนขึ้น ทั้งเรื่องระยะห่างระหว่างบรรทัด ขนาดของตัวอักษร และความสมดุลของพื้นที่บนหน้ากระดาษ โดยไม่ต้องกังวลเกี่ยวกับความหมายของเนื้อหาที่ปรากฏอยู่ ';

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

  var THAI_CONSONANTS = 'กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ';
  var THAI_SPACING_VOWELS = 'ะาเแโใไ';
  var THAI_ABOVE_BELOW_VOWELS = 'ัิีึืุู';
  var THAI_TONE_MARKS = '่้๊๋';

  // Combining marks are attached only right after a consonant (vowel then tone) so clusters render validly; length stays exact.
  function randomThaiAwareString(length, pool) {
    var out = [];
    var remaining = length;
    while (remaining > 0) {
      var ch = pool.charAt(Math.floor(Math.random() * pool.length));
      out.push(ch);
      remaining--;
      if (THAI_CONSONANTS.indexOf(ch) === -1) continue;
      if (remaining > 0 && Math.random() < 0.3) {
        out.push(THAI_ABOVE_BELOW_VOWELS.charAt(Math.floor(Math.random() * THAI_ABOVE_BELOW_VOWELS.length)));
        remaining--;
      }
      if (remaining > 0 && Math.random() < 0.25) {
        out.push(THAI_TONE_MARKS.charAt(Math.floor(Math.random() * THAI_TONE_MARKS.length)));
        remaining--;
      }
    }
    return out.join('');
  }

  function initTextGenView() {
    var $length = $('#textgen-length');
    var $mode = $('#textgen-mode');
    var $randomOptions = $('#textgen-random-options');
    var $repeatOptions = $('#textgen-repeat-options');
    var $optUpper = $('#textgen-opt-upper');
    var $optLower = $('#textgen-opt-lower');
    var $optDigits = $('#textgen-opt-digits');
    var $optThai = $('#textgen-opt-thai');
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
      } else if (mode === 'lorem-th') {
        text = repeatToLength(LOREM_IPSUM_TH_BASE, length);
      } else if (mode === 'repeat') {
        var pattern = $repeatPattern.val();
        if (!pattern) { setStatus('กรุณาระบุข้อความที่ต้องการทำซ้ำ', 'bad'); return; }
        text = repeatToLength(pattern, length);
      } else if (mode === 'thai') {
        text = randomThaiAwareString(length, THAI_CONSONANTS + THAI_SPACING_VOWELS);
      } else {
        var pool = '';
        if ($optUpper.prop('checked')) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if ($optLower.prop('checked')) pool += 'abcdefghijklmnopqrstuvwxyz';
        if ($optDigits.prop('checked')) pool += '0123456789';
        var useThai = $optThai.prop('checked');
        if (useThai) pool += THAI_CONSONANTS + THAI_SPACING_VOWELS;
        if ($optSymbols.prop('checked')) pool += '!@#$%^&*()-_=+[]{};:,.<>?';
        if (!pool) pool = 'abcdefghijklmnopqrstuvwxyz';
        text = useThai ? randomThaiAwareString(length, pool) : randomStringOfLength(length, pool);
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
    svg: {
      prefix: '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' +
        '<defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#e2e5e9" stroke-width="1"/></pattern></defs>' +
        '<rect width="400" height="300" fill="#f4f5f7"/><rect width="400" height="300" fill="url(#grid)"/>' +
        '<rect x="1" y="1" width="398" height="298" fill="none" stroke="#aeb4bd" stroke-width="2"/>' +
        '<rect x="76" y="99" width="248" height="102" fill="#ffffff" stroke="#d1d5db" stroke-width="1"/>' +
        '<text x="200" y="135" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="bold" font-size="22" fill="#1f2937">TEST IMAGE</text>' +
        '<rect x="173" y="151" width="54" height="2" fill="#1d4ed8"/>' +
        '<text x="200" y="171" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#4b5563">SVG &#183; 400 &#215; 300 px</text><!-- ',
      suffix: ' --></svg>'
    },
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

  // Real raster image via canvas.toBlob: a neutral placeholder card (grid,
  // frame, title, format and dimensions) encoded small, then padded with
  // format-legal filler (PNG tEXt / JPEG COM / WebP JUNK chunks) up to the
  // requested size.
  function drawTestScene(ctx, w, h, label) {
    var s = Math.min(w, h);
    ctx.fillStyle = '#f4f5f7';
    ctx.fillRect(0, 0, w, h);
    var step = Math.max(8, Math.round(s / 12));
    ctx.strokeStyle = '#e2e5e9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = step; x < w; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    for (var y = step; y < h; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
    ctx.stroke();
    var border = Math.max(1, Math.round(s * 0.006));
    ctx.strokeStyle = '#aeb4bd';
    ctx.lineWidth = border;
    ctx.strokeRect(border / 2, border / 2, w - border, h - border);

    var cardW = w * 0.62;
    var cardH = s * 0.34;
    var cardX = (w - cardW) / 2;
    var cardY = (h - cardH) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = Math.max(1, Math.round(s * 0.003));
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    var cx = w / 2;
    var cy = h / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold ' + Math.max(8, Math.round(s * 0.075)) + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillText('TEST IMAGE', cx, cy - s * 0.05);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(cx - s * 0.09, cy + s * 0.005, s * 0.18, Math.max(1, Math.round(s * 0.008)));
    ctx.fillStyle = '#4b5563';
    ctx.font = Math.max(6, Math.round(s * 0.04)) + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillText((label ? label + '  \u00B7  ' : '') + w + ' \u00D7 ' + h + ' px', cx, cy + s * 0.07);
  }
  function buildSceneCanvas(width, height, label) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    drawTestScene(canvas.getContext('2d'), width, height, label);
    return canvas;
  }
  function canvasToBlobAsync(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('เข้ารหัสรูปภาพล้มเหลว')); }, mime, quality);
    });
  }

  var CRC32_TABLE = null;
  function crc32(bytes) {
    if (!CRC32_TABLE) {
      CRC32_TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC32_TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  var IMAGE_PAD_BLOCK = 1024 * 1024;
  function fillPadding(buf, start, end) {
    var src = 'test-file padding ';
    for (var i = start; i < end; i++) buf[i] = src.charCodeAt((i - start) % src.length);
  }
  // Splits `rem` bytes into segment sizes within [minTotal, maxTotal]; a
  // leftover smaller than minTotal is left unfilled.
  function splitPadding(rem, maxTotal, minTotal) {
    var sizes = [];
    while (rem >= minTotal) {
      var take = Math.min(maxTotal, rem);
      if (rem - take > 0 && rem - take < minTotal) take = rem - minTotal;
      sizes.push(take);
      rem -= take;
    }
    return sizes;
  }
  function pngTextChunk(total) {
    var chunk = new Uint8Array(total);
    var dv = new DataView(chunk.buffer);
    dv.setUint32(0, total - 12);
    writeAscii(chunk, 4, 'tEXt');
    writeAscii(chunk, 8, 'Comment'); // keyword + NUL separator at [15]
    fillPadding(chunk, 16, total - 4);
    dv.setUint32(total - 4, crc32(chunk.subarray(4, total - 4)));
    return chunk;
  }
  function jpegComSegment(total) {
    var seg = new Uint8Array(total);
    seg[0] = 0xFF; seg[1] = 0xFE;
    seg[2] = ((total - 2) >> 8) & 0xFF; seg[3] = (total - 2) & 0xFF;
    fillPadding(seg, 4, total);
    return seg;
  }
  function isAsciiAt(bytes, offset, str) {
    for (var i = 0; i < str.length; i++) if (bytes[offset + i] !== str.charCodeAt(i)) return false;
    return true;
  }
  async function padImageBlob(ext, blob, totalBytes) {
    var extra = totalBytes - blob.size;
    if (extra <= 0) return blob;
    var bytes = new Uint8Array(await blob.arrayBuffer());
    var cache = {};
    var parts = null;
    if (ext === 'png' && isAsciiAt(bytes, bytes.length - 8, 'IEND')) {
      var iend = bytes.length - 12;
      parts = [bytes.subarray(0, iend)];
      splitPadding(extra, IMAGE_PAD_BLOCK, 20).forEach(function (size) {
        parts.push(cache[size] || (cache[size] = pngTextChunk(size)));
      });
      parts.push(bytes.subarray(iend));
    } else if ((ext === 'jpg' || ext === 'jpeg') && bytes[0] === 0xFF && bytes[1] === 0xD8) {
      parts = [bytes.subarray(0, 2)];
      splitPadding(extra, 65537, 4).forEach(function (size) {
        parts.push(cache[size] || (cache[size] = jpegComSegment(size)));
      });
      parts.push(bytes.subarray(2));
    } else if (ext === 'webp' && isAsciiAt(bytes, 0, 'RIFF') && isAsciiAt(bytes, 8, 'WEBP') && extra >= 8) {
      // RIFF chunks stay even-aligned, so an odd request ends 1 byte short.
      var dataLen = (extra - 8) & ~1;
      var head = bytes.slice(0, 12);
      new DataView(head.buffer).setUint32(4, bytes.length - 8 + 8 + dataLen, true);
      var chunkHead = new Uint8Array(8);
      writeAscii(chunkHead, 0, 'JUNK');
      new DataView(chunkHead.buffer).setUint32(4, dataLen, true);
      parts = [head, bytes.subarray(12), chunkHead];
      var block = new Uint8Array(Math.min(IMAGE_PAD_BLOCK, dataLen));
      fillPadding(block, 0, block.length);
      for (var left = dataLen; left > 0; left -= block.length) {
        parts.push(left >= block.length ? block : block.subarray(0, left));
      }
    }
    return parts ? new Blob(parts, { type: blob.type }) : blob;
  }
  async function buildRealImageBlob(ext, totalBytes) {
    var mime = MIME_MAP[ext];
    var quality = (ext === 'jpg' || ext === 'jpeg') ? 0.92 : undefined;
    var width = 1200;
    var height = 900;
    var blob = await canvasToBlobAsync(buildSceneCanvas(width, height, ext.toUpperCase()), mime, quality);
    for (var i = 0; i < 10 && blob.size > totalBytes && width > 16; i++) {
      width = Math.max(16, Math.round(width * Math.sqrt(totalBytes / blob.size) * 0.9));
      height = Math.max(12, Math.round(width * 0.75));
      blob = await canvasToBlobAsync(buildSceneCanvas(width, height, ext.toUpperCase()), mime, quality);
    }
    return padImageBlob(ext, blob, totalBytes);
  }

  // Hand-rolled uncompressed 24bpp BMP of the same scene. Size is pure
  // arithmetic; any remainder becomes a gap before the pixel data
  // (bfOffBits), so the target is hit exactly.
  var BMP_MAX_SIDE = 4000; // keeps canvas within browser size limits
  function buildBmpBlob(totalBytes) {
    var HEADER_SIZE = 54;
    var available = Math.max(3, totalBytes - HEADER_SIZE);
    var width = Math.min(BMP_MAX_SIDE, Math.max(1, Math.round(Math.sqrt(available / 3 * 4 / 3))));
    var rowSize = Math.ceil(width * 3 / 4) * 4;
    var height = Math.max(1, Math.min(Math.floor(available / rowSize), Math.round(width * 0.75)));
    var pixelDataSize = rowSize * height;
    var gap = Math.max(0, totalBytes - HEADER_SIZE - pixelDataSize);
    var pixelOffset = HEADER_SIZE + gap;
    var fileSize = pixelOffset + pixelDataSize;
    var buf = new Uint8Array(fileSize);
    var dv = new DataView(buf.buffer);
    buf[0] = 0x42; buf[1] = 0x4D; // 'BM'
    dv.setUint32(2, fileSize, true);
    dv.setUint32(10, pixelOffset, true);
    dv.setUint32(14, 40, true);
    dv.setInt32(18, width, true);
    dv.setInt32(22, height, true);
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    dv.setUint32(34, pixelDataSize, true);
    dv.setInt32(38, 2835, true);
    dv.setInt32(42, 2835, true);
    var rgba = buildSceneCanvas(width, height, 'BMP').getContext('2d').getImageData(0, 0, width, height).data;
    for (var y = 0; y < height; y++) {
      var src = (height - 1 - y) * width * 4; // BMP rows are bottom-up
      var dst = pixelOffset + y * rowSize;
      for (var x = 0; x < width; x++, src += 4, dst += 3) {
        buf[dst] = rgba[src + 2];
        buf[dst + 1] = rgba[src + 1];
        buf[dst + 2] = rgba[src];
      }
    }
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

  function fileTimestamp(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
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
      baseName += '-' + fileTimestamp(new Date()); // avoid overwriting earlier downloads
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

  // ---------- File decrypt ----------
  // Reverse of the encrypt view above. The password is always verified
  // first (pdf.js / zip.js reject a wrong one) and no output is produced
  // unless it is correct.
  function wrongPasswordError() {
    var err = new Error('รหัสผ่านไม่ถูกต้อง');
    err.code = 'wrong_password';
    return err;
  }
  function isPdfPasswordError(err) {
    return !!err && err.name === 'PasswordException';
  }
  // pdf.js may detach the buffer it is given, so every call reads a fresh copy.
  async function openPdfWithPassword(file, password) {
    var opts = { data: new Uint8Array(await file.arrayBuffer()) };
    if (password !== undefined) opts.password = password;
    var task = pdfjsLib.getDocument(opts);
    try {
      await task.promise;
      return true;
    } catch (err) {
      if (isPdfPasswordError(err)) return false;
      throw err;
    } finally {
      task.destroy();
    }
  }
  async function isPdfLocked(file) {
    return !(await openPdfWithPassword(file));
  }
  async function decryptPdfFile(file, password) {
    if (!(await openPdfWithPassword(file, password))) throw wrongPasswordError();
    var src = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { password: password, ignoreEncryption: true });
    var out = await PDFLib.PDFDocument.create();
    var pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(function (p) { out.addPage(p); });
    return new Blob([await out.save()], { type: 'application/pdf' });
  }

  async function readZipEntries(mod, file) {
    var reader = new mod.ZipReader(new mod.BlobReader(file));
    try {
      return { reader: reader, entries: await reader.getEntries() };
    } catch (err) {
      await reader.close();
      throw new Error('ไม่สามารถอ่านไฟล์ ZIP นี้ได้ — ไฟล์อาจเสียหาย');
    }
  }
  async function isZipLocked(file) {
    var mod = await loadZipEncryptModule();
    var zr = await readZipEntries(mod, file);
    await zr.reader.close();
    return zr.entries.some(function (e) { return e.encrypted; });
  }
  async function readZipEntry(mod, entry, password) {
    try {
      return await entry.getData(new mod.BlobWriter(), { password: password, checkSignature: true });
    } catch (err) {
      var msg = err && err.message;
      if (msg === mod.ERR_INVALID_PASSWORD || msg === mod.ERR_INVALID_SIGNATURE || msg === mod.ERR_ENCRYPTED) throw wrongPasswordError();
      if (msg === mod.ERR_UNSUPPORTED_ENCRYPTION) throw new Error('ไม่รองรับรูปแบบการเข้ารหัสของไฟล์ ZIP นี้');
      throw err;
    }
  }
  async function decryptZipFile(file, password, onProgress) {
    var mod = await loadZipEncryptModule();
    var zr = await readZipEntries(mod, file);
    try {
      var entries = zr.entries;
      // Check the password on the smallest encrypted entry before rewriting.
      var locked = entries.filter(function (e) { return e.encrypted && !e.directory; });
      locked.sort(function (a, b) { return a.compressedSize - b.compressedSize; });
      if (locked.length) await readZipEntry(mod, locked[0], password);

      var writer = new mod.ZipWriter(new mod.BlobWriter('application/zip'));
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (onProgress) onProgress(i, entries.length);
        if (entry.directory) {
          await writer.add(entry.filename, null, { directory: true, lastModDate: entry.lastModDate });
          continue;
        }
        var data = await readZipEntry(mod, entry, entry.encrypted ? password : undefined);
        await writer.add(entry.filename, new mod.BlobReader(data), { lastModDate: entry.lastModDate });
      }
      return await writer.close();
    } finally {
      await zr.reader.close();
    }
  }

  function initFileDecryptView() {
    var state = { file: null, kind: null, token: 0 };

    var $dropzone = $('#filedecrypt-dropzone');
    var $fileInput = $('#filedecrypt-file-input');
    var $uploadError = $('#filedecrypt-upload-error');
    var $docCard = $('#filedecrypt-doc-card');
    var $docIcon = $('#filedecrypt-doc-icon');
    var $docName = $('#filedecrypt-doc-name');
    var $docMeta = $('#filedecrypt-doc-meta');
    var $panel = $('#filedecrypt-panel');
    var $password = $('#filedecrypt-password');
    var $btnRun = $('#btn-filedecrypt-run');
    var $progress = $('#filedecrypt-progress');
    var $statusEl = $('#filedecrypt-status');

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
      $progress.find('.progress-fill').css('width', busy ? '0%' : '100%');
    }
    function showUploadError(msg) { $uploadError.text(msg || ''); }
    function clearFile() {
      state.file = null;
      state.kind = null;
      state.token++;
      $docCard.css('display', 'none');
      $panel.css('display', 'none');
      $password.val('');
      setStatus('', 'neutral');
    }

    async function handleFile(file) {
      var isPdf = /\.pdf$/i.test(file.name);
      var isZip = /\.zip$/i.test(file.name);
      clearFile();
      if (!isPdf && !isZip) {
        showUploadError('รองรับเฉพาะไฟล์ .pdf หรือ .zip เท่านั้น');
        return;
      }
      showUploadError('');
      var token = state.token;
      var label = (isPdf ? 'PDF' : 'ZIP') + ' · ' + formatSize(file.size);
      $docIcon.attr('class', (isPdf ? 'bi bi-file-earmark-pdf' : 'bi bi-file-earmark-zip') + ' text-xl leading-none');
      $docName.text(file.name);
      $docMeta.text(label + ' · กำลังตรวจสอบ…');
      $docCard.css('display', 'flex');
      var locked;
      try {
        locked = isPdf ? await isPdfLocked(file) : await isZipLocked(file);
      } catch (err) {
        if (token !== state.token) return;
        console.error(err);
        $docMeta.text(label);
        showUploadError(isPdf ? 'ไม่สามารถอ่านไฟล์ PDF นี้ได้ — ไฟล์อาจเสียหาย' : (err && err.message) || 'ไม่สามารถอ่านไฟล์นี้ได้');
        return;
      }
      if (token !== state.token) return;
      if (!locked) {
        $docMeta.text(label + ' · ไม่มีรหัสผ่าน');
        showUploadError('ไฟล์นี้ไม่ได้ตั้งรหัสผ่านไว้ ไม่ต้องถอดรหัส');
        return;
      }
      state.file = file;
      state.kind = isPdf ? 'pdf' : 'zip';
      $docMeta.text(label + ' · มีรหัสผ่าน');
      $panel.css('display', 'block');
      $password.trigger('focus');
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
    $docCard.find('#filedecrypt-doc-clear').on('click', function () {
      clearFile();
      showUploadError('');
    });
    $password.on('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $btnRun.trigger('click'); }
    });

    $btnRun.on('click', async function () {
      if (!state.file || $btnRun.prop('disabled')) return;
      var pw = $password.val();
      if (!pw) { setStatus('กรุณากรอกรหัสผ่าน', 'bad'); return; }

      setBusy(true);
      setStatus(state.kind === 'pdf' ? 'กำลังตรวจสอบรหัสผ่าน…' : 'กำลังโหลดตัวถอดรหัส ZIP (ครั้งแรกใช้เวลาสักครู่)…', 'neutral');
      try {
        var file = state.file;
        var blob = state.kind === 'pdf'
          ? await decryptPdfFile(file, pw)
          : await decryptZipFile(file, pw, function (done, total) {
            $progress.find('.progress-fill').css('width', Math.round((done / total) * 100) + '%');
            setStatus('กำลังถอดรหัส ' + done + '/' + total + '…', 'neutral');
          });
        var dotIdx = file.name.lastIndexOf('.');
        var baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
        var ext = dotIdx > 0 ? file.name.slice(dotIdx) : (state.kind === 'pdf' ? '.pdf' : '.zip');
        var outFileName = baseName + '-decrypted' + ext;

        $password.val('');
        var res = await deliverFiles([{ name: outFileName, blob: blob }], baseName + '-decrypted');
        setStatus(res.status === 'saved' ? 'ถอดรหัสและบันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        if (err && err.code === 'wrong_password') {
          setStatus('รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่', 'bad');
          $password.val('').trigger('focus');
        } else {
          console.error(err);
          setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
        }
      } finally {
        setBusy(false);
      }
    });
  }

  // ---------- OCR (Tesseract.js) ----------
  // Lazy-loaded like ffmpeg.wasm above: the script, WASM core and language
  // data (~1-3 MB per language) are only fetched once this view is used.
  // Tesseract.js wraps its CDN worker in a blob: URL itself, so the
  // same-origin Worker restriction noted for pdf.worker does not apply.
  var TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
  var OCR_MAX_BYTES = 30 * 1024 * 1024;
  var OCR_MIN_SIDE = 2000; // screenshot-sized text reads best at ~2.5x
  var OCR_MAX_UPSCALE = 3;
  var OCR_MAX_SIDE = 4000;

  var tesseractPromise = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!tesseractPromise) {
      tesseractPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = TESSERACT_URL;
        s.onload = function () { window.Tesseract ? resolve(window.Tesseract) : reject(new Error('โหลดตัวอ่านข้อความไม่สำเร็จ')); };
        s.onerror = function () { tesseractPromise = null; reject(new Error('โหลดตัวอ่านข้อความไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต')); };
        document.head.appendChild(s);
      });
    }
    return tesseractPromise;
  }

  // Thai first: with English first, Tesseract splits Thai words into single letters.
  var OCR_LANGS = ['tha', 'eng'];
  var ocrWorker = null;
  var ocrProgressHandler = null;
  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    var T = await loadTesseract();
    ocrWorker = await T.createWorker(OCR_LANGS, 1, {
      logger: function (m) { if (ocrProgressHandler) ocrProgressHandler(m); }
    });
    return ocrWorker;
  }

  async function prepareOcrImage(file) {
    var bmp = await createImageBitmap(file);
    var w = bmp.width;
    var h = bmp.height;
    var longSide = Math.max(w, h);
    var scale = 1;
    if (longSide < OCR_MIN_SIDE) scale = Math.min(OCR_MAX_UPSCALE, OCR_MIN_SIDE / longSide);
    else if (longSide > OCR_MAX_SIDE) scale = OCR_MAX_SIDE / longSide;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // flatten transparency, otherwise it reads as black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    toOcrGrayscale(ctx, canvas.width, canvas.height);
    return canvas;
  }

  // Grayscale, inverted when the image is mostly dark (dark-mode screenshots):
  // Tesseract is trained on dark text over a light background.
  function toOcrGrayscale(ctx, w, h) {
    var img = ctx.getImageData(0, 0, w, h);
    var a = img.data;
    var total = 0;
    for (var i = 0; i < a.length; i += 4) {
      var l = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
      a[i] = l;
      total += l;
    }
    var invert = total / (a.length / 4) < 110;
    for (var j = 0; j < a.length; j += 4) {
      var v = invert ? 255 - a[j] : a[j];
      a[j] = v; a[j + 1] = v; a[j + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }

  // Line-leading bullets (•, ▪, ●) are usually read as the Thai digit ๑ or ๐;
  // only rewritten when several lines share it, so a real "๑ มกราคม" stays.
  var OCR_BULLET_RE = /^[ \t]*[๑๐●▪][ \t]+(?=\S)/gm;
  function cleanOcrText(text) {
    var bullets = text.match(OCR_BULLET_RE);
    if (bullets && bullets.length >= 2) text = text.replace(OCR_BULLET_RE, '• ');
    return fixOcrLatinLookalikes(text)
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  // Latin c / e inside letter-digit runs (hashes, IDs, codes) are often read
  // as ¢ / €; real prices like "50¢" or "€100" have no letter/digit on both sides.
  function fixOcrLatinLookalikes(text) {
    return text
      .replace(/c¢|¢c/g, 'c') // the same glyph read twice
      .replace(/(?<=[0-9A-Za-z])¢(?=[0-9A-Za-z])|¢(?=[A-Za-z])/g, 'c')
      .replace(/(?<=[0-9A-Za-z])€(?=[0-9A-Za-z])|€(?=[A-Za-z])/g, 'e');
  }

  var OCR_STAGE_LABELS = {
    'loading tesseract core': 'กำลังโหลดตัวอ่านข้อความ',
    'initializing tesseract': 'กำลังเตรียมตัวอ่านข้อความ',
    'loading language traineddata': 'กำลังโหลดข้อมูลภาษา',
    'initializing api': 'กำลังเตรียมข้อมูลภาษา',
    'recognizing text': 'กำลังอ่านข้อความ'
  };

  function initOcrView() {
    var state = { file: null, thumbUrl: null };

    var $dropzone = $('#ocr-dropzone');
    var $fileInput = $('#ocr-file-input');
    var $uploadError = $('#ocr-upload-error');
    var $docCard = $('#ocr-doc-card');
    var $docThumb = $('#ocr-doc-thumb');
    var $docName = $('#ocr-doc-name');
    var $docMeta = $('#ocr-doc-meta');
    var $panel = $('#ocr-panel');
    var $btnRun = $('#btn-ocr-run');
    var $progress = $('#ocr-progress');
    var $statusEl = $('#ocr-status');
    var $output = $('#ocr-output');
    var $outputCount = $('#ocr-output-count');

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
      $progress.find('.progress-fill').css('width', '0%');
    }
    function updateCount() {
      $outputCount.text($output.val().length.toLocaleString() + ' ตัวอักษร');
    }
    function showUploadError(msg) {
      // The dropzone (and its error line) is hidden while an image is loaded.
      if (msg && state.file) setStatus(msg, 'bad');
      else $uploadError.text(msg || '');
    }
    function clearFile() {
      if (state.thumbUrl) URL.revokeObjectURL(state.thumbUrl);
      state.file = null;
      state.thumbUrl = null;
      $docThumb.removeAttr('src');
      $docCard.css('display', 'none');
      $panel.css('display', 'none');
      $dropzone.css('display', '');
      $output.val('');
      updateCount();
      setStatus('', 'neutral');
    }

    function handleFile(file) {
      var okType = /^image\/(jpeg|png|webp|bmp|gif)$/i.test(file.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name || '');
      if (!okType) { showUploadError('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG, WEBP, BMP หรือ GIF'); return; }
      if (file.size > OCR_MAX_BYTES) { showUploadError('ไฟล์ใหญ่เกิน 30 MB'); return; }
      showUploadError('');
      clearFile();
      state.file = file;
      state.thumbUrl = URL.createObjectURL(file);
      $docThumb.attr('src', state.thumbUrl);
      $docName.text(file.name || 'รูปที่วาง');
      $docMeta.text(formatSize(file.size));
      $dropzone.css('display', 'none');
      $docCard.css('display', 'block');
      $panel.css('display', 'block');
      var img = new Image();
      img.onload = function () {
        if (state.file === file) $docMeta.text(img.naturalWidth + ' × ' + img.naturalHeight + ' px · ' + formatSize(file.size));
      };
      img.src = state.thumbUrl;
    }

    $dropzone.on('click', function () { $fileInput.trigger('click'); });
    $dropzone.on('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $fileInput.trigger('click'); }
    });
    // Both the dropzone and the loaded-image card accept a dropped file.
    $dropzone.add($docCard).on('dragenter dragover', function (e) {
      e.preventDefault();
      $(this).removeClass('border-line').addClass('border-accent bg-accentsoft');
    });
    $dropzone.add($docCard).on('dragleave drop', function (e) {
      e.preventDefault();
      $(this).removeClass('border-accent bg-accentsoft').addClass('border-line');
    });
    $dropzone.add($docCard).on('drop', function (e) {
      if ($btnRun.prop('disabled')) return;
      var dt = e.originalEvent.dataTransfer;
      var f = dt && dt.files && dt.files[0];
      if (f) handleFile(f);
    });
    $fileInput.on('change', function () {
      if ($fileInput[0].files[0]) handleFile($fileInput[0].files[0]);
      $fileInput.val('');
    });
    $('#ocr-doc-replace').on('click', function () {
      if (!$btnRun.prop('disabled')) $fileInput.trigger('click');
    });
    // Paste an image from the clipboard while this view is open.
    $(document).on('paste', function (e) {
      if ($viewOcr.attr('hidden') !== undefined || $btnRun.prop('disabled')) return;
      var items = (e.originalEvent.clipboardData && e.originalEvent.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
          var blob = items[i].getAsFile();
          if (!blob) continue;
          e.preventDefault();
          var ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          handleFile(new File([blob], 'pasted-image-' + fileTimestamp(new Date()) + '.' + ext, { type: blob.type }));
          return;
        }
      }
    });
    $('#ocr-doc-clear').on('click', function () {
      clearFile();
      showUploadError('');
    });
    $output.on('input', updateCount);

    $btnRun.on('click', async function () {
      if (!state.file) return;
      setBusy(true);
      setStatus('กำลังโหลดตัวอ่านข้อความ (ครั้งแรกใช้เวลาสักครู่)…', 'neutral');
      ocrProgressHandler = function (m) {
        var label = OCR_STAGE_LABELS[m.status];
        if (!label) return;
        var pct = Math.round((m.progress || 0) * 100);
        $progress.find('.progress-fill').css('width', (m.status === 'recognizing text' ? pct : 0) + '%');
        setStatus(label + (m.status === 'recognizing text' ? ' ' + pct + '%' : '…'), 'neutral');
      };
      try {
        var worker = await getOcrWorker();
        var canvas = await prepareOcrImage(state.file);
        var result = await worker.recognize(canvas);
        var text = cleanOcrText(result.data.text || '');
        $output.val(text);
        updateCount();
        if (!text) setStatus('ไม่พบข้อความในภาพ', 'bad');
        else setStatus('อ่านข้อความเสร็จแล้ว (ความมั่นใจ ' + Math.round(result.data.confidence || 0) + '%)', 'good');
      } catch (err) {
        console.error(err);
        if (ocrWorker) { ocrWorker.terminate(); ocrWorker = null; }
        setStatus((err && err.message) || 'อ่านข้อความไม่สำเร็จ', 'bad');
      } finally {
        ocrProgressHandler = null;
        setBusy(false);
      }
    });

    $('#btn-ocr-copy').on('click', async function () {
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

    $('#btn-ocr-download').on('click', async function () {
      var text = $output.val();
      if (!text || !state.file) return;
      var name = state.file.name || 'image';
      var dotIdx = name.lastIndexOf('.');
      var baseName = (dotIdx > 0 ? name.slice(0, dotIdx) : name) + '-ocr';
      try {
        var res = await deliverFiles([{ name: baseName + '.txt', blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }], baseName);
        setStatus(res.status === 'saved' ? 'บันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      }
    });
  }

  // ---------- Image compress (lossless) ----------
  // Output pixels are identical to the input. Nothing goes through canvas
  // (lossy for JPEG/WebP, and premultiplied alpha / color management can
  // change PNG pixels). Savings come from:
  //   - dropping metadata (EXIF, XMP, text, thumbnails, trailing data),
  //   - re-packing PNG pixels (smaller color type/bit depth, per-row filters).
  var COMPRESS_MAX_BYTES = 50 * 1024 * 1024;
  var COMPRESS_MAX_FILES = 30;
  var COMPRESS_MAX_PIXELS = 36 * 1000 * 1000; // RGBA buffer ~144 MB
  var COMPRESS_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

  function readU32BE(b, i) { return b[i] * 16777216 + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; }
  function writeU32BE(b, i, v) { b[i] = v >>> 24; b[i + 1] = (v >>> 16) & 255; b[i + 2] = (v >>> 8) & 255; b[i + 3] = v & 255; }
  function readU32LE(b, i) { return b[i] + (b[i + 1] << 8) + (b[i + 2] << 16) + b[i + 3] * 16777216; }
  function writeU32LE(b, i, v) { b[i] = v & 255; b[i + 1] = (v >>> 8) & 255; b[i + 2] = (v >>> 16) & 255; b[i + 3] = v >>> 24; }
  function concatBytes(parts) {
    var total = 0;
    for (var i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total);
    var pos = 0;
    for (var j = 0; j < parts.length; j++) { out.set(parts[j], pos); pos += parts[j].length; }
    return out;
  }
  function bytesStartWith(b, pos, str) {
    if (pos + str.length > b.length) return false;
    for (var i = 0; i < str.length; i++) if (b[pos + i] !== str.charCodeAt(i)) return false;
    return true;
  }
  function sniffImageKind(b) {
    if (b.length >= 8 && b[0] === 0x89 && bytesStartWith(b, 1, 'PNG\r\n\x1a\n')) return 'png';
    if (b.length >= 4 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
    if (b.length >= 12 && bytesStartWith(b, 0, 'RIFF') && bytesStartWith(b, 8, 'WEBP')) return 'webp';
    return null;
  }

  // EXIF orientation from a TIFF block (bytes start at "II"/"MM"); 0 if absent.
  function readTiffOrientation(b, start, end) {
    if (start + 8 > end) return 0;
    var le;
    if (b[start] === 0x49 && b[start + 1] === 0x49) le = true;
    else if (b[start] === 0x4D && b[start + 1] === 0x4D) le = false;
    else return 0;
    function u16(i) { return le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]; }
    function u32(i) { return le ? readU32LE(b, i) : readU32BE(b, i); }
    var ifd = start + u32(start + 4);
    if (ifd + 2 > end) return 0;
    var count = u16(ifd);
    for (var k = 0; k < count; k++) {
      var e = ifd + 2 + k * 12;
      if (e + 12 > end) return 0;
      if (u16(e) === 0x0112) return u16(e + 8);
    }
    return 0;
  }
  function exifOrientation(b, start, end) {
    if (bytesStartWith(b, start, 'Exif\0\0')) start += 6;
    return readTiffOrientation(b, start, end);
  }

  // ----- JPEG: keep coding segments + JFIF/ICC/Adobe, drop the rest -----
  function jpegOrientationSegment(orientation) {
    // APP1 "Exif" with a single big-endian IFD0 entry: Orientation (SHORT).
    var seg = new Uint8Array(36);
    seg.set([0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01,
      0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation & 255, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00]);
    return seg;
  }
  function optimizeJpeg(b) {
    var head = [b.subarray(0, 2)];
    var body = [];
    var orientation = 0;
    var pos = 2;
    var sawEoi = false;
    while (pos + 2 <= b.length) {
      if (b[pos] !== 0xFF) return null;
      var marker = b[pos + 1];
      if (marker === 0xFF) { pos++; continue; } // fill byte
      if (marker === 0xD9) { body.push(b.subarray(pos, pos + 2)); sawEoi = true; break; }
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { body.push(b.subarray(pos, pos + 2)); pos += 2; continue; }
      if (pos + 4 > b.length) return null;
      var len = (b[pos + 2] << 8) | b[pos + 3];
      var segEnd = pos + 2 + len;
      if (len < 2 || segEnd > b.length) return null;
      var dataStart = pos + 4;
      if (marker === 0xDA) {
        // Entropy-coded data runs until the next real marker.
        var i = segEnd;
        while (i < b.length) {
          if (b[i] !== 0xFF) { i++; continue; }
          var n = b[i + 1];
          if (n === 0x00 || (n >= 0xD0 && n <= 0xD7)) { i += 2; continue; }
          if (n === 0xFF) { i++; continue; }
          break;
        }
        body.push(b.subarray(pos, i));
        pos = i;
        continue;
      }
      var keep;
      if (marker === 0xE0) keep = bytesStartWith(b, dataStart, 'JFIF\0');
      else if (marker === 0xE1) {
        keep = false;
        if (bytesStartWith(b, dataStart, 'Exif\0\0')) orientation = exifOrientation(b, dataStart, segEnd) || orientation;
      } else if (marker === 0xE2) keep = bytesStartWith(b, dataStart, 'ICC_PROFILE\0');
      else if (marker === 0xEE) keep = bytesStartWith(b, dataStart, 'Adobe');
      else if ((marker >= 0xE3 && marker <= 0xEF) || marker === 0xFE) keep = false;
      else keep = true;
      if (keep) {
        // JFIF must stay first; everything else keeps its original order.
        if (marker === 0xE0 && !body.length) head.push(b.subarray(pos, segEnd));
        else body.push(b.subarray(pos, segEnd));
      }
      pos = segEnd;
    }
    if (!sawEoi) return null; // truncated or unknown layout: leave untouched
    // Rotation only lives in EXIF; keep it so the image still displays upright.
    if (orientation > 1 && orientation <= 8) head.push(jpegOrientationSegment(orientation));
    return concatBytes(head.concat(body));
  }

  // ----- WebP: drop EXIF/XMP chunks and clear their VP8X flags -----
  function optimizeWebp(b) {
    var riffEnd = Math.min(b.length, 8 + readU32LE(b, 4));
    var parts = [];
    var pos = 12;
    var vp8x = null;
    var changed = false;
    while (pos + 8 <= riffEnd) {
      var size = readU32LE(b, pos + 4);
      var end = pos + 8 + size + (size & 1);
      if (pos + 8 + size > riffEnd) return null;
      end = Math.min(end, riffEnd);
      var type = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
      var drop = false;
      if (type === 'XMP ') drop = true;
      else if (type === 'EXIF') {
        var o = exifOrientation(b, pos + 8, pos + 8 + size);
        drop = !(o > 1 && o <= 8);
      }
      if (drop) changed = true;
      else {
        var chunk = b.slice(pos, end);
        if (type === 'VP8X' && size >= 10) vp8x = chunk;
        parts.push(chunk);
      }
      pos = end;
    }
    if (!changed && riffEnd === b.length) return null;
    if (vp8x) {
      var hasExif = parts.some(function (c) { return bytesStartWith(c, 0, 'EXIF'); });
      vp8x[8] &= ~0x04; // XMP
      if (!hasExif) vp8x[8] &= ~0x08;
    }
    var header = new Uint8Array(12);
    header.set(b.subarray(0, 12));
    var out = concatBytes([header].concat(parts));
    writeU32LE(out, 4, out.length - 8);
    return out;
  }

  // ----- PNG -----
  var PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  // Ancillary chunks that affect how pixels are shown (color, gamma, DPI, animation).
  var PNG_KEEP = { gAMA: 1, cHRM: 1, sRGB: 1, iCCP: 1, cICP: 1, mDCv: 1, cLLI: 1, sBIT: 1, pHYs: 1, tRNS: 1, acTL: 1, fcTL: 1, fdAT: 1 };

  function parsePngChunks(b) {
    var chunks = [];
    var pos = 8;
    while (pos + 12 <= b.length) {
      var len = readU32BE(b, pos);
      if (pos + 12 + len > b.length) return null;
      var type = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
      chunks.push({ type: type, data: b.subarray(pos + 8, pos + 8 + len), raw: b.subarray(pos, pos + 12 + len) });
      pos += 12 + len;
      if (type === 'IEND') break;
    }
    if (!chunks.length || chunks[0].type !== 'IHDR' || chunks[0].data.length !== 13) return null;
    if (chunks[chunks.length - 1].type !== 'IEND') return null;
    return chunks;
  }
  function pngChunk(type, data) {
    var out = new Uint8Array(12 + data.length);
    writeU32BE(out, 0, data.length);
    for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    writeU32BE(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }
  function isCriticalChunk(type) { return type.charCodeAt(0) < 97; }
  function keepPngChunk(c) {
    if (isCriticalChunk(c.type) || PNG_KEEP[c.type]) return true;
    if (c.type === 'eXIf') {
      var o = readTiffOrientation(c.data, 0, c.data.length);
      return o > 1 && o <= 8;
    }
    return false;
  }

  async function streamThrough(bytes, transform) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
  }
  // Inflate with a hard output cap, so a hostile IDAT can't balloon memory.
  async function inflateZlibLimited(bytes, maxOut) {
    var reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    var out = new Uint8Array(maxOut);
    var n = 0;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      if (n + r.value.length > maxOut) { await reader.cancel(); throw new Error('png_data_too_large'); }
      out.set(r.value, n);
      n += r.value.length;
    }
    return n === maxOut ? out : out.subarray(0, n);
  }

  var PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  function pngLayout(w, depth, ct) {
    var bits = PNG_CHANNELS[ct] * depth;
    return { rowBytes: Math.ceil(w * bits / 8), bpp: Math.max(1, bits >> 3) };
  }
  function pngDecodeInfo(ihdr) {
    return { w: readU32BE(ihdr, 0), h: readU32BE(ihdr, 4), depth: ihdr[8], ct: ihdr[9], interlace: ihdr[12] };
  }
  function paeth(a, b, c) {
    var p = a + b - c;
    var pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  }
  function pngUnfilter(raw, h, rowBytes, bpp) {
    var px = new Uint8Array(h * rowBytes);
    for (var y = 0; y < h; y++) {
      var f = raw[y * (rowBytes + 1)];
      var src = y * (rowBytes + 1) + 1;
      var dst = y * rowBytes;
      var up = dst - rowBytes;
      for (var i = 0; i < rowBytes; i++) {
        var a = i >= bpp ? px[dst + i - bpp] : 0;
        var b = y > 0 ? px[up + i] : 0;
        var x = raw[src + i];
        if (f === 0) px[dst + i] = x;
        else if (f === 1) px[dst + i] = (x + a) & 255;
        else if (f === 2) px[dst + i] = (x + b) & 255;
        else if (f === 3) px[dst + i] = (x + ((a + b) >> 1)) & 255;
        else if (f === 4) px[dst + i] = (x + paeth(a, b, (i >= bpp && y > 0) ? px[up + i - bpp] : 0)) & 255;
        else throw new Error('png_bad_filter');
      }
    }
    return px;
  }
  // Unpacks 8-bit-or-less PNG scanlines into RGBA8 (a Uint32Array view).
  function pngToRgba(info, raw, plte, trns) {
    var w = info.w, h = info.h, depth = info.depth, ct = info.ct;
    var lay = pngLayout(w, depth, ct);
    if (raw.length !== h * (lay.rowBytes + 1)) throw new Error('png_bad_size');
    var px = pngUnfilter(raw, h, lay.rowBytes, lay.bpp);
    var rgba = new Uint8Array(w * h * 4);
    var maxv = (1 << depth) - 1;
    var scale = 255 / maxv;
    var tGray = -1, tR = -1, tG = -1, tB = -1;
    if (trns && ct === 0 && trns.length >= 2) tGray = (trns[0] << 8) | trns[1];
    if (trns && ct === 2 && trns.length >= 6) { tR = (trns[0] << 8) | trns[1]; tG = (trns[2] << 8) | trns[3]; tB = (trns[4] << 8) | trns[5]; }
    var palCount = plte ? Math.floor(plte.length / 3) : 0;
    var o = 0;
    for (var y = 0; y < h; y++) {
      var row = y * lay.rowBytes;
      for (var x = 0; x < w; x++, o += 4) {
        var r, g, b, a = 255;
        if (depth < 8) {
          var bit = x * depth;
          var s = (px[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & maxv;
          if (ct === 3) {
            if (s >= palCount) throw new Error('png_bad_index');
            r = plte[s * 3]; g = plte[s * 3 + 1]; b = plte[s * 3 + 2];
            if (trns && s < trns.length) a = trns[s];
          } else {
            r = g = b = s * scale;
            if (s === tGray) a = 0;
          }
        } else {
          var p = row + x * PNG_CHANNELS[ct];
          if (ct === 0) { r = g = b = px[p]; if (px[p] === tGray) a = 0; }
          else if (ct === 2) { r = px[p]; g = px[p + 1]; b = px[p + 2]; if (r === tR && g === tG && b === tB) a = 0; }
          else if (ct === 3) {
            var idx = px[p];
            if (idx >= palCount) throw new Error('png_bad_index');
            r = plte[idx * 3]; g = plte[idx * 3 + 1]; b = plte[idx * 3 + 2];
            if (trns && idx < trns.length) a = trns[idx];
          }
          else if (ct === 4) { r = g = b = px[p]; a = px[p + 1]; }
          else { r = px[p]; g = px[p + 1]; b = px[p + 2]; a = px[p + 3]; }
        }
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
      }
    }
    return new Uint32Array(rgba.buffer);
  }

  // Per-row filter choice by minimum sum of absolute differences (libpng heuristic).
  function pngFilterRows(lines, h, rowBytes, bpp, adaptive) {
    var out = new Uint8Array(h * (rowBytes + 1));
    var tmp = [null, new Uint8Array(rowBytes), new Uint8Array(rowBytes), new Uint8Array(rowBytes), new Uint8Array(rowBytes)];
    for (var y = 0; y < h; y++) {
      var cur = y * rowBytes;
      var o = y * (rowBytes + 1);
      if (!adaptive) { out.set(lines.subarray(cur, cur + rowBytes), o + 1); continue; }
      var up = cur - rowBytes;
      var sums = [0, 0, 0, 0, 0];
      for (var i = 0; i < rowBytes; i++) {
        var x = lines[cur + i];
        var a = i >= bpp ? lines[cur + i - bpp] : 0;
        var b = y > 0 ? lines[up + i] : 0;
        var c = (i >= bpp && y > 0) ? lines[up + i - bpp] : 0;
        var v1 = (x - a) & 255, v2 = (x - b) & 255, v3 = (x - ((a + b) >> 1)) & 255, v4 = (x - paeth(a, b, c)) & 255;
        tmp[1][i] = v1; tmp[2][i] = v2; tmp[3][i] = v3; tmp[4][i] = v4;
        sums[0] += x < 128 ? x : 256 - x;
        sums[1] += v1 < 128 ? v1 : 256 - v1;
        sums[2] += v2 < 128 ? v2 : 256 - v2;
        sums[3] += v3 < 128 ? v3 : 256 - v3;
        sums[4] += v4 < 128 ? v4 : 256 - v4;
      }
      var best = 0;
      for (var f = 1; f < 5; f++) if (sums[f] < sums[best]) best = f;
      out[o] = best;
      out.set(best === 0 ? lines.subarray(cur, cur + rowBytes) : tmp[best], o + 1);
    }
    return out;
  }

  // Packs RGBA pixels into the given color type / bit depth.
  function pngPack(u32, w, h, fmt) {
    var lay = pngLayout(w, fmt.depth, fmt.ct);
    var lines = new Uint8Array(h * lay.rowBytes);
    var depth = fmt.depth;
    var step = 255 / ((1 << depth) - 1);
    for (var y = 0; y < h; y++) {
      var row = y * lay.rowBytes;
      for (var x = 0; x < w; x++) {
        var v = u32[y * w + x];
        var r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255, a = v >>> 24;
        if (depth < 8) {
          var s = fmt.ct === 3 ? fmt.index.get(v) : r / step;
          var bit = x * depth;
          lines[row + (bit >> 3)] |= s << (8 - depth - (bit & 7));
          continue;
        }
        var p = row + x * PNG_CHANNELS[fmt.ct];
        if (fmt.ct === 0) lines[p] = r;
        else if (fmt.ct === 3) lines[p] = fmt.index.get(v);
        else if (fmt.ct === 4) { lines[p] = r; lines[p + 1] = a; }
        else if (fmt.ct === 2) { lines[p] = r; lines[p + 1] = g; lines[p + 2] = b; }
        else { lines[p] = r; lines[p + 1] = g; lines[p + 2] = b; lines[p + 3] = a; }
      }
    }
    return { lines: lines, rowBytes: lay.rowBytes, bpp: lay.bpp };
  }

  // Smallest lossless formats worth trying for these pixels.
  function pngCandidateFormats(u32, origCt, hasIcc) {
    var opaque = true, gray = true, overflow = false;
    var colors = new Map();
    var graySeen = new Uint8Array(256);
    var last = -1;
    for (var i = 0; i < u32.length; i++) {
      var v = u32[i];
      if (v === last) continue;
      last = v;
      var r = v & 255;
      if ((v >>> 24) !== 255) opaque = false;
      if (r !== ((v >>> 8) & 255) || r !== ((v >>> 16) & 255)) gray = false;
      else graySeen[r] = 1;
      if (!overflow && !colors.has(v)) {
        if (colors.size >= 256) overflow = true; else colors.set(v, 0);
      }
    }
    // An ICC profile is tied to gray vs color, so don't cross that line when one is present.
    var origGray = origCt === 0 || origCt === 4;
    var grayOk = gray && (!hasIcc || origGray);
    var colorOk = !hasIcc || !origGray;
    var out = [];
    if (grayOk) {
      if (opaque) {
        var depth = 8;
        [1, 2, 4].some(function (d) {
          var step = 255 / ((1 << d) - 1);
          for (var g = 0; g < 256; g++) if (graySeen[g] && g % step) return false;
          depth = d;
          return true;
        });
        out.push({ ct: 0, depth: depth, adaptive: depth === 8 });
      } else {
        out.push({ ct: 4, depth: 8, adaptive: true });
      }
    }
    if (colorOk && !overflow) {
      // Semi-transparent entries first so tRNS can stop early.
      var list = Array.from(colors.keys()).sort(function (a, b) { return (a >>> 24 === 255) - (b >>> 24 === 255); });
      var index = new Map();
      var plte = new Uint8Array(list.length * 3);
      var trnsLen = 0;
      list.forEach(function (v, k) {
        index.set(v, k);
        plte[k * 3] = v & 255; plte[k * 3 + 1] = (v >>> 8) & 255; plte[k * 3 + 2] = (v >>> 16) & 255;
        if ((v >>> 24) !== 255) trnsLen = k + 1;
      });
      var trns = new Uint8Array(trnsLen);
      for (var t = 0; t < trnsLen; t++) trns[t] = list[t] >>> 24;
      var n = list.length;
      out.push({ ct: 3, depth: n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8, adaptive: false, index: index, plte: plte, trns: trns });
    }
    if (colorOk && !grayOk) out.push({ ct: opaque ? 2 : 6, depth: 8, adaptive: true });
    return out;
  }

  function pngAssemble(ihdr, ancillary, idat, fmt) {
    var parts = [PNG_SIGNATURE, pngChunk('IHDR', ihdr)].concat(ancillary);
    if (fmt && fmt.plte) parts.push(pngChunk('PLTE', fmt.plte));
    if (fmt && fmt.trns && fmt.trns.length) parts.push(pngChunk('tRNS', fmt.trns));
    parts.push(pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0)));
    return concatBytes(parts);
  }

  // Encodes RGBA pixels in each candidate format; returns the smallest PNG
  // that beats `best` and decodes back to exactly `u32`.
  async function pngEncodeBest(u32, info, chunks, best) {
    var types = chunks.map(function (c) { return c.type; });
    var hasIcc = types.indexOf('iCCP') !== -1;
    var formats = pngCandidateFormats(u32, info.ct, hasIcc);
    for (var i = 0; i < formats.length; i++) {
      var fmt = formats[i];
      var packed = pngPack(u32, info.w, info.h, fmt);
      var filtered = pngFilterRows(packed.lines, info.h, packed.rowBytes, packed.bpp, fmt.adaptive);
      packed = null;
      var idat = await streamThrough(filtered, new CompressionStream('deflate'));
      filtered = null;
      var ihdr = new Uint8Array(13);
      ihdr.set(chunks[0].data);
      ihdr[8] = fmt.depth;
      ihdr[9] = fmt.ct;
      ihdr[12] = 0; // never interlaced
      var sameType = fmt.ct === info.ct && fmt.depth === info.depth;
      // PLTE/tRNS are rebuilt; sBIT's layout depends on the color type.
      var ancillary = chunks.filter(function (c) {
        return keepPngChunk(c) && !isCriticalChunk(c.type) && c.type !== 'tRNS' && (sameType || c.type !== 'sBIT');
      }).map(function (c) { return c.raw; });
      var candidate = pngAssemble(ihdr, ancillary, idat, fmt);
      if (candidate.length >= best.length) continue;
      // Decode the result again and require an exact pixel match.
      var check = pngToRgba(pngDecodeInfo(ihdr),
        await inflateZlibLimited(idat, info.h * (pngLayout(info.w, fmt.depth, fmt.ct).rowBytes + 1)),
        fmt.plte || null, fmt.trns && fmt.trns.length ? fmt.trns : null);
      var same = check.length === u32.length;
      for (var k = 0; same && k < u32.length; k++) if (check[k] !== u32[k]) same = false;
      if (same) best = candidate;
      else console.warn('PNG repack mismatch, candidate dropped');
    }
    return best;
  }

  // Browser decode, used only by the lossy mode (16-bit, interlaced, etc.).
  async function decodeImageRgba(blob) {
    var bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    try {
      if (bmp.width * bmp.height > COMPRESS_MAX_PIXELS) throw new Error('รูปใหญ่เกินไป (เกิน 36 ล้านพิกเซล)');
      var canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      var data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      return { w: bmp.width, h: bmp.height, u32: new Uint32Array(data.buffer, data.byteOffset, data.length >> 2) };
    } finally {
      bmp.close();
    }
  }

  // pngquant-style lossy step: median-cut palette (<=256 colors) plus
  // Floyd-Steinberg dithering, so gradients don't band.
  var QUANT_DITHER = 0.85; // <1 keeps noise (and file size) down
  function quantizeRgba(u32, w, h) {
    var HB = 1 << 19; // 5-bit RGB + 4-bit alpha histogram buckets
    var cnt = new Uint32Array(HB);
    var sr = new Float64Array(HB), sg = new Float64Array(HB), sb = new Float64Array(HB), sa = new Float64Array(HB);
    var hasClear = false;
    var i, v, r, g, b, a, k;
    for (i = 0; i < u32.length; i++) {
      v = u32[i];
      a = v >>> 24;
      if (a < 8) { hasClear = true; continue; }
      r = v & 255; g = (v >>> 8) & 255; b = (v >>> 16) & 255;
      k = ((r >> 3) << 14) | ((g >> 3) << 9) | ((b >> 3) << 4) | (a >> 4);
      cnt[k]++; sr[k] += r; sg[k] += g; sb[k] += b; sa[k] += a;
    }
    var keys = [];
    for (k = 0; k < HB; k++) if (cnt[k]) keys.push(k);
    var n = keys.length;
    var bc = new Float64Array(n), br = new Float64Array(n), bg = new Float64Array(n), bb = new Float64Array(n), ba = new Float64Array(n);
    keys.forEach(function (key, j) {
      var c = cnt[key];
      bc[j] = c; br[j] = sr[key] / c; bg[j] = sg[key] / c; bb[j] = sb[key] / c; ba[j] = sa[key] / c;
    });
    cnt = sr = sg = sb = sa = null;
    var chans = [br, bg, bb, ba];
    var maxColors = hasClear ? 255 : 256;

    // Median cut over bucket indices; boxes are [start, end) ranges of `order`.
    var order = new Uint32Array(n);
    for (i = 0; i < n; i++) order[i] = i;
    function boxInfo(start, end) {
      var lo = [255, 255, 255, 255], hi = [0, 0, 0, 0], total = 0;
      for (var p = start; p < end; p++) {
        var id = order[p];
        total += bc[id];
        for (var c = 0; c < 4; c++) {
          var x = chans[c][id];
          if (x < lo[c]) lo[c] = x;
          if (x > hi[c]) hi[c] = x;
        }
      }
      var axis = 0, range = -1;
      for (var c2 = 0; c2 < 4; c2++) if (hi[c2] - lo[c2] > range) { range = hi[c2] - lo[c2]; axis = c2; }
      return { start: start, end: end, axis: axis, score: end - start > 1 ? range * range * total : -1, total: total };
    }
    var boxes = n ? [boxInfo(0, n)] : [];
    while (boxes.length < maxColors) {
      var bi = -1;
      for (i = 0; i < boxes.length; i++) if (boxes[i].score > 0 && (bi < 0 || boxes[i].score > boxes[bi].score)) bi = i;
      if (bi < 0) break;
      var box = boxes[bi];
      var ch = chans[box.axis];
      order.subarray(box.start, box.end).sort(function (x, y) { return ch[x] - ch[y]; });
      var half = box.total / 2, acc = 0, cut = box.end - 1;
      for (var p = box.start; p < box.end - 1; p++) {
        acc += bc[order[p]];
        if (acc >= half) { cut = p + 1; break; }
      }
      boxes.splice(bi, 1, boxInfo(box.start, cut), boxInfo(cut, box.end));
    }

    var pr = [], pg = [], pb = [], pa = [];
    boxes.forEach(function (bx) {
      var t = 0, r0 = 0, g0 = 0, b0 = 0, a0 = 0;
      for (var p = bx.start; p < bx.end; p++) {
        var id = order[p], c = bc[id];
        t += c; r0 += br[id] * c; g0 += bg[id] * c; b0 += bb[id] * c; a0 += ba[id] * c;
      }
      pr.push(r0 / t); pg.push(g0 / t); pb.push(b0 / t); pa.push(a0 / t);
    });
    var m = pr.length;
    function nearest(r1, g1, b1, a1) {
      var best = 0, bestD = Infinity;
      for (var j = 0; j < m; j++) {
        var dr = r1 - pr[j], dg = g1 - pg[j], db = b1 - pb[j], da = a1 - pa[j];
        var d = dr * dr + dg * dg + db * db + da * da;
        if (d < bestD) { bestD = d; best = j; }
      }
      return best;
    }
    // A couple of weighted k-means passes pull the median-cut colors onto the data.
    var passes = n * m <= 40e6 ? 2 : (n * m <= 120e6 ? 1 : 0);
    for (var pass = 0; pass < passes; pass++) {
      var tr = new Float64Array(m), tg = new Float64Array(m), tb = new Float64Array(m), ta = new Float64Array(m), tc = new Float64Array(m);
      for (i = 0; i < n; i++) {
        var j = nearest(br[i], bg[i], bb[i], ba[i]), c = bc[i];
        tc[j] += c; tr[j] += br[i] * c; tg[j] += bg[i] * c; tb[j] += bb[i] * c; ta[j] += ba[i] * c;
      }
      for (j = 0; j < m; j++) if (tc[j]) { pr[j] = tr[j] / tc[j]; pg[j] = tg[j] / tc[j]; pb[j] = tb[j] / tc[j]; pa[j] = ta[j] / tc[j]; }
    }
    var pal = new Uint32Array(m);
    for (j = 0; j < m; j++) {
      pr[j] = Math.round(pr[j]); pg[j] = Math.round(pg[j]); pb[j] = Math.round(pb[j]); pa[j] = Math.round(pa[j]);
      pal[j] = (pr[j] | (pg[j] << 8) | (pb[j] << 16) | (pa[j] << 24)) >>> 0;
    }

    // Serpentine Floyd-Steinberg with a lazily filled 6-bit RGB + 4-bit alpha lookup.
    var lut = new Int16Array(1 << 22).fill(-1);
    var out = new Uint32Array(u32.length);
    var errA = new Float32Array((w + 2) * 4), errB = new Float32Array((w + 2) * 4);
    for (var y = 0; y < h; y++) {
      var cur = errA, next = errB;
      next.fill(0);
      var ltr = (y & 1) === 0;
      for (var s = 0; s < w; s++) {
        var x = ltr ? s : w - 1 - s;
        var idx = y * w + x;
        v = u32[idx];
        if ((v >>> 24) < 8) { out[idx] = 0; continue; }
        var e = (x + 1) * 4;
        r = Math.min(255, Math.max(0, (v & 255) + cur[e]));
        g = Math.min(255, Math.max(0, ((v >>> 8) & 255) + cur[e + 1]));
        b = Math.min(255, Math.max(0, ((v >>> 16) & 255) + cur[e + 2]));
        a = Math.min(255, Math.max(8, (v >>> 24) + cur[e + 3]));
        k = ((r >> 2) << 16) | ((g >> 2) << 10) | ((b >> 2) << 4) | (a >> 4);
        var q = lut[k];
        if (q < 0) q = lut[k] = nearest(r, g, b, a);
        out[idx] = pal[q];
        var er = (r - pr[q]) * QUANT_DITHER, eg = (g - pg[q]) * QUANT_DITHER, eb = (b - pb[q]) * QUANT_DITHER, ea = (a - pa[q]) * QUANT_DITHER;
        var fwd = ltr ? 4 : -4;
        // 7/16 ahead, 3/16 behind-below, 5/16 below, 1/16 ahead-below.
        cur[e + fwd] += er * 0.4375; cur[e + fwd + 1] += eg * 0.4375; cur[e + fwd + 2] += eb * 0.4375; cur[e + fwd + 3] += ea * 0.4375;
        next[e - fwd] += er * 0.1875; next[e - fwd + 1] += eg * 0.1875; next[e - fwd + 2] += eb * 0.1875; next[e - fwd + 3] += ea * 0.1875;
        next[e] += er * 0.3125; next[e + 1] += eg * 0.3125; next[e + 2] += eb * 0.3125; next[e + 3] += ea * 0.3125;
        next[e + fwd] += er * 0.0625; next[e + fwd + 1] += eg * 0.0625; next[e + fwd + 2] += eb * 0.0625; next[e + fwd + 3] += ea * 0.0625;
      }
      errA = next;
      errB = cur;
    }
    return out;
  }

  async function optimizePng(b, lossy) {
    var chunks = parsePngChunks(b);
    if (!chunks) return null;
    // Metadata-only pass: same pixel data, fewer chunks.
    var stripped = concatBytes([PNG_SIGNATURE].concat(chunks.filter(keepPngChunk).map(function (c) { return c.raw; })));
    var best = stripped;

    var info = pngDecodeInfo(chunks[0].data);
    var types = chunks.map(function (c) { return c.type; });
    var unknownCritical = types.some(function (t) { return isCriticalChunk(t) && ['IHDR', 'PLTE', 'IDAT', 'IEND'].indexOf(t) === -1; });
    var canEncode = window.CompressionStream && window.DecompressionStream && !unknownCritical &&
      types.indexOf('acTL') === -1 && info.w > 0 && info.h > 0 && info.w * info.h <= COMPRESS_MAX_PIXELS;
    if (!canEncode) return best;
    var canRepack = info.interlace === 0 && PNG_CHANNELS[info.ct] &&
      [1, 2, 4, 8].indexOf(info.depth) !== -1 && (info.depth === 8 || info.ct === 0 || info.ct === 3);

    var u32 = null;
    try {
      if (canRepack) {
        var plte = null, trns = null, idatParts = [];
        chunks.forEach(function (c) {
          if (c.type === 'PLTE') plte = c.data;
          else if (c.type === 'tRNS') trns = c.data;
          else if (c.type === 'IDAT') idatParts.push(c.data);
        });
        if (info.ct !== 3 || plte) {
          var lay = pngLayout(info.w, info.depth, info.ct);
          var raw = await inflateZlibLimited(concatBytes(idatParts), info.h * (lay.rowBytes + 1));
          u32 = pngToRgba(info, raw, plte, trns);
          raw = null;
          best = await pngEncodeBest(u32, info, chunks, best);
        }
      }
    } catch (err) {
      console.warn('PNG repack skipped:', err && err.message);
      u32 = null;
    }
    if (!lossy) return best;

    try {
      if (!u32) {
        var dec = await decodeImageRgba(new Blob([b], { type: 'image/png' }));
        u32 = dec.u32;
      }
      var quantized = quantizeRgba(u32, info.w, info.h);
      u32 = null;
      // Gamma/ICC chunks still describe the same color values, so they stay valid.
      best = await pngEncodeBest(quantized, info, chunks, best);
    } catch (err) {
      console.warn('PNG quantize skipped:', err && err.message);
    }
    return best;
  }

  // Lossy re-encode for JPEG/WebP; EXIF orientation is baked into the pixels.
  var COMPRESS_LOSSY_QUALITY = 0.82;
  async function reencodeImage(file, mime) {
    var bmp = await createImageBitmap(file);
    try {
      if (bmp.width * bmp.height > COMPRESS_MAX_PIXELS) throw new Error('รูปใหญ่เกินไป (เกิน 36 ล้านพิกเซล)');
      var canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      var ctx = canvas.getContext('2d');
      if (mime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(bmp, 0, 0);
      var blob = await canvasToBlob(canvas, mime, COMPRESS_LOSSY_QUALITY);
      // Browsers without a WebP encoder silently fall back to PNG.
      if (blob.type !== mime) return null;
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      bmp.close();
    }
  }

  async function compressImage(file, lossy) {
    var bytes = new Uint8Array(await file.arrayBuffer());
    var kind = sniffImageKind(bytes);
    if (!kind) throw new Error('ไฟล์นี้ไม่ใช่ JPG, PNG หรือ WEBP');
    var out = null;
    if (kind === 'png') out = await optimizePng(bytes, lossy);
    else {
      out = kind === 'jpg' ? optimizeJpeg(bytes) : optimizeWebp(bytes);
      if (lossy) {
        try {
          var re = await reencodeImage(file, COMPRESS_MIME[kind]);
          if (re && (!out || re.length < out.length)) out = re;
        } catch (err) {
          console.warn('Re-encode skipped:', err && err.message);
        }
      }
    }
    if (!out || out.length >= bytes.length) return { kind: kind, blob: null };
    return { kind: kind, blob: new Blob([out], { type: COMPRESS_MIME[kind] }) };
  }

  function initImageCompressView() {
    var items = []; // { id, file, url, status: 'queued'|'working'|'done'|'same'|'error', blob, kind, error }
    var nextId = 1;
    var running = false;
    var lossy = false;

    var $dropzone = $('#imgc-dropzone');
    var $fileInput = $('#imgc-file-input');
    var $uploadError = $('#imgc-upload-error');
    var $panel = $('#imgc-panel');
    var $list = $('#imgc-list');
    var $summary = $('#imgc-summary');
    var $btnAll = $('#btn-imgc-download-all');
    var $statusEl = $('#imgc-status');
    var $modes = $('#imgc-mode button');
    var $modeNote = $('#imgc-mode-note');

    function setStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }
    function renderMode() {
      $modes.each(function () {
        var on = ($(this).data('mode') === 'lossy') === lossy;
        $(this).attr('aria-checked', on ? 'true' : 'false')
          .toggleClass('bg-accent text-accentink shadow-sm', on)
          .toggleClass('text-inksoft hover:text-ink', !on);
      });
      $modeNote.text(lossy
        ? 'PNG ลดเหลือไม่เกิน 256 สีแบบกระจายสี (เหมือน TinyPNG) · JPG/WEBP บีบอัดใหม่ที่คุณภาพ 82% · ตาเปล่าแทบไม่เห็นความต่าง'
        : 'พิกเซลเหมือนเดิมทุกจุด · ตัดข้อมูลแฝงและจัดเก็บ PNG ใหม่ · ภาพถ่ายจะลดได้น้อย');
    }
    function outputName(item) {
      var name = item.file.name || 'image';
      var dotIdx = name.lastIndexOf('.');
      var base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
      return base + '-compressed.' + (item.kind === 'jpg' ? 'jpg' : item.kind);
    }
    function percentSaved(before, after) {
      var pct = (1 - after / before) * 100;
      return pct < 0.1 ? '<0.1%' : pct.toFixed(1) + '%';
    }

    function render() {
      $list.empty();
      var before = 0, after = 0, ready = 0, busy = 0;
      items.forEach(function (item) {
        var $row = $('<div>').addClass('flex items-center gap-3 bg-surface border border-line rounded-xl px-3 py-2.5 shadow-sm');
        var $thumb = $('<span>').addClass('flex h-11 w-11 flex-none items-center justify-center rounded-lg overflow-hidden bg-surface2 ring-1 ring-line')
          .append(item.status === 'error'
            ? $('<i>').addClass('bi bi-file-earmark-x text-lg text-bad leading-none')
            : $('<img>').attr({ src: item.url, alt: '' }).addClass('h-full w-full object-cover'));
        var $meta = $('<div>').addClass('flex-1 min-w-0');
        $meta.append($('<div>').addClass('font-semibold text-[13px] truncate').text(item.file.name || 'image'));
        var $line = $('<div>').addClass('flex items-center gap-1.5 flex-wrap text-[11.5px] mt-0.5');
        if (item.status === 'done') {
          before += item.file.size;
          after += item.blob.size;
          ready++;
          $line.append(
            $('<span>').addClass('text-inksoft').text(formatSize(item.file.size) + ' → '),
            $('<span>').addClass('font-bold text-ink').text(formatSize(item.blob.size)),
            $('<span>').addClass('rounded-full bg-goodsoft text-good font-bold px-1.5 py-px text-[10.5px]').text('−' + percentSaved(item.file.size, item.blob.size))
          );
        } else if (item.status === 'same') {
          $line.append($('<span>').addClass('text-inksoft').text(formatSize(item.file.size) + ' · ลดขนาดเพิ่มไม่ได้แล้ว' + (lossy ? '' : ' (ลองโหมด "ลดขนาดมากขึ้น")')));
        } else if (item.status === 'error') {
          $line.append($('<span>').addClass('text-bad').text(item.error));
        } else {
          busy++;
          $line.append(
            $('<span>').addClass('spinner inline-block w-[11px] h-[11px] rounded-full border-2 border-accent/30 border-t-accent animate-spin'),
            $('<span>').addClass('text-inksoft').text(item.status === 'working' ? 'กำลังบีบอัด…' : 'รอคิว…')
          );
        }
        $meta.append($line);

        var $dl = $('<button>').attr({ type: 'button', title: 'ดาวน์โหลด', 'aria-label': 'ดาวน์โหลด' })
          .addClass('flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accent text-accentink hover:bg-accentdeep disabled:bg-line disabled:text-inkfaint disabled:pointer-events-none')
          .prop('disabled', item.status !== 'done')
          .append($('<i>').addClass('bi bi-download text-sm leading-none'))
          .on('click', function () { downloadItems([item]); });
        var $remove = $('<button>').attr({ type: 'button', title: 'นำออก', 'aria-label': 'นำออก' })
          .addClass('flex h-8 w-8 flex-none items-center justify-center rounded-lg text-inksoft hover:text-bad hover:bg-badsoft')
          .append($('<i>').addClass('bi bi-x-lg text-sm leading-none'))
          .on('click', function () { removeItem(item); });
        $row.append($thumb, $meta, $dl, $remove);
        $list.append($row);
      });

      $panel.css('display', items.length ? 'block' : 'none');
      if (ready) {
        $summary.text(items.length + ' ไฟล์ · ลดลงรวม ' + formatSize(before - after) + ' (−' + percentSaved(before, after) + ')');
      } else {
        $summary.text(items.length + ' ไฟล์' + (busy ? '' : ' · ไม่มีไฟล์ที่ลดขนาดได้'));
      }
      $btnAll.prop('disabled', !ready || busy > 0);
      $btnAll.find('.btn-label').text(ready > 1 ? 'ดาวน์โหลดทั้งหมด (.zip)' : 'ดาวน์โหลด');
    }

    function removeItem(item) {
      var idx = items.indexOf(item);
      if (idx === -1) return;
      items.splice(idx, 1);
      URL.revokeObjectURL(item.url);
      item.removed = true;
      setStatus('', 'neutral');
      render();
    }

    async function runQueue() {
      if (running) return;
      running = true;
      try {
        for (;;) {
          var item = items.find(function (it) { return it.status === 'queued'; });
          if (!item) break;
          item.status = 'working';
          render();
          try {
            var res = await compressImage(item.file, lossy);
            item.kind = res.kind;
            item.blob = res.blob;
            item.status = res.blob ? 'done' : 'same';
            // Mode changed mid-run: redo with the new setting.
            if (item.redo) { item.redo = false; item.status = 'queued'; item.blob = null; }
          } catch (err) {
            console.error(err);
            item.status = 'error';
            item.error = (err && err.message) || 'บีบอัดไม่สำเร็จ';
          }
          if (!item.removed) render();
        }
      } finally {
        running = false;
      }
    }

    function addFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;
      var errors = [];
      files.forEach(function (file) {
        var okType = /^image\/(jpeg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name || '');
        if (!okType) { errors.push((file.name || 'ไฟล์') + ': รองรับเฉพาะ JPG, PNG, WEBP'); return; }
        if (file.size > COMPRESS_MAX_BYTES) { errors.push((file.name || 'ไฟล์') + ': ใหญ่เกิน 50 MB'); return; }
        if (items.length >= COMPRESS_MAX_FILES) { errors.push('เพิ่มได้สูงสุด ' + COMPRESS_MAX_FILES + ' ไฟล์ต่อครั้ง'); return; }
        items.push({ id: nextId++, file: file, url: URL.createObjectURL(file), status: 'queued' });
      });
      $uploadError.text(errors.length ? errors.filter(function (e, i) { return errors.indexOf(e) === i; }).join(' · ') : '');
      setStatus('', 'neutral');
      render();
      runQueue();
    }

    async function downloadItems(list) {
      var done = list.filter(function (it) { return it.status === 'done'; });
      if (!done.length) return;
      try {
        var res = await deliverFiles(done.map(function (it) { return { name: outputName(it), blob: it.blob }; }),
          'compressed-images-' + fileTimestamp(new Date()));
        setStatus(res.status === 'saved' ? 'บันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      }
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
      if (dt && dt.files) addFiles(dt.files);
    });
    $fileInput.on('change', function () {
      addFiles($fileInput[0].files);
      $fileInput.val('');
    });
    $(document).on('paste', function (e) {
      if ($viewImageCompress.attr('hidden') !== undefined) return;
      var list = [];
      var clip = (e.originalEvent.clipboardData && e.originalEvent.clipboardData.items) || [];
      for (var i = 0; i < clip.length; i++) {
        if (clip[i].kind !== 'file' || !/^image\//.test(clip[i].type)) continue;
        var blob = clip[i].getAsFile();
        if (!blob) continue;
        var ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        list.push(new File([blob], 'pasted-image-' + fileTimestamp(new Date()) + '.' + ext, { type: blob.type }));
      }
      if (list.length) { e.preventDefault(); addFiles(list); }
    });
    $btnAll.on('click', function () { downloadItems(items); });
    $modes.on('click', function () {
      var next = $(this).data('mode') === 'lossy';
      if (next === lossy) return;
      lossy = next;
      renderMode();
      items.forEach(function (it) {
        if (it.status === 'working') it.redo = true;
        else if (it.status !== 'error') { it.status = 'queued'; it.blob = null; }
      });
      setStatus('', 'neutral');
      render();
      runQueue();
    });
    renderMode();
    $('#btn-imgc-clear').on('click', function () {
      items.forEach(function (it) { URL.revokeObjectURL(it.url); it.removed = true; });
      items = [];
      $uploadError.text('');
      setStatus('', 'neutral');
      render();
    });
  }

  // ---------- HTML preview ----------
  // The preview is an iframe with srcdoc and a sandbox that never includes
  // allow-same-origin, so previewed code gets an opaque origin and can't read
  // this page, its storage or cookies.
  var HTMLPV_MAX_BYTES = 2 * 1024 * 1024;
  var BEAUTIFY_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/js-beautify/1.15.1/';
  var beautifyPromise = null;
  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('โหลดไลบรารีจัดรูปแบบโค้ดไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต')); };
      document.head.appendChild(s);
    });
  }
  // js/css beautifiers first: html_beautify uses them for <script>/<style> blocks.
  function loadBeautify() {
    if (window.html_beautify) return Promise.resolve(window.html_beautify);
    if (!beautifyPromise) {
      beautifyPromise = loadScriptOnce(BEAUTIFY_BASE + 'beautify.min.js')
        .then(function () { return loadScriptOnce(BEAUTIFY_BASE + 'beautify-css.min.js'); })
        .then(function () { return loadScriptOnce(BEAUTIFY_BASE + 'beautify-html.min.js'); })
        .then(function () {
          if (!window.html_beautify) throw new Error('โหลดไลบรารีจัดรูปแบบโค้ดไม่สำเร็จ');
          return window.html_beautify;
        })
        .catch(function (err) { beautifyPromise = null; throw err; });
    }
    return beautifyPromise;
  }

  function initHtmlPreviewView() {
    var $code = $('#htmlpv-code');
    var $meta = $('#htmlpv-meta');
    var $frame = $('#htmlpv-frame');
    var $btnBeautify = $('#btn-htmlpv-beautify');
    var $fileInput = $('#htmlpv-file-input');
    var $statusEl = $('#htmlpv-status');
    var INDENT = '  ';
    var fileName = null;
    var timer = null;
    var escPressed = false;

    function setStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }
    function updateMeta() {
      var text = $code.val();
      var lines = text ? text.split('\n').length : 0;
      $meta.text('บรรทัด ' + lines.toLocaleString() + ' · ตัวอักษร ' + text.length.toLocaleString());
    }
    function renderPreview() {
      timer = null;
      $frame.attr('srcdoc', $code.val());
    }
    function schedulePreview() {
      updateMeta();
      if (timer) clearTimeout(timer);
      timer = setTimeout(renderPreview, $code.val().length > 200000 ? 800 : 300);
    }
    function setCode(text) {
      $code.val(text);
      schedulePreview();
    }
    async function beautify() {
      var src = $code.val();
      if (!src.trim()) { setStatus('ยังไม่มีโค้ดให้จัดรูปแบบ', 'bad'); return; }
      $btnBeautify.prop('disabled', true).find('.spinner').removeClass('hidden').addClass('inline-block');
      try {
        var fmt = await loadBeautify();
        var out = fmt(src, {
          indent_size: INDENT.length,
          indent_char: ' ',
          wrap_line_length: 0,
          preserve_newlines: true,
          max_preserve_newlines: 1,
          indent_inner_html: true,
          extra_liners: [],
          // true also leaves a blank line before </script> and </style>
          end_with_newline: false
        });
        var el = $code[0];
        // Replace through the editing API when possible so Ctrl+Z can undo it.
        el.focus();
        el.select();
        if (!document.execCommand || !document.execCommand('insertText', false, out)) el.value = out;
        el.setSelectionRange(0, 0);
        el.scrollTop = 0;
        schedulePreview();
        setStatus('จัดรูปแบบโค้ดแล้ว (กด Ctrl+Z เพื่อย้อนกลับ)', 'good');
      } catch (err) {
        console.error(err);
        setStatus((err && err.message) || 'จัดรูปแบบไม่สำเร็จ', 'bad');
      } finally {
        $btnBeautify.prop('disabled', false).find('.spinner').addClass('hidden').removeClass('inline-block');
      }
    }

    $code.on('input', function () { setStatus('', 'neutral'); schedulePreview(); });
    // Tab indents; press Esc first to let Tab move focus out of the editor.
    $code.on('keydown', function (e) {
      if (e.key === 'Escape') { escPressed = true; return; }
      if (e.key === 'Tab' && !escPressed && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        var el = this;
        if (!document.execCommand || !document.execCommand('insertText', false, INDENT)) {
          el.setRangeText(INDENT, el.selectionStart, el.selectionEnd, 'end');
          schedulePreview();
        }
      }
      if (e.key !== 'Tab') escPressed = false;
      if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); beautify(); }
    });
    $code.on('blur', function () { escPressed = false; });
    $btnBeautify.on('click', beautify);

    $('#btn-htmlpv-open').on('click', function () { $fileInput.trigger('click'); });
    $fileInput.on('change', function () {
      var file = $fileInput[0].files[0];
      $fileInput.val('');
      if (!file) return;
      if (file.size > HTMLPV_MAX_BYTES) { setStatus('ไฟล์ใหญ่เกิน 2 MB', 'bad'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        fileName = file.name;
        setCode(String(reader.result || ''));
        setStatus('เปิดไฟล์ ' + file.name + ' แล้ว', 'good');
      };
      reader.onerror = function () { setStatus('อ่านไฟล์ไม่สำเร็จ', 'bad'); };
      reader.readAsText(file);
    });
    $('#btn-htmlpv-copy').on('click', async function () {
      var text = $code.val();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setStatus('คัดลอกแล้ว', 'good');
      } catch (err) {
        $code.trigger('select');
        setStatus('ไม่สามารถคัดลอกอัตโนมัติได้ ข้อความถูกเลือกไว้แล้ว กด Ctrl+C', 'bad');
      }
    });
    $('#btn-htmlpv-download').on('click', async function () {
      var text = $code.val();
      if (!text) return;
      var name = fileName || ('preview-' + fileTimestamp(new Date()) + '.html');
      if (!/\.(html?|xhtml)$/i.test(name)) name += '.html';
      try {
        var res = await deliverFiles([{ name: name, blob: new Blob([text], { type: 'text/html;charset=utf-8' }) }], name);
        setStatus(res.status === 'saved' ? 'บันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      }
    });
    $('#btn-htmlpv-clear').on('click', function () {
      fileName = null;
      setCode('');
      setStatus('', 'neutral');
      $code.trigger('focus');
    });

    updateMeta();
  }

  // ---------- Convert case ----------
  // Only letters with case change; Thai and other caseless scripts pass through.
  var CASE_WORD_RE = /[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu;
  // Short words kept lowercase in Title Case unless first or last.
  var TITLE_MINOR_WORDS = ['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'from', 'into', 'onto', 'with', 'over'];

  function capitalizeWord(w) {
    var chars = Array.from(w.toLowerCase());
    for (var i = 0; i < chars.length; i++) {
      if (/\p{L}/u.test(chars[i])) { chars[i] = chars[i].toUpperCase(); break; }
    }
    return chars.join('');
  }
  var CASE_CONVERTERS = {
    lower: function (t) { return t.toLowerCase(); },
    upper: function (t) { return t.toUpperCase(); },
    capitalized: function (t) { return t.replace(CASE_WORD_RE, capitalizeWord); },
    sentence: function (t) {
      var start = true;
      var out = t.toLowerCase().replace(/[\s\S]/gu, function (ch) {
        if (/[.!?]/.test(ch) || ch === '\n') { start = true; return ch; }
        if (start && /\p{L}/u.test(ch)) { start = false; return ch.toUpperCase(); }
        if (start && /[\p{N}]/u.test(ch)) start = false;
        return ch;
      });
      // Standalone English "I" and its contractions stay capitalized.
      return out.replace(/(^|[^\p{L}\p{N}])i(?=$|[^\p{L}\p{N}'’]|['’](?:m|d|ll|ve)\b)/gu, '$1I');
    },
    title: function (t) {
      var words = [];
      t.replace(CASE_WORD_RE, function (w, offset) { words.push(offset); return w; });
      var first = words.length ? words[0] : -1;
      var last = words.length ? words[words.length - 1] : -1;
      return t.replace(CASE_WORD_RE, function (w, offset) {
        var lower = w.toLowerCase();
        // Capitalize after a colon or dash as well, e.g. "Part 2: The End".
        var prev = t.slice(Math.max(0, offset - 40), offset);
        var lineStart = /\n[^\S\n]*$/.test(prev) || (offset === prev.length && /^[^\S\n]*$/.test(prev));
        var boundary = offset === first || offset === last || lineStart || /[:–—-]\s*$/.test(prev);
        if (!boundary && TITLE_MINOR_WORDS.indexOf(lower) !== -1) return lower;
        return capitalizeWord(w);
      });
    },
    alternating: function (t) {
      var n = 0;
      return Array.from(t).map(function (ch) {
        if (ch.toLowerCase() === ch.toUpperCase()) return ch;
        return (n++ % 2) ? ch.toUpperCase() : ch.toLowerCase();
      }).join('');
    },
    inverse: function (t) {
      return Array.from(t).map(function (ch) {
        var up = ch.toUpperCase();
        return ch === up ? ch.toLowerCase() : up;
      }).join('');
    }
  };

  function initConvertCaseView() {
    var $text = $('#case-text');
    var $meta = $('#case-meta');
    var $statusEl = $('#case-status');
    var $buttons = $('#case-buttons button');

    function setStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }
    function countWords(text) {
      if (diffWordSegmenter) {
        var n = 0;
        var it = diffWordSegmenter.segment(text)[Symbol.iterator]();
        for (var r = it.next(); !r.done; r = it.next()) if (r.value.isWordLike) n++;
        return n;
      }
      return (text.match(CASE_WORD_RE) || []).length;
    }
    function updateMeta() {
      var text = $text.val();
      var lines = text ? text.split('\n').length : 0;
      $meta.text('ตัวอักษร ' + Array.from(text).length.toLocaleString() + ' · คำ ' + countWords(text).toLocaleString() + ' · บรรทัด ' + lines.toLocaleString());
    }
    function setActive(mode) {
      $buttons.each(function () {
        var on = $(this).data('case') === mode;
        $(this).toggleClass('bg-accent text-accentink border-accent', on)
          .toggleClass('bg-surface text-ink border-line hover:border-accent hover:text-accentdeep', !on);
      });
    }

    $buttons.addClass('px-3 py-2.5 rounded-xl border text-[13px] font-bold cursor-pointer shadow-sm transition-colors duration-150 truncate');
    setActive(null);

    $buttons.on('click', function () {
      var mode = $(this).data('case');
      var el = $text[0];
      var src = el.value;
      if (!src) { setStatus('ยังไม่มีข้อความ', 'bad'); return; }
      var out = CASE_CONVERTERS[mode](src);
      if (out !== src) {
        // Replace through the editing API so Ctrl+Z can undo the conversion.
        el.focus();
        el.select();
        if (!document.execCommand || !document.execCommand('insertText', false, out)) el.value = out;
        el.setSelectionRange(0, 0);
        el.scrollTop = 0;
      }
      updateMeta();
      setActive(mode);
      setStatus('แปลงเป็น ' + $(this).text() + ' แล้ว (กด Ctrl+Z เพื่อย้อนกลับ)', 'good');
    });
    $text.on('input', function () {
      updateMeta();
      setActive(null);
      setStatus('', 'neutral');
    });

    $('#btn-case-copy').on('click', async function () {
      var text = $text.val();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setStatus('คัดลอกแล้ว', 'good');
      } catch (err) {
        $text.trigger('select');
        setStatus('ไม่สามารถคัดลอกอัตโนมัติได้ ข้อความถูกเลือกไว้แล้ว กด Ctrl+C', 'bad');
      }
    });
    $('#btn-case-download').on('click', async function () {
      var text = $text.val();
      if (!text) return;
      var name = 'text-' + fileTimestamp(new Date()) + '.txt';
      try {
        var res = await deliverFiles([{ name: name, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }], name);
        setStatus(res.status === 'saved' ? 'บันทึกไฟล์สำเร็จ' : 'ส่งไฟล์เรียบร้อย', 'good');
      } catch (err) {
        setStatus(describeDownloadError(err), err && err.code === 'declined' ? 'neutral' : 'bad');
      }
    });
    $('#btn-case-clear').on('click', function () {
      $text.val('');
      updateMeta();
      setActive(null);
      setStatus('', 'neutral');
      $text.trigger('focus');
    });
    updateMeta();
  }

  // ---------- Text compare ----------
  // Line diff first, then a word-level diff inside each changed line pair.
  // Everything is rendered with text nodes, never innerHTML, since the
  // compared text is arbitrary user input.
  var DIFF_MAX_EDITS = 2000; // Myers keeps one snapshot per edit step, memory grows ~D^2
  var DIFF_MAX_LINES = 50000;
  var DIFF_MAX_FILE_BYTES = 5 * 1024 * 1024;
  var DIFF_CONTEXT = 3;
  var DIFF_INLINE_MAX_TOKENS = 4000;

  // Myers O(ND) diff over two arrays of keys. Returns ops in order:
  // {t:'=', a, b} | {t:'-', a} | {t:'+', b}, or null past maxEdits.
  function myersDiff(a, b, maxEdits) {
    var n = a.length;
    var m = b.length;
    var start = 0;
    while (start < n && start < m && a[start] === b[start]) start++;
    var endA = n;
    var endB = m;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    var N = endA - start;
    var M = endB - start;
    var limit = Math.min(N + M, maxEdits);
    var off = limit + 1;
    var v = new Int32Array(2 * limit + 3);
    var trace = [];
    var found = -1;
    for (var d = 0; d <= limit && found < 0; d++) {
      trace.push(v.slice(off - d, off + d + 1));
      for (var k = -d; k <= d; k += 2) {
        var x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
        var y = x - k;
        while (x < N && y < M && a[start + x] === b[start + y]) { x++; y++; }
        v[off + k] = x;
        if (x >= N && y >= M) { found = d; break; }
      }
    }
    if (found < 0) return null;

    var mid = [];
    var cx = N;
    var cy = M;
    for (var dd = found; dd > 0; dd--) {
      var snap = trace[dd];
      var ck = cx - cy;
      var prevK = (ck === -dd || (ck !== dd && snap[ck - 1 + dd] < snap[ck + 1 + dd])) ? ck + 1 : ck - 1;
      var prevX = snap[prevK + dd];
      var prevY = prevX - prevK;
      while (cx > prevX && cy > prevY) { mid.push({ t: '=', a: start + cx - 1, b: start + cy - 1 }); cx--; cy--; }
      if (cx === prevX) mid.push({ t: '+', b: start + cy - 1 });
      else mid.push({ t: '-', a: start + cx - 1 });
      cx = prevX;
      cy = prevY;
    }
    while (cx > 0 && cy > 0) { mid.push({ t: '=', a: start + cx - 1, b: start + cy - 1 }); cx--; cy--; }

    var ops = [];
    for (var i = 0; i < start; i++) ops.push({ t: '=', a: i, b: i });
    for (var j = mid.length - 1; j >= 0; j--) ops.push(mid[j]);
    for (var s = 0; s < n - endA; s++) ops.push({ t: '=', a: endA + s, b: endB + s });
    return ops;
  }

  // Word tokens; Intl.Segmenter also splits Thai, which has no spaces between words.
  var diffWordSegmenter = null;
  var diffGraphemeSegmenter = null;
  try {
    if (window.Intl && Intl.Segmenter) {
      diffWordSegmenter = new Intl.Segmenter('th', { granularity: 'word' });
      diffGraphemeSegmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
    }
  } catch (e) { diffWordSegmenter = null; diffGraphemeSegmenter = null; }
  function segmentAll(segmenter, text) {
    var out = [];
    var it = segmenter.segment(text)[Symbol.iterator]();
    for (var r = it.next(); !r.done; r = it.next()) out.push(r.value.segment);
    return out;
  }
  function diffTokens(text) {
    if (diffWordSegmenter) return segmentAll(diffWordSegmenter, text);
    return text.match(/\s+|[A-Za-z0-9_]+|[\s\S]/g) || [];
  }
  // Grapheme clusters keep Thai vowel/tone marks attached to their consonant.
  function diffGraphemes(text) {
    if (diffGraphemeSegmenter) return segmentAll(diffGraphemeSegmenter, text);
    return Array.from(text);
  }

  function initTextCompareView() {
    var $left = $('#textcmp-left');
    var $right = $('#textcmp-right');
    var $leftMeta = $('#textcmp-left-meta');
    var $rightMeta = $('#textcmp-right-meta');
    var $optCase = $('#textcmp-opt-case');
    var $optSpace = $('#textcmp-opt-space');
    var $fileInput = $('#textcmp-file-input');
    var $statusEl = $('#textcmp-status');
    var $resultPanel = $('#textcmp-result-panel');
    var $result = $('#textcmp-result');
    var $same = $('#textcmp-same');
    var $diffHead = $('#textcmp-diff-head');
    var $removed = $('#textcmp-removed');
    var $added = $('#textcmp-added');
    var last = null; // { ops, aLines, bLines }
    var fileTarget = null;
    var timer = null;

    function setStatus(msg, kind) {
      $statusEl.text(msg || '');
      $statusEl.removeClass('text-good text-bad text-inksoft');
      if (kind === 'good') $statusEl.addClass('text-good');
      else if (kind === 'bad') $statusEl.addClass('text-bad');
      else $statusEl.addClass('text-inksoft');
    }
    function lineKey(s) {
      if ($optSpace.prop('checked')) s = s.replace(/\s+/g, '');
      if ($optCase.prop('checked')) s = s.toLowerCase();
      return s;
    }
    function splitLines(text) {
      return text.split(/\r\n|\r|\n/);
    }
    function updateMeta($ta, $meta) {
      var text = $ta.val();
      var lines = text ? splitLines(text).length : 0;
      $meta.text('บรรทัด ' + lines.toLocaleString() + ' · ตัวอักษร ' + text.length.toLocaleString());
    }

    function el(tag, cls, text) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function appendSegments(parent, segs) {
      var buf = '';
      var changed = false;
      function flush() {
        if (buf) parent.appendChild(changed ? el('mark', '', buf) : document.createTextNode(buf));
        buf = '';
      }
      segs.forEach(function (s) {
        if (!s.text) return;
        if (s.changed !== changed) { flush(); changed = s.changed; }
        buf += s.text;
      });
      flush();
    }
    // One side of an aligned row: kind '=' | '-' | '+' | '' (filler).
    function appendCell(row, kind, no, content, split) {
      var cls = kind === '-' ? ' diff-del' : kind === '+' ? ' diff-ins' : kind === '' ? ' diff-empty' : '';
      row.appendChild(el('span', 'diff-num' + cls + (split ? ' diff-split' : ''), no === null ? '' : String(no)));
      var text = el('span', 'diff-text' + cls);
      if (content === null) text.textContent = '';
      else if (typeof content === 'string') text.textContent = content || ' ';
      else appendSegments(text, content);
      row.appendChild(text);
    }
    function makeRow(left, right) {
      var row = el('div', 'diff-row');
      appendCell(row, left.kind, left.no, left.content, false);
      appendCell(row, right.kind, right.no, right.content, true);
      return row;
    }

    // Word diff, then a character diff inside each replaced word run, so
    // "aaaa" -> "aaaabaaa" highlights only "baaa" instead of the whole word.
    function tokenKeyFn() {
      var ignoreSpace = $optSpace.prop('checked');
      var ignoreCase = $optCase.prop('checked');
      return function (t) {
        if (ignoreSpace && !/\S/.test(t)) return '';
        return ignoreCase ? t.toLowerCase() : t;
      };
    }
    function charSegments(aText, bText, key) {
      var aG = diffGraphemes(aText);
      var bG = diffGraphemes(bText);
      if (aG.length + bG.length > DIFF_INLINE_MAX_TOKENS) return null;
      var ops = myersDiff(aG.map(key), bG.map(key), DIFF_MAX_EDITS);
      if (!ops) return null;
      var same = 0;
      ops.forEach(function (o) { if (o.t === '=') same++; });
      // Mostly-different words read better highlighted whole.
      if (same * 2 < (aG.length + bG.length) * 0.5) return null;
      var a = [];
      var b = [];
      ops.forEach(function (o) {
        if (o.t === '=') { a.push({ text: aG[o.a], changed: false }); b.push({ text: bG[o.b], changed: false }); }
        else if (o.t === '-') a.push({ text: aG[o.a], changed: true });
        else b.push({ text: bG[o.b], changed: true });
      });
      return { a: a, b: b };
    }
    function inlineSegments(aText, bText) {
      var aTok = diffTokens(aText);
      var bTok = diffTokens(bText);
      if (aTok.length + bTok.length > DIFF_INLINE_MAX_TOKENS) return null;
      var key = tokenKeyFn();
      var ops = myersDiff(aTok.map(key), bTok.map(key), DIFF_MAX_EDITS);
      if (!ops) return null;
      var a = [];
      var b = [];
      var delRun = '';
      var insRun = '';
      function flush() {
        if (!delRun && !insRun) return;
        var fine = delRun && insRun ? charSegments(delRun, insRun, key) : null;
        if (fine) { a = a.concat(fine.a); b = b.concat(fine.b); }
        else {
          if (delRun) a.push({ text: delRun, changed: true });
          if (insRun) b.push({ text: insRun, changed: true });
        }
        delRun = '';
        insRun = '';
      }
      ops.forEach(function (o) {
        if (o.t === '=') {
          flush();
          a.push({ text: aTok[o.a], changed: false });
          b.push({ text: bTok[o.b], changed: false });
        } else if (o.t === '-') delRun += aTok[o.a];
        else insRun += bTok[o.b];
      });
      flush();
      return { a: a, b: b };
    }

    // Groups ops into equal runs and change blocks (deletions + insertions).
    function buildBlocks(ops) {
      var blocks = [];
      var i = 0;
      while (i < ops.length) {
        if (ops[i].t === '=') {
          var eq = [];
          while (i < ops.length && ops[i].t === '=') eq.push(ops[i++]);
          blocks.push({ type: 'eq', ops: eq });
        } else {
          var dels = [];
          var ins = [];
          while (i < ops.length && ops[i].t !== '=') {
            if (ops[i].t === '-') dels.push(ops[i]); else ins.push(ops[i]);
            i++;
          }
          blocks.push({ type: 'chg', dels: dels, ins: ins });
        }
      }
      return blocks;
    }

    function renderEqRows(frag, ops) {
      ops.forEach(function (o) {
        frag.appendChild(makeRow(
          { kind: '=', no: o.a + 1, content: last.aLines[o.a] },
          { kind: '=', no: o.b + 1, content: last.bLines[o.b] }
        ));
      });
    }
    function renderFold(frag, ops) {
      var btn = el('button', 'diff-fold', '··· ' + ops.length.toLocaleString() + ' บรรทัดที่เหมือนกัน (กดเพื่อแสดง)');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        var sub = document.createDocumentFragment();
        renderEqRows(sub, ops);
        btn.replaceWith(sub);
      });
      frag.appendChild(btn);
    }

    function render() {
      if (!last) return;
      var frag = document.createDocumentFragment();
      var blocks = buildBlocks(last.ops);
      var dels = 0;
      var ins = 0;
      blocks.forEach(function (blk, idx) {
        if (blk.type === 'eq') {
          var ops = blk.ops;
          var head = idx === 0 ? 0 : DIFF_CONTEXT;
          var tail = idx === blocks.length - 1 ? 0 : DIFF_CONTEXT;
          if (ops.length <= head + tail + 1) { renderEqRows(frag, ops); return; }
          renderEqRows(frag, ops.slice(0, head));
          renderFold(frag, ops.slice(head, ops.length - tail));
          renderEqRows(frag, ops.slice(ops.length - tail));
          return;
        }
        dels += blk.dels.length;
        ins += blk.ins.length;
        // Pair the n-th removed line with the n-th added line on one row.
        var rows = Math.max(blk.dels.length, blk.ins.length);
        for (var p = 0; p < rows; p++) {
          var d = blk.dels[p];
          var n = blk.ins[p];
          var segs = d && n ? inlineSegments(last.aLines[d.a], last.bLines[n.b]) : null;
          frag.appendChild(makeRow(
            d ? { kind: '-', no: d.a + 1, content: segs ? segs.a : last.aLines[d.a] } : { kind: '', no: null, content: null },
            n ? { kind: '+', no: n.b + 1, content: segs ? segs.b : last.bLines[n.b] } : { kind: '', no: null, content: null }
          ));
        }
      });
      $result.empty()[0].appendChild(frag);

      var same = !dels && !ins;
      $same.attr('hidden', !same);
      $diffHead.attr('hidden', same);
      $result.attr('hidden', same);
      $removed.text(same ? '' : dels.toLocaleString() + ' บรรทัดที่ลบ/แก้');
      $added.text(same ? '' : ins.toLocaleString() + ' บรรทัดที่เพิ่ม/แก้');
      $resultPanel.removeAttr('hidden');
    }

    function run() {
      timer = null;
      var aText = $left.val();
      var bText = $right.val();
      if (!aText && !bText) {
        last = null;
        $result.empty();
        $resultPanel.attr('hidden', true);
        setStatus('', 'neutral');
        return;
      }
      var aLines = splitLines(aText);
      var bLines = splitLines(bText);
      if (aLines.length > DIFF_MAX_LINES || bLines.length > DIFF_MAX_LINES) {
        setStatus('ข้อความยาวเกิน ' + DIFF_MAX_LINES.toLocaleString() + ' บรรทัด', 'bad');
        return;
      }
      var ops = myersDiff(aLines.map(lineKey), bLines.map(lineKey), DIFF_MAX_EDITS);
      if (!ops) {
        setStatus('ข้อความสองชุดต่างกันมากเกินไป (เกิน ' + DIFF_MAX_EDITS.toLocaleString() + ' บรรทัด) จึงเปรียบเทียบไม่ได้', 'bad');
        return;
      }
      last = { ops: ops, aLines: aLines, bLines: bLines };
      setStatus('', 'neutral');
      render();
    }
    // Longer text waits a little longer so typing stays responsive.
    function scheduleRun() {
      if (timer) clearTimeout(timer);
      var size = $left.val().length + $right.val().length;
      timer = setTimeout(run, size > 200000 ? 600 : 200);
    }

    $left.on('input', function () { updateMeta($left, $leftMeta); scheduleRun(); });
    $right.on('input', function () { updateMeta($right, $rightMeta); scheduleRun(); });
    $optCase.add($optSpace).on('change', run);
    $('#btn-textcmp-swap').on('click', function () {
      var tmp = $left.val();
      $left.val($right.val());
      $right.val(tmp);
      updateMeta($left, $leftMeta);
      updateMeta($right, $rightMeta);
      run();
    });
    $('#btn-textcmp-clear').on('click', function () {
      $left.val('');
      $right.val('');
      updateMeta($left, $leftMeta);
      updateMeta($right, $rightMeta);
      run();
    });

    $('.textcmp-open').on('click', function () {
      fileTarget = $(this).data('target') === 'right' ? 'right' : 'left';
      $fileInput.trigger('click');
    });
    $fileInput.on('change', function () {
      var file = $fileInput[0].files[0];
      $fileInput.val('');
      if (!file || !fileTarget) return;
      if (file.size > DIFF_MAX_FILE_BYTES) { setStatus('ไฟล์ใหญ่เกิน 5 MB', 'bad'); return; }
      var $ta = fileTarget === 'right' ? $right : $left;
      var $meta = fileTarget === 'right' ? $rightMeta : $leftMeta;
      file.text().then(function (text) {
        $ta.val(text);
        updateMeta($ta, $meta);
        run();
      }).catch(function () {
        setStatus('อ่านไฟล์ไม่สำเร็จ', 'bad');
      });
    });
  }
})(jQuery);
