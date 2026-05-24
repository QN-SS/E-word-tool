/* === App Version: 2 (fixed generateUUID) === */
console.log('单词记忆 app.js v2 loaded');
/* === UUID polyfill === */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/* === State Management === */
const STORAGE_KEY = 'vocab-app-state';

const DEFAULT_STATE = {
  targetDate: null,
  words: [],
  settings: {
    rowSpacing: 'normal',
    fontSize: 'medium'
  },
  mode: 'browse',
  hiddenColumn: null
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    const saved = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...saved,
      settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
      words: (saved.words || []).map(w => ({
        id: w.id || generateUUID(),
        chinese: w.chinese || '',
        english: w.english || '',
        pos: w.pos || '',
        createdAt: w.createdAt || Date.now()
      }))
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    showToast('存储空间不足，请清理数据', 'error');
  }
}

let state = loadState();

/* === Toast === */
let toastTimer = null;

function showToast(msg, type) {
  if (type === void 0) type = '';
  var el = document.getElementById('toast');
  if (toastTimer) clearTimeout(toastTimer);
  el.textContent = msg;
  el.className = 'toast ' + type + ' show';
  toastTimer = setTimeout(function() {
    el.classList.remove('show');
    toastTimer = null;
  }, 2500);
}

/* === DOM References === */
var $ = function(id) { return document.getElementById(id); };

var wordList = $('word-list');
var countdown = $('countdown');
var countdownLabel = countdown.querySelector('.countdown-label');
var countdownDays = countdown.querySelector('.countdown-days');
var settingsOverlay = $('settings-overlay');
var settingsPanel = $('settings-panel');
var datePickerOverlay = $('date-picker-overlay');
var modeBar = $('mode-bar');

/* === Apply Settings to DOM === */
function applySettings() {
  document.body.dataset.rowSpacing = state.settings.rowSpacing;
  document.body.dataset.fontSize = state.settings.fontSize;

  var rowSpacingRadio = document.querySelector('input[name="rowSpacing"][value="' + state.settings.rowSpacing + '"]');
  if (rowSpacingRadio) rowSpacingRadio.checked = true;

  var fontSizeRadio = document.querySelector('input[name="fontSize"][value="' + state.settings.fontSize + '"]');
  if (fontSizeRadio) fontSizeRadio.checked = true;

  var dateInput = $('target-date-input');
  if (dateInput && state.targetDate) {
    dateInput.value = state.targetDate;
  }
}

/* === Countdown === */
function updateCountdown() {
  if (state.targetDate) {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var target = new Date(state.targetDate + 'T00:00:00');
    var diff = target - now;
    var days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days > 0) {
      countdownLabel.textContent = '距离目标还有';
      countdownDays.textContent = days + ' 天';
    } else if (days === 0) {
      countdownLabel.textContent = '就是今天！';
      countdownDays.textContent = '';
    } else {
      countdownLabel.textContent = '已过去';
      countdownDays.textContent = Math.abs(days) + ' 天';
    }
    countdown.classList.add('has-date');
  } else {
    countdownLabel.textContent = '点击设置目标日期';
    countdownDays.textContent = '';
    countdown.classList.remove('has-date');
  }
}

// Countdown click → show date picker dialog
countdown.addEventListener('click', function() {
  var dateInput = $('countdown-date-input');
  dateInput.value = state.targetDate || '';
  datePickerOverlay.classList.remove('hidden');
  dateInput.focus();
});

$('date-picker-cancel').addEventListener('click', function() {
  datePickerOverlay.classList.add('hidden');
});

$('date-picker-confirm').addEventListener('click', function() {
  var val = $('countdown-date-input').value;
  state.targetDate = val || null;
  saveState(state);
  updateCountdown();
  applySettings();
  datePickerOverlay.classList.add('hidden');
  if (val) {
    showToast('目标日期已设置', 'success');
  }
});

/* === Translation === */
var translateTimers = {};

function detectLang(text) {
  return /[一-鿿]/.test(text) ? 'zh' : 'en';
}

function translateWord(text, fromLang, wordId, targetField) {
  if (!text || text.trim().length === 0) return;

  var langpair = fromLang === 'zh' ? 'zh|en' : 'en|zh';
  var url = 'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text.trim()) + '&langpair=' + langpair;

  fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.responseStatus === 200 && data.responseData) {
        var translated = data.responseData.translatedText || '';
        // Clean up: remove extra info sometimes returned by MyMemory
        translated = translated.replace(/\s*\([^)]*\)\s*$/, '').trim();

        var word = state.words.find(function(w) { return w.id === wordId; });
        if (!word) return;

        if (targetField === 'english' && !word.english) {
          word.english = translated;
          saveState(state);
          renderWordList();
        } else if (targetField === 'chinese' && !word.chinese) {
          word.chinese = translated;
          saveState(state);
          renderWordList();
        }
      }
    })
    .catch(function(err) {
      console.log('Translation failed:', err.message);
    });
}

function debouncedTranslate(wordId, text, targetField) {
  var key = wordId + '_' + targetField;
  if (translateTimers[key]) clearTimeout(translateTimers[key]);
  translateTimers[key] = setTimeout(function() {
    var fromLang = targetField === 'english' ? 'zh' : 'en';
    translateWord(text, fromLang, wordId, targetField);
    translateTimers[key] = null;
  }, 600);
}

/* === Hint Generation === */
function generateHint(word, level) {
  if (!word) return '';
  var chars = word.split('');
  var totalChars = chars.length;
  var revealCount = Math.min(level + 1, totalChars); // At least first char

  var result = [];
  for (var i = 0; i < totalChars; i++) {
    if (i < revealCount) {
      result.push(chars[i]);
    } else if (chars[i] === ' ') {
      result.push(' ');
    } else {
      result.push('_');
    }
  }
  return result.join(' ');
}

/* === Render === */
function renderWordList() {
  if (state.words.length === 0) {
    wordList.innerHTML = '<div class="empty-state">' +
      '<span class="empty-state-icon">📚</span>' +
      '<span class="empty-state-text">还没有单词，点击下方按钮添加</span>' +
      '</div>';
    return;
  }

  var html = '';
  var mode = state.mode;
  var hiddenCol = state.hiddenColumn;

  for (var i = 0; i < state.words.length; i++) {
    var w = state.words[i];
    var isBrowse = mode === 'browse';
    var isCn2En = mode === 'cn2en';
    var isEn2Cn = mode === 'en2cn';

    var chineseHidden = hiddenCol === 'chinese';
    var englishHidden = hiddenCol === 'english';

    // Chinese cell content
    var chineseContent = '';
    if (isBrowse) {
      chineseContent = '<div class="cell-display" contenteditable="true" ' +
        'data-id="' + w.id + '" data-field="chinese" ' +
        'data-placeholder="输入中文">' +
        escapeHtml(w.chinese) + '</div>';
    } else if (isCn2En) {
      // Show Chinese, hide English
      chineseContent = '<div class="cell-display">' + escapeHtml(w.chinese) + '</div>';
    } else if (isEn2Cn) {
      // Hide Chinese, show input
      chineseContent = '<input class="cell-input cn-input" ' +
        'data-id="' + w.id + '" ' +
        'placeholder="输入中文释义" autocomplete="off">';
    }

    // English cell content
    var englishContent = '';
    if (isBrowse) {
      englishContent = '<div class="cell-display" contenteditable="true" ' +
        'data-id="' + w.id + '" data-field="english" ' +
        'data-placeholder="输入英文">' +
        escapeHtml(w.english) + (w.pos ? ' <span class="pos-tag">' + escapeHtml(w.pos) + '</span>' : '') +
        '</div>';
    } else if (isCn2En) {
      // Hide English, show hint + input
      var hintLevel = (w._hintLevel || 0);
      var hint = generateHint(w.english, hintLevel);
      englishContent = '<div class="hint-display" data-id="' + w.id + '">' + escapeHtml(hint || '') + '</div>' +
        '<input class="cell-input en-input" data-id="' + w.id + '" ' +
        'placeholder="输入英文拼写" autocomplete="off" autocapitalize="off">';
    } else if (isEn2Cn) {
      // Show English
      englishContent = '<div class="cell-display">' + escapeHtml(w.english) +
        (w.pos ? ' <span class="pos-tag">' + escapeHtml(w.pos) + '</span>' : '') + '</div>';
    }

    // Row actions
    var actionsHtml = '';
    if (isCn2En) {
      actionsHtml += '<button class="hint-btn" data-action="hint" data-id="' + w.id + '" title="提示">💡</button>';
      actionsHtml += '<button class="submit-btn" data-action="submit-en" data-id="' + w.id + '" title="提交">✓</button>';
    } else if (isEn2Cn) {
      actionsHtml += '<button class="submit-btn" data-action="submit-cn" data-id="' + w.id + '" title="提交">✓</button>';
    }
    actionsHtml += '<button class="delete-btn" data-action="delete" data-id="' + w.id + '" title="删除">🗑</button>';

    // Build row
    var rowClass = 'word-row';
    if (isBrowse && chineseHidden) rowClass += ' col-hidden col-chinese-hidden';
    if (isBrowse && englishHidden) rowClass += ' col-hidden col-english-hidden';

    html += '<div class="' + rowClass + '" data-id="' + w.id + '">' +
      '<div class="cell chinese-cell">' + chineseContent + '</div>' +
      '<div class="cell-divider"></div>' +
      '<div class="cell english-cell">' + englishContent + '</div>' +
      '<div class="row-actions">' + actionsHtml + '</div>' +
      '</div>';

    // Answer feedback area for practice modes
    if (isCn2En || isEn2Cn) {
      html += '<div class="feedback-row" data-id="' + w.id + '" style="display:none">' +
        '<div class="feedback-msg"></div>' +
        '</div>';
    }
  }

  wordList.innerHTML = html;

  // Update column header hide buttons
  updateColumnHeaderButtons();
}

function updateColumnHeaderButtons() {
  var btns = document.querySelectorAll('.hide-col-btn');
  for (var i = 0; i < btns.length; i++) {
    var col = btns[i].dataset.col;
    if (state.hiddenColumn === col) {
      btns[i].classList.add('col-hidden');
      btns[i].title = '显示' + (col === 'chinese' ? '中文' : '英文') + '栏';
    } else {
      btns[i].classList.remove('col-hidden');
      btns[i].title = '隐藏' + (col === 'chinese' ? '中文' : '英文') + '栏';
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* === Mode Switching === */
function setMode(mode) {
  state.mode = mode;
  // Reset hidden column when leaving browse mode
  if (mode !== 'browse') {
    state.hiddenColumn = null;
  }
  // Reset hint levels when switching modes
  state.words.forEach(function(w) {
    w._hintLevel = 0;
  });
  saveState(state);
  updateModeButtons();
  renderWordList();
}

function updateModeButtons() {
  var btns = document.querySelectorAll('.mode-btn');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].dataset.mode === state.mode) {
      btns[i].classList.add('active');
    } else {
      btns[i].classList.remove('active');
    }
  }
}

modeBar.addEventListener('click', function(e) {
  var btn = e.target.closest('.mode-btn');
  if (!btn) return;
  var mode = btn.dataset.mode;
  if (mode && mode !== state.mode) {
    setMode(mode);
  }
});

/* === Column Hide/Show (Browse mode) === */
document.querySelector('.table-header').addEventListener('click', function(e) {
  var btn = e.target.closest('.hide-col-btn');
  if (!btn) return;
  var col = btn.dataset.col;
  if (state.mode !== 'browse') return;

  if (state.hiddenColumn === col) {
    state.hiddenColumn = null;
  } else {
    state.hiddenColumn = col;
  }
  saveState(state);
  // Update visibility without full re-render
  var rows = document.querySelectorAll('.word-row');
  for (var i = 0; i < rows.length; i++) {
    if (state.hiddenColumn === 'chinese') {
      rows[i].classList.add('col-chinese-hidden');
      rows[i].classList.remove('col-english-hidden');
    } else if (state.hiddenColumn === 'english') {
      rows[i].classList.add('col-english-hidden');
      rows[i].classList.remove('col-chinese-hidden');
    } else {
      rows[i].classList.remove('col-chinese-hidden', 'col-english-hidden');
    }
  }
  updateColumnHeaderButtons();
});

// Apply column visibility based on hiddenColumn
function applyColumnVisibility() {
  var rows = document.querySelectorAll('.word-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.remove('col-chinese-hidden', 'col-english-hidden');
    if (state.hiddenColumn === 'chinese') {
      rows[i].classList.add('col-chinese-hidden');
    } else if (state.hiddenColumn === 'english') {
      rows[i].classList.add('col-english-hidden');
    }
  }
}

/* === Word List Event Delegation === */
wordList.addEventListener('click', function(e) {
  var target = e.target;

  // Hint button
  if (target.dataset.action === 'hint') {
    var wordId = target.dataset.id;
    var word = state.words.find(function(w) { return w.id === wordId; });
    if (!word) return;
    word._hintLevel = (word._hintLevel || 0) + 1;
    // Update hint display
    var hintEl = wordList.querySelector('.hint-display[data-id="' + wordId + '"]');
    if (hintEl) {
      hintEl.textContent = generateHint(word.english, word._hintLevel);
    }
    return;
  }

  // Submit English (CN→EN mode)
  if (target.dataset.action === 'submit-en') {
    var wordId = target.dataset.id;
    var word = state.words.find(function(w) { return w.id === wordId; });
    if (!word) return;
    var input = wordList.querySelector('.en-input[data-id="' + wordId + '"]');
    if (!input) return;
    var userAnswer = input.value.trim();
    checkSpellingAnswer(word, userAnswer, input);
    return;
  }

  // Submit Chinese (EN→CN mode)
  if (target.dataset.action === 'submit-cn') {
    var wordId = target.dataset.id;
    var word = state.words.find(function(w) { return w.id === wordId; });
    if (!word) return;
    var input = wordList.querySelector('.cn-input[data-id="' + wordId + '"]');
    if (!input) return;
    var userAnswer = input.value.trim();
    checkChineseAnswer(word, userAnswer, input);
    return;
  }

  // Delete word
  if (target.dataset.action === 'delete') {
    var wordId = target.dataset.id;
    if (confirm('确定要删除这个单词吗？')) {
      state.words = state.words.filter(function(w) { return w.id !== wordId; });
      saveState(state);
      renderWordList();
      applyColumnVisibility();
      showToast('单词已删除', 'success');
    }
    return;
  }
});

function checkSpellingAnswer(word, userAnswer, inputEl) {
  // Remove feedback row if exists
  var feedbackRow = wordList.querySelector('.feedback-row[data-id="' + word.id + '"]');
  var feedbackMsg = feedbackRow ? feedbackRow.querySelector('.feedback-msg') : null;

  if (!userAnswer) {
    if (feedbackRow) feedbackRow.style.display = 'none';
    inputEl.classList.remove('input-wrong', 'input-correct');
    return;
  }

  var correct = word.english.trim().toLowerCase();
  var user = userAnswer.trim().toLowerCase();

  if (correct === user) {
    inputEl.classList.remove('input-wrong');
    inputEl.classList.add('input-correct');
    inputEl.disabled = true;
    // Show full answer
    var hintEl = wordList.querySelector('.hint-display[data-id="' + word.id + '"]');
    if (hintEl) {
      hintEl.innerHTML = '<span class="answer-reveal">' + escapeHtml(word.english) + '</span>';
    }
    if (feedbackRow && feedbackMsg) {
      feedbackRow.style.display = 'flex';
      feedbackMsg.innerHTML = '✅ 回答正确！';
      feedbackMsg.style.color = 'var(--color-success)';
    }
    showToast('回答正确！', 'success');
  } else {
    inputEl.classList.add('input-wrong');
    inputEl.classList.remove('input-correct');
    if (feedbackRow && feedbackMsg) {
      feedbackRow.style.display = 'flex';
      feedbackMsg.innerHTML = '❌ 不正确，请再试一次';
      feedbackMsg.style.color = 'var(--color-error)';
    }
  }
}

function checkChineseAnswer(word, userAnswer, inputEl) {
  var feedbackRow = wordList.querySelector('.feedback-row[data-id="' + word.id + '"]');
  var feedbackMsg = feedbackRow ? feedbackRow.querySelector('.feedback-msg') : null;

  if (!userAnswer) {
    if (feedbackRow) feedbackRow.style.display = 'none';
    inputEl.classList.remove('input-wrong', 'input-correct');
    return;
  }

  // Fuzzy match: remove spaces, compare
  var correct = word.chinese.trim().replace(/\s+/g, '');
  var user = userAnswer.trim().replace(/\s+/g, '');

  if (correct === user) {
    inputEl.classList.remove('input-wrong');
    inputEl.classList.add('input-correct');
    inputEl.disabled = true;
    if (feedbackRow && feedbackMsg) {
      feedbackRow.style.display = 'flex';
      feedbackMsg.innerHTML = '✅ 回答正确！';
      feedbackMsg.style.color = 'var(--color-success)';
    }
    showToast('回答正确！', 'success');
  } else {
    inputEl.classList.add('input-wrong');
    inputEl.classList.remove('input-correct');
    if (feedbackRow && feedbackMsg) {
      feedbackRow.style.display = 'flex';
      feedbackMsg.innerHTML = '❌ 不正确，请再试一次';
      feedbackMsg.style.color = 'var(--color-error)';
    }
  }
}

// Unified input handler for both practice mode inputs and contenteditable cells
wordList.addEventListener('input', function(e) {
  var input = e.target;

  // Handle practice mode <input> elements
  if (input.classList.contains('en-input') || input.classList.contains('cn-input')) {
    if (input.classList.contains('input-correct')) return;
    input.classList.remove('input-wrong');
    return;
  }

  // Handle contenteditable cells (browse mode)
  var cell = e.target.closest('.cell-display[contenteditable]');
  if (!cell) return;

  var wordId = cell.dataset.id;
  var field = cell.dataset.field;
  var word = state.words.find(function(w) { return w.id === wordId; });
  if (!word) return;

  var text = cell.textContent || '';
  word[field] = text;

  // Trigger translation if other field is empty
  if (text.trim()) {
    var otherField = field === 'chinese' ? 'english' : 'chinese';
    if (!word[otherField]) {
      debouncedTranslate(wordId, text, otherField);
    }
  }

  saveState(state);
});

// Handle paste (strip formatting)
wordList.addEventListener('paste', function(e) {
  var cell = e.target.closest('.cell-display[contenteditable]');
  if (!cell) return;
  e.preventDefault();
  var text = (e.clipboardData || window.clipboardData).getData('text/plain');
  // Insert plain text at cursor position
  var sel = window.getSelection();
  if (sel.rangeCount) {
    var range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  // Trigger input event to save state
  cell.dispatchEvent(new Event('input', { bubbles: true }));
});

/* === Add Word === */
var addWordBtn = $('add-word-btn');
if (addWordBtn) {
  addWordBtn.addEventListener('click', function() {
    var newWord = {
      id: generateUUID(),
      chinese: '',
      english: '',
      pos: '',
      createdAt: Date.now(),
      _hintLevel: 0
    };
    state.words.push(newWord);
    saveState(state);
    renderWordList();
    applyColumnVisibility();

    // Focus the first empty cell
    setTimeout(function() {
      if (state.mode === 'browse') {
        var chineseCell = wordList.querySelector('.cell-display[data-id="' + newWord.id + '"][data-field="chinese"]');
        if (chineseCell) chineseCell.focus();
      }
      // Scroll to bottom
      var lastChild = wordList.lastElementChild;
      if (lastChild) {
        lastChild.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  });
} else {
  console.error('Add word button not found in DOM');
}

/* === Settings Panel === */
$('settings-toggle').addEventListener('click', function() {
  // Update form values
  $('target-date-input').value = state.targetDate || '';
  var rowSpacingRadio = document.querySelector('input[name="rowSpacing"][value="' + state.settings.rowSpacing + '"]');
  if (rowSpacingRadio) rowSpacingRadio.checked = true;
  var fontSizeRadio = document.querySelector('input[name="fontSize"][value="' + state.settings.fontSize + '"]');
  if (fontSizeRadio) fontSizeRadio.checked = true;
  settingsOverlay.classList.remove('hidden');
});

$('settings-close').addEventListener('click', function() {
  settingsOverlay.classList.add('hidden');
});

settingsOverlay.addEventListener('click', function(e) {
  if (e.target === settingsOverlay) {
    settingsOverlay.classList.add('hidden');
  }
});

// Settings: target date
$('target-date-input').addEventListener('change', function() {
  state.targetDate = this.value || null;
  saveState(state);
  updateCountdown();
});

// Settings: row spacing
var rowSpacingRadios = document.getElementsByName('rowSpacing');
for (var i = 0; i < rowSpacingRadios.length; i++) {
  rowSpacingRadios[i].addEventListener('change', function() {
    if (this.checked) {
      state.settings.rowSpacing = this.value;
      saveState(state);
      applySettings();
    }
  });
}

// Settings: font size
var fontSizeRadios = document.getElementsByName('fontSize');
for (var i = 0; i < fontSizeRadios.length; i++) {
  fontSizeRadios[i].addEventListener('change', function() {
    if (this.checked) {
      state.settings.fontSize = this.value;
      saveState(state);
      applySettings();
    }
  });
}

// Settings: export data
$('export-data-btn').addEventListener('click', function() {
  var dataStr = JSON.stringify(state, null, 2);
  var blob = new Blob([dataStr], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'vocab-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('数据已导出', 'success');
});

// Settings: import data
$('import-data-btn').addEventListener('click', function() {
  $('import-file-input').click();
});

$('import-file-input').addEventListener('change', function() {
  var file = this.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var imported = JSON.parse(e.target.result);
      if (!imported.words || !Array.isArray(imported.words)) {
        throw new Error('Invalid data');
      }
      if (confirm('导入将覆盖当前数据，确定继续吗？')) {
        state = {
          ...JSON.parse(JSON.stringify(DEFAULT_STATE)),
          ...imported,
          settings: { ...DEFAULT_STATE.settings, ...(imported.settings || {}) },
          words: (imported.words || []).map(function(w) {
            return {
              id: w.id || generateUUID(),
              chinese: w.chinese || '',
              english: w.english || '',
              pos: w.pos || '',
              createdAt: w.createdAt || Date.now(),
              _hintLevel: 0
            };
          })
        };
        saveState(state);
        applySettings();
        updateCountdown();
        updateModeButtons();
        renderWordList();
        applyColumnVisibility();
        showToast('数据已导入', 'success');
      }
    } catch (err) {
      showToast('文件格式错误，无法导入', 'error');
    }
  };
  reader.readAsText(file);
  this.value = '';
});

// Settings: clear data
$('clear-data-btn').addEventListener('click', function() {
  if (confirm('确定要清除所有数据吗？此操作不可撤销！')) {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    saveState(state);
    applySettings();
    updateCountdown();
    updateModeButtons();
    renderWordList();
    showToast('数据已清除', 'success');
  }
});

// Close overlays on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    settingsOverlay.classList.add('hidden');
    datePickerOverlay.classList.add('hidden');
  }
});

// Submit on Enter in practice mode inputs
wordList.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  var input = e.target;
  if (input.classList.contains('en-input')) {
    e.preventDefault();
    var submitBtn = wordList.querySelector('.submit-btn[data-id="' + input.dataset.id + '"][data-action="submit-en"]');
    if (submitBtn) submitBtn.click();
  } else if (input.classList.contains('cn-input')) {
    e.preventDefault();
    var submitBtn = wordList.querySelector('.submit-btn[data-id="' + input.dataset.id + '"][data-action="submit-cn"]');
    if (submitBtn) submitBtn.click();
  }
});

/* === Service Worker Registration === */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').then(function(reg) {
      console.log('SW registered:', reg.scope);
    }).catch(function(err) {
      console.log('SW registration failed:', err);
    });
  });
}

/* === Initialization === */
function init() {
  applySettings();
  updateCountdown();
  updateModeButtons();
  renderWordList();
  applyColumnVisibility();
}

init();
