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

  var TAX_RATE = 0.10;
  var incUsageInput = document.getElementById('inc-usage-input');
  var incRateInput  = document.getElementById('inc-rate-input');

  function getIncreaseRate() {
    if (!incRateInput) return 0;
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

  // ===========================================================
  // LPガス併用 vs オール電化 10年比較シミュレーター
  //
  // ・LP併用：LPガス代（当社標準料金プラン）＋電気代（中部電力ミライズ ポイントプラン）
  // ・オール電化：電気代のみ（中部電力ミライズ スマートライフプラン）
  // ・燃料費調整額・再エネ賦課金は両家庭に同じ単価で加算（公平のため）
  // ・初期費用と10年トータルコストも比較
  //
  // 単価出典：中部電力ミライズ公式サイト（2026年4月時点・税込）
  //   - スマートライフプラン: ナイト16.52 / ホーム28.61 / デイ38.80 円/kWh, 基本1,838.44円
  //   - ポイントプラン: 基本963.42円(30A), 21.20/25.67/28.62 円/kWh
  //   - 燃料費調整額（低圧）: -1.50 円/kWh（2026年4月分）
  //   - 再エネ賦課金: 4.18 円/kWh（2026年度）
  // ===========================================================

  var ELECTRIC_RATES = {
    pointPlan: {
      baseFee: 963.42,
      tiers: [
        { upTo: 120,    rate: 21.20 },
        { upTo: 300,    rate: 25.67 },
        { upTo: 999999, rate: 28.62 }
      ]
    },
    smartLife: {
      baseFee: 1838.44,
      night: 16.52,
      home:  28.61,
      day:   38.80,
      // 標準的なオール電化家庭の時間帯使用比率（夜間蓄熱・エコキュート沸き上げ前提）
      nightRatio: 0.50,
      homeRatio:  0.30,
      dayRatio:   0.20
    },
    fuelAdj:   -1.50, // 円/kWh（2026年4月、低圧）
    renewable:  4.18  // 円/kWh（2026年度）
  };

  // 世帯人数別 月平均電気使用量（kWh） - LP併用 / オール電化
  // 出典：エネチェンジ・経産省資源エネルギー庁・各種調査の中央値
  var HOUSEHOLDS = {
    1: { lpgKwh: 200, allKwh: 320, label: '1人' },
    2: { lpgKwh: 320, allKwh: 480, label: '2人' },
    3: { lpgKwh: 380, allKwh: 570, label: '3人' },
    4: { lpgKwh: 430, allKwh: 670, label: '4人' },
    5: { lpgKwh: 500, allKwh: 800, label: '5人以上' }
  };

  // 初期費用（円）
  var INITIAL_COSTS = {
    lpg: 200000,         // ガス給湯器（エコジョーズ）本体＋設置工事費
    allElectric: 770000  // エコキュート370L 55万 + ビルトインIH 22万
  };

  // 買い替えコスト（既設からの交換相場、円）
  var REPLACEMENT_COSTS = {
    gas: 150000,        // ガス給湯器の交換（本体＋工事費）
    ecoCute: 450000     // エコキュートの交換（本体＋工事費、補助金考慮後の実勢相場）
  };

  // 比較期間と、その期間中に発生する買い替え回数
  // 給湯設備の寿命を 10〜15年として、15年以降は1回買い替えが発生する設定
  // （IHは20年以上もつため、IH買い替えは含めない）
  var COMPARE_PERIODS = {
    5:  { months: 60,  gasReplace: 0, ecoCuteReplace: 0, label: '5年' },
    10: { months: 120, gasReplace: 0, ecoCuteReplace: 0, label: '10年' },
    15: { months: 180, gasReplace: 1, ecoCuteReplace: 1, label: '15年' },
    20: { months: 240, gasReplace: 1, ecoCuteReplace: 1, label: '20年' }
  };
  var selectedPeriod = 10;

  // ===== 計算関数 =====

  function calcPointPlanBill(kwh) {
    if (kwh <= 0) return ELECTRIC_RATES.pointPlan.baseFee;
    var base = ELECTRIC_RATES.pointPlan.baseFee;
    var energy = 0;
    var prev = 0;
    for (var i = 0; i < ELECTRIC_RATES.pointPlan.tiers.length; i++) {
      var t = ELECTRIC_RATES.pointPlan.tiers[i];
      var upper = Math.min(kwh, t.upTo);
      if (upper > prev) {
        energy += (upper - prev) * t.rate;
        prev = upper;
      }
      if (kwh <= t.upTo) break;
    }
    var fuelAdj = kwh * ELECTRIC_RATES.fuelAdj;
    var renewable = kwh * ELECTRIC_RATES.renewable;
    return Math.round(base + energy + fuelAdj + renewable);
  }

  function calcSmartLifeBill(kwh) {
    if (kwh <= 0) return ELECTRIC_RATES.smartLife.baseFee;
    var sp = ELECTRIC_RATES.smartLife;
    var base = sp.baseFee;
    var energy =
      kwh * sp.nightRatio * sp.night +
      kwh * sp.homeRatio  * sp.home  +
      kwh * sp.dayRatio   * sp.day;
    var fuelAdj = kwh * ELECTRIC_RATES.fuelAdj;
    var renewable = kwh * ELECTRIC_RATES.renewable;
    return Math.round(base + energy + fuelAdj + renewable);
  }

  // ===== UI 制御 =====

  var compPeopleGrid = document.getElementById('comp-people-grid');
  var compGasUsageInput = document.getElementById('comp-gas-usage');
  var selectedComparePeople = 4; // デフォルト4人世帯

  function renderCompare() {
    if (!compPeopleGrid || !compGasUsageInput) return;

    var data = HOUSEHOLDS[selectedComparePeople];
    var period = COMPARE_PERIODS[selectedPeriod];
    var gasUsage = Math.max(0, parseFloat(compGasUsageInput.value) || 0);

    var lpGas = calcBill(gasUsage).total;
    var lpElec = calcPointPlanBill(data.lpgKwh);
    var lpMonthly = lpGas + lpElec;
    var aeMonthly = calcSmartLifeBill(data.allKwh);

    var monthlyDiff = aeMonthly - lpMonthly;

    // 期間中の総コスト = 初期費用 + 月額×期間 + 買い替え費用
    var lpReplaceCost = REPLACEMENT_COSTS.gas * period.gasReplace;
    var aeReplaceCost = REPLACEMENT_COSTS.ecoCute * period.ecoCuteReplace;
    var lpTotal = lpMonthly * period.months + INITIAL_COSTS.lpg + lpReplaceCost;
    var aeTotal = aeMonthly * period.months + INITIAL_COSTS.allElectric + aeReplaceCost;
    var totalDiff = aeTotal - lpTotal;

    // 設備費合計（初期＋期間中の買い替え）
    var lpEquip = INITIAL_COSTS.lpg + lpReplaceCost;
    var aeEquip = INITIAL_COSTS.allElectric + aeReplaceCost;
    var equipDiff = aeEquip - lpEquip;

    setText('comp-kwh-lpg', fmt(data.lpgKwh));
    setText('comp-kwh-all', fmt(data.allKwh));

    setText('comp-lp-gas', fmt(lpGas));
    setText('comp-lp-elec', fmt(lpElec));
    setText('comp-lp-monthly', fmt(lpMonthly));
    setText('comp-ae-monthly', fmt(aeMonthly));

    setText('comp-monthly-diff', fmt(Math.abs(monthlyDiff)));
    setDiffLabel('comp-monthly-diff-label', monthlyDiff);

    setText('comp-period-label', period.label);
    setText('comp-period-label-2', period.label);
    setText('comp-period-label-3', period.label);
    setText('comp-months', fmt(period.months));

    // 買い替え行の表示（期間に応じて）
    var lpReplaceCell = document.getElementById('comp-lp-replace-row');
    var aeReplaceCell = document.getElementById('comp-ae-replace-row');
    if (period.gasReplace > 0 || period.ecoCuteReplace > 0) {
      if (lpReplaceCell) lpReplaceCell.style.display = '';
      if (aeReplaceCell) aeReplaceCell.style.display = '';
      setText('comp-lp-replace', fmt(lpReplaceCost));
      setText('comp-ae-replace', fmt(aeReplaceCost));
    } else {
      if (lpReplaceCell) lpReplaceCell.style.display = 'none';
      if (aeReplaceCell) aeReplaceCell.style.display = 'none';
    }

    setText('comp-lp-initial', fmt(INITIAL_COSTS.lpg));
    setText('comp-ae-initial', fmt(INITIAL_COSTS.allElectric));
    setText('comp-lp-equip', fmt(lpEquip));
    setText('comp-ae-equip', fmt(aeEquip));
    setText('comp-lp-equip-2', fmt(lpEquip));
    setText('comp-ae-equip-2', fmt(aeEquip));
    setText('comp-equip-diff', fmt(Math.abs(equipDiff)));

    setText('comp-lp-ten', fmt(lpTotal));
    setText('comp-ae-ten', fmt(aeTotal));
    setText('comp-ten-diff', fmt(Math.abs(totalDiff)));
    setDiffLabel('comp-ten-diff-label', totalDiff);

    // バー比率
    var maxTotal = Math.max(lpTotal, aeTotal);
    setBar('comp-bar-lp', lpTotal / maxTotal);
    setBar('comp-bar-ae', aeTotal / maxTotal);

    // 短期メッセージ：期間が短いほど設備費差の比重が大きくなる
    var equipShareOfDiff = totalDiff > 0 ? Math.round((equipDiff / totalDiff) * 100) : 0;
    setText('comp-equip-share', equipShareOfDiff > 0 && equipShareOfDiff <= 100 ? equipShareOfDiff : '—');
  }

  function setBar(id, ratio) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.width = (ratio * 100).toFixed(1) + '%';
  }

  // diff > 0 → LPガス有利の表示、< 0 → オール電化有利
  function setDiffLabel(id, diff) {
    var el = document.getElementById(id);
    if (!el) return;
    if (diff > 0) {
      el.textContent = 'LPガスのほうがお得';
      el.className = 'comp-diff-label is-lp';
    } else if (diff < 0) {
      el.textContent = 'オール電化のほうがお得';
      el.className = 'comp-diff-label is-all';
    } else {
      el.textContent = '差はほぼなし';
      el.className = 'comp-diff-label is-even';
    }
  }

  if (compPeopleGrid) {
    compPeopleGrid.querySelectorAll('.people-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        compPeopleGrid.querySelectorAll('.people-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        selectedComparePeople = parseInt(btn.dataset.people, 10);
        renderCompare();
      });
    });
  }

  if (compGasUsageInput) {
    compGasUsageInput.addEventListener('input', renderCompare);
  }

  // 期間切り替えタブ
  var compPeriodTabs = document.getElementById('comp-period-tabs');
  if (compPeriodTabs) {
    compPeriodTabs.querySelectorAll('.period-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        compPeriodTabs.querySelectorAll('.period-tab').forEach(function (t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        selectedPeriod = parseInt(tab.dataset.period, 10);
        renderCompare();
      });
    });
  }

  // ===== 初期描画 =====
  renderDirect();
  renderEstimate();
  renderIncrease();
  renderCompare();
})();
