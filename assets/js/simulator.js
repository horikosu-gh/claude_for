/* ===========================================================
   ホリコシ産業 LPガス料金シミュレーター
   標準料金プラン（基本料金＋3段階従量制）に基づく試算
   =========================================================== */

(function () {
  'use strict';

  // ===== 料金プラン定義 =====
  var RATE_PLAN = {
    baseFee: 1750,
    tiers: [
      { upTo: 8,    rate: 675 },
      { upTo: 15,   rate: 590 },
      { upTo: 9999, rate: 560 }
    ],
    taxRate: 0.10
  };

  // ===== 世帯人数別の通年平均使用量（m³/月） =====
  var PEOPLE_BASE = { 1: 5.0, 2: 7.0, 3: 8.5, 4: 10.5, 5: 12.0 };

  // ===== 計算ロジック =====
  function calcBill(usage) {
    var u = Math.max(0, Number(usage) || 0);
    var baseFee = RATE_PLAN.baseFee;
    var unitFee = 0;
    var prev = 0;
    for (var i = 0; i < RATE_PLAN.tiers.length; i++) {
      var t = RATE_PLAN.tiers[i];
      var upper = Math.min(u, t.upTo);
      if (upper > prev) {
        unitFee += (upper - prev) * t.rate;
        prev = upper;
      }
      if (u <= t.upTo) break;
    }
    var subtotal = baseFee + unitFee;
    var tax = Math.round(subtotal * RATE_PLAN.taxRate);
    var total = subtotal + tax;
    return {
      usage: u,
      baseFee: baseFee,
      unitFee: Math.round(unitFee),
      subtotal: Math.round(subtotal),
      tax: tax,
      total: total
    };
  }

  function fmt(n) { return Math.round(n).toLocaleString('ja-JP'); }

  // ===== タブ切替 =====
  document.querySelectorAll('.sim-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.dataset.tab;
      document.querySelectorAll('.sim-tab').forEach(function (t) {
        t.classList.toggle('active', t === tab);
      });
      document.querySelectorAll('.sim-panel').forEach(function (p) {
        p.classList.toggle('active', p.id === 'panel-' + target);
      });
    });
  });

  // ===== 直接入力モード =====
  var usageInput = document.getElementById('usage-input');

  function renderDirect() {
    if (!usageInput) return;
    var usage = Math.max(0, parseFloat(usageInput.value) || 0);
    var r = calcBill(usage);
    setText('amount-direct', fmt(r.total));
    setText('year-direct', fmt(r.total * 12));
    setText('base-direct', fmt(r.baseFee));
    setText('unit-direct', fmt(r.unitFee));
    setText('sub-direct', fmt(r.subtotal));
    setText('tax-direct', fmt(r.tax));
    setText('total-direct', fmt(r.total));
    setText('usage-disp-direct', usage.toFixed(1));
  }

  if (usageInput) {
    usageInput.addEventListener('input', renderDirect);
  }

  document.querySelectorAll('.quick-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!usageInput) return;
      usageInput.value = btn.dataset.usage;
      renderDirect();
    });
  });

  // ===== 推定モード（世帯人数＋機器） =====
  var selectedPeople = 2;

  function calcEstimatedUsage() {
    var usage = PEOPLE_BASE[selectedPeople] || 12.0;
    document.querySelectorAll('#eq-grid input[type="checkbox"]:checked').forEach(function (cb) {
      usage += parseFloat(cb.dataset.add) || 0;
    });
    return usage;
  }

  function renderEstimate() {
    var usage = calcEstimatedUsage();
    var r = calcBill(usage);
    setText('amount-est', fmt(r.total));
    setText('year-est', fmt(r.total * 12));
    setText('base-est', fmt(r.baseFee));
    setText('unit-est', fmt(r.unitFee));
    setText('sub-est', fmt(r.subtotal));
    setText('tax-est', fmt(r.tax));
    setText('total-est', fmt(r.total));
    setText('usage-disp-est', usage.toFixed(1));
    setText('est-usage', usage.toFixed(1));
  }

  document.querySelectorAll('#people-grid .people-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#people-grid .people-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      selectedPeople = parseInt(btn.dataset.people, 10);
      renderEstimate();
    });
  });

  document.querySelectorAll('#eq-grid input[type="checkbox"]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      cb.closest('.eq-item').classList.toggle('checked', cb.checked);
      renderEstimate();
    });
  });

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ===========================================================
  // 値上げ影響シミュレーター
  // 計算式：月額負担増（税抜） = 使用量 × 値上げ幅
  //         月額負担増（税込） = 月額負担増（税抜） × (1 + 税率)
  // ===========================================================

  // 使用量帯（実績平均値ベース。値上げ幅の入力に応じて連動再計算）
  var INCREASE_BANDS = [
    { label: '〜2 m³',     avg: 0.91,  persona: '休止中・別荘など' },
    { label: '2〜5 m³',    avg: 3.41,  persona: '単身・高齢世帯' },
    { label: '5〜10 m³',   avg: 7.27,  persona: '一般的なご家庭（最多）' },
    { label: '10〜15 m³',  avg: 12.23, persona: 'ご家族世帯' },
    { label: '15〜20 m³',  avg: 16.74, persona: '大家族・小規模店' },
    { label: '20〜30 m³',  avg: 23.12, persona: '店舗・小規模事業所' },
    { label: '30〜50 m³',  avg: 34.16, persona: '飲食店など' },
    { label: '50〜100 m³', avg: 57.44, persona: '業務用（飲食・介護等）' },
    { label: '100〜200 m³',avg: 155.64,persona: '大口のお客様' },
    { label: '200 m³〜',   avg: 266.05,persona: '超大口のお客様' }
  ];

  var TAX_RATE = 0.10;
  var incUsageInput = document.getElementById('inc-usage-input');
  var incRateInput  = document.getElementById('inc-rate-input');
  var incRefTbody   = document.getElementById('inc-ref-table-body');

  function getIncreaseRate() {
    if (!incRateInput) return 55;
    var v = parseFloat(incRateInput.value);
    if (isNaN(v) || v < 0) return 0;
    return v;
  }

  function getIncreaseUsage() {
    if (!incUsageInput) return 0;
    var v = parseFloat(incUsageInput.value);
    if (isNaN(v) || v < 0) return 0;
    return v;
  }

  function renderIncrease() {
    if (!incUsageInput || !incRateInput) return;
    var usage = getIncreaseUsage();
    var rateExcl = getIncreaseRate();
    var rateIncl = rateExcl * (1 + TAX_RATE);

    var monthlyExcl = usage * rateExcl;
    var tax = Math.round(monthlyExcl * TAX_RATE);
    var monthlyIncl = Math.round(monthlyExcl + tax);
    var yearlyIncl = monthlyIncl * 12;

    setText('inc-rate-tax', rateIncl.toFixed(1));
    setText('inc-monthly', fmt(monthlyIncl));
    setText('inc-yearly', fmt(yearlyIncl));
    setText('inc-usage-disp', usage.toFixed(1));
    setText('inc-rate-disp', rateExcl.toFixed(1));
    setText('inc-monthly-excl', fmt(Math.round(monthlyExcl)));
    setText('inc-tax', fmt(tax));
    setText('inc-monthly-incl', fmt(monthlyIncl));
    setText('inc-rate-disp2', rateExcl.toFixed(1));

    renderIncreaseTable(rateExcl);
  }

  function renderIncreaseTable(rateExcl) {
    if (!incRefTbody) return;
    var rateIncl = rateExcl * (1 + TAX_RATE);
    var html = INCREASE_BANDS.map(function (b) {
      var monthly = Math.round(b.avg * rateIncl);
      var yearly = monthly * 12;
      return '<tr>' +
        '<td>' + b.label + '</td>' +
        '<td class="persona">' + b.persona + '</td>' +
        '<td class="num">約 ' + fmt(monthly) + ' 円</td>' +
        '<td class="num">約 ' + fmt(yearly) + ' 円</td>' +
      '</tr>';
    }).join('');
    incRefTbody.innerHTML = html;
  }

  if (incUsageInput) incUsageInput.addEventListener('input', renderIncrease);
  if (incRateInput)  incRateInput.addEventListener('input', renderIncrease);

  // 値上げシミュレーターのクイックボタン（data-inc-usage 属性）
  document.querySelectorAll('.quick-btn[data-inc-usage]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!incUsageInput) return;
      incUsageInput.value = btn.dataset.incUsage;
      renderIncrease();
    });
  });

  // ===== 初期描画 =====
  renderDirect();
  renderEstimate();
  renderIncrease();
})();
