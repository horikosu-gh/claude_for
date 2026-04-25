/* ===========================================================
   ホリコシ産業 エネルギーニュース 取得・表示スクリプト
   - Google ニュース RSS を rss2json 経由で取得
   - 英語タイトルは MyMemory 翻訳APIで日本語に変換
   =========================================================== */

(function () {
  'use strict';

  // ---------- カテゴリ定義（日本語＋英語キーワード） ----------
  // 各カテゴリは複数キーワードを OR 連結（Google News の "OR" 構文）
  var CATEGORIES = [
    {
      id: 'all',
      label: 'すべて',
      // 全カテゴリ表示（個別取得結果を統合）
      keywords: null
    },
    {
      id: 'lpgas',
      label: 'LPガス・都市ガス',
      keywords: '"LPガス" OR "プロパンガス" OR "都市ガス" OR "LP gas" OR "propane price" OR "city gas"'
    },
    {
      id: 'electricity',
      label: '電力料金',
      keywords: '"電気料金" OR "電力料金" OR "電気代" OR "electricity price" OR "power rate" OR "power tariff"'
    },
    {
      id: 'oil_lng',
      label: '原油・LNG',
      keywords: '"原油価格" OR "WTI" OR "ブレント" OR "LNG" OR "天然ガス" OR "crude oil price" OR "natural gas price"'
    },
    {
      id: 'geopolitics',
      label: '地政学リスク',
      keywords: '"中東情勢" OR "ホルムズ海峡" OR "ウクライナ" OR "OPEC" OR "Middle East" OR "Strait of Hormuz" OR "geopolitical risk"'
    },
    {
      id: 'fx',
      label: '為替・経済',
      keywords: '"円安 エネルギー" OR "資源価格" OR "energy inflation" OR "yen energy" OR "commodity price"'
    }
  ];

  // ---------- 設定 ----------
  var RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
  // Google ニュース日本版（hl=ja, gl=JP, ceid=JP:ja）→ 日本語ソースが優先される
  var GNEWS_BASE = 'https://news.google.com/rss/search?hl=ja&gl=JP&ceid=JP:ja&q=';
  var ITEMS_PER_CATEGORY = 15;
  var TRANSLATE_API = 'https://api.mymemory.translated.net/get';
  // ローカルストレージのキー（翻訳結果キャッシュ）
  var TRANSLATION_CACHE_KEY = 'horikoshi_news_translation_cache_v1';
  // セッションストレージで取得済み記事をキャッシュ（リロード時の重複APIコール削減）
  var FEED_CACHE_KEY_PREFIX = 'horikoshi_news_feed_';
  var FEED_CACHE_TTL_MS = 10 * 60 * 1000; // 10分

  // ---------- DOM 要素 ----------
  var $tabs, $list, $status, $lastUpdated, $refreshBtn;
  var currentCategory = 'all';
  var translationCache = loadTranslationCache();

  // ---------- ユーティリティ ----------
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripHTML(str) {
    if (!str) return '';
    var tmp = document.createElement('div');
    tmp.innerHTML = str;
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return y + '/' + m + '/' + day + ' ' + hh + ':' + mm;
  }

  // 英語かどうかの簡易判定（ASCII文字比率が高い場合）
  function isEnglish(text) {
    if (!text) return false;
    var ascii = text.match(/[A-Za-z]/g);
    var asciiCount = ascii ? ascii.length : 0;
    var total = text.replace(/\s/g, '').length;
    if (total === 0) return false;
    // 日本語（ひらがな・カタカナ・漢字）が含まれていれば日本語扱い
    if (/[぀-ゟ゠-ヿ一-鿿]/.test(text)) return false;
    // ASCII比率が80%以上なら英語と判定
    return (asciiCount / total) > 0.5;
  }

  // ---------- 翻訳キャッシュ ----------
  function loadTranslationCache() {
    try {
      var raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveTranslationCache() {
    try {
      // 1000件を超えたら古いものから削除
      var keys = Object.keys(translationCache);
      if (keys.length > 1000) {
        var trimmed = {};
        keys.slice(-800).forEach(function (k) { trimmed[k] = translationCache[k]; });
        translationCache = trimmed;
      }
      localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(translationCache));
    } catch (e) { /* QuotaExceededなどは無視 */ }
  }

  // ---------- 翻訳 ----------
  function translateToJa(text) {
    if (!text) return Promise.resolve('');
    if (translationCache[text]) {
      return Promise.resolve(translationCache[text]);
    }
    var url = TRANSLATE_API + '?q=' + encodeURIComponent(text) + '&langpair=en|ja';
    return fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var translated = (data && data.responseData && data.responseData.translatedText) || text;
        translationCache[text] = translated;
        return translated;
      })
      .catch(function () { return text; });
  }

  // ---------- フィード取得 ----------
  function getFeedCache(key) {
    try {
      var raw = sessionStorage.getItem(FEED_CACHE_KEY_PREFIX + key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.t > FEED_CACHE_TTL_MS) return null;
      return obj.items;
    } catch (e) { return null; }
  }

  function setFeedCache(key, items) {
    try {
      sessionStorage.setItem(FEED_CACHE_KEY_PREFIX + key, JSON.stringify({ t: Date.now(), items: items }));
    } catch (e) {}
  }

  function fetchCategory(cat, forceRefresh) {
    if (!cat.keywords) return Promise.resolve([]); // 'all' は別ロジック

    var cacheKey = cat.id;
    if (!forceRefresh) {
      var cached = getFeedCache(cacheKey);
      if (cached) return Promise.resolve(cached);
    }

    var rssUrl = GNEWS_BASE + encodeURIComponent(cat.keywords);
    // rss2json の count パラメータは有料プラン専用なので使わない（JS側で件数制限）
    var apiUrl = RSS2JSON + encodeURIComponent(rssUrl);

    return fetch(apiUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.status !== 'ok' || !data.items) {
          throw new Error(data && data.message ? data.message : 'RSS取得に失敗しました');
        }
        var items = data.items.slice(0, ITEMS_PER_CATEGORY).map(function (item) {
          return {
            title: stripHTML(item.title || ''),
            description: stripHTML(item.description || ''),
            link: item.link || '#',
            pubDate: item.pubDate || '',
            source: extractSource(item),
            category: cat.id,
            categoryLabel: cat.label
          };
        });
        setFeedCache(cacheKey, items);
        return items;
      });
  }

  // Google ニュースのタイトル末尾は " - メディア名" になることが多いのでそこから抽出
  function extractSource(item) {
    if (item.author) return item.author;
    var t = item.title || '';
    var m = t.match(/\s-\s([^-]+)$/);
    if (m) return m[1].trim();
    return '';
  }

  // ---------- 取得＆翻訳パイプライン ----------
  function fetchAll(forceRefresh) {
    var targets = CATEGORIES.filter(function (c) { return c.keywords; });
    return Promise.all(targets.map(function (c) {
      return fetchCategory(c, forceRefresh).catch(function (err) {
        console.warn('[news.js] 取得失敗:', c.id, err);
        return [];
      });
    })).then(function (arrays) {
      var merged = [];
      arrays.forEach(function (arr) { merged = merged.concat(arr); });
      // 日付降順で並び替え
      merged.sort(function (a, b) {
        return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
      });
      // タイトル重複除去
      var seen = {};
      var dedup = [];
      merged.forEach(function (it) {
        var key = it.title.replace(/\s/g, '').toLowerCase();
        if (!seen[key]) { seen[key] = 1; dedup.push(it); }
      });
      return dedup;
    });
  }

  // 英語記事のタイトルだけ翻訳（説明文は文字数制限のため翻訳しない）
  function translateItems(items) {
    var jobs = items.map(function (it) {
      // タイトル末尾の " - 媒体名" を分離して翻訳対象から除外
      var srcSuffix = '';
      var titleBody = it.title;
      var m = titleBody.match(/^(.*?)(\s-\s[^-]+)$/);
      if (m) { titleBody = m[1]; srcSuffix = m[2]; }

      if (!isEnglish(titleBody)) {
        it.titleDisplay = titleBody + srcSuffix;
        return Promise.resolve(it);
      }
      return translateToJa(titleBody).then(function (ja) {
        it.titleDisplay = ja + srcSuffix;
        it.translated = true;
        return it;
      });
    });
    return Promise.all(jobs).then(function (results) {
      saveTranslationCache();
      return results;
    });
  }

  // ---------- 描画 ----------
  function showStatus(html, isError) {
    $status.innerHTML = html;
    $status.style.display = 'block';
    $status.classList.toggle('is-error', !!isError);
    $list.innerHTML = '';
  }

  function hideStatus() {
    $status.style.display = 'none';
  }

  function renderList(items) {
    if (!items.length) {
      showStatus('表示できる記事がありません。');
      return;
    }
    hideStatus();
    var html = items.map(function (it) {
      var displayTitle = it.titleDisplay || it.title;
      var translatedTag = it.translated ? '<span class="news-translated-tag">JA</span>' : '';
      return '<li class="news-item">' +
        '<a class="news-link" href="' + escapeHTML(it.link) + '" target="_blank" rel="noopener">' +
          '<div class="news-meta">' +
            '<span class="news-date">' + escapeHTML(formatDate(it.pubDate)) + '</span>' +
            (it.source ? '<span class="news-source">' + escapeHTML(it.source) + '</span>' : '') +
          '</div>' +
          '<div class="news-body">' +
            '<h3>' + escapeHTML(displayTitle) + translatedTag + '</h3>' +
            (it.description ? '<p>' + escapeHTML(it.description) + '</p>' : '') +
          '</div>' +
        '</a>' +
      '</li>';
    }).join('');
    $list.innerHTML = html;
  }

  function filterByCategory(allItems, catId) {
    if (catId === 'all') return allItems;
    return allItems.filter(function (it) { return it.category === catId; });
  }

  // ---------- メイン ----------
  var allItemsCache = [];

  function load(forceRefresh) {
    showStatus('<div class="spinner"></div><div>ニュースを取得中...</div>');
    if ($refreshBtn) $refreshBtn.disabled = true;

    fetchAll(forceRefresh)
      .then(function (items) { return translateItems(items); })
      .then(function (items) {
        allItemsCache = items;
        renderList(filterByCategory(items, currentCategory));
        $lastUpdated.innerHTML = '最終更新 <strong>' + formatDate(new Date()) + '</strong>';
      })
      .catch(function (err) {
        console.error(err);
        showStatus(
          'ニュースの取得に失敗しました。<br>' +
          '時間をおいて再度お試しください。<br>' +
          '<small style="color:#999">' + escapeHTML(err.message || '') + '</small>',
          true
        );
      })
      .then(function () {
        if ($refreshBtn) $refreshBtn.disabled = false;
      });
  }

  // ---------- カテゴリタブ生成 ----------
  function buildTabs() {
    $tabs.innerHTML = CATEGORIES.map(function (c) {
      return '<button class="tab-btn' + (c.id === currentCategory ? ' is-active' : '') +
             '" data-cat="' + c.id + '">' + escapeHTML(c.label) + '</button>';
    }).join('');

    $tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      var cat = btn.getAttribute('data-cat');
      if (cat === currentCategory) return;
      currentCategory = cat;
      $$('.tab-btn').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      renderList(filterByCategory(allItemsCache, currentCategory));
    });
  }

  // ---------- 起動 ----------
  function init() {
    $tabs = $('#categoryTabs');
    $list = $('#newsList');
    $status = $('#newsStatus');
    $lastUpdated = $('#lastUpdated');
    $refreshBtn = $('#refreshBtn');

    if (!$tabs || !$list || !$status) {
      console.warn('[news.js] 必要なDOM要素が見つかりません');
      return;
    }

    buildTabs();

    if ($refreshBtn) {
      $refreshBtn.addEventListener('click', function () { load(true); });
    }

    load(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
