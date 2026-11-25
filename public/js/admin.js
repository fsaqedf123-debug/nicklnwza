/**
 * Course Coordinator Admin Dashboard 640-394 Pediatric Nursing Practicum
 * PSU Faculty of Nursing
 */

(function () {
  'use strict';

  // Admin state
  const state = {
    user: null,
    rounds: [],
    selectedRoundId: null,
    currentRound: null,
    selectedSection: '',
    selectedDataType: 'real',
    statsData: null,
    commentsData: [],
    chartDistribution: null,
    chartSectionComp: null,
    chartOspe: null
  };

  // DOM elements
  const adminNameDisplay = document.getElementById('adminNameDisplay');
  const btnLogout = document.getElementById('btnLogout');
  const roundSelect = document.getElementById('roundSelect');
  const btnToggleRoundStatus = document.getElementById('btnToggleRoundStatus');
  const roundStatusIndicator = document.getElementById('roundStatusIndicator');
  const sectionFilter = document.getElementById('sectionFilter');
  const dataTypeFilter = document.getElementById('dataTypeFilter');
  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnExportCSV = document.getElementById('btnExportCSV');

  // KPI elements
  const kpiTotal = document.getElementById('kpiTotal');
  const kpiSec1 = document.getElementById('kpiSec1');
  const kpiSec1Pct = document.getElementById('kpiSec1Pct');
  const kpiSec2 = document.getElementById('kpiSec2');
  const kpiSec2Pct = document.getElementById('kpiSec2Pct');
  const kpiSec3 = document.getElementById('kpiSec3');
  const kpiSec3Pct = document.getElementById('kpiSec3Pct');
  const kpiSec4 = document.getElementById('kpiSec4');
  const kpiSec4Pct = document.getElementById('kpiSec4Pct');

  // Tab navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Summary Table
  const summaryTableBody = document.getElementById('summaryTableBody');
  const searchItemInput = document.getElementById('searchItemInput');

  // Comments
  const commentsCountBadge = document.getElementById('commentsCountBadge');
  const commentsListContainer = document.getElementById('commentsListContainer');
  const commentSectionFilter = document.getElementById('commentSectionFilter');

  // Forms
  const newRoundForm = document.getElementById('newRoundForm');
  const btnGenTestData = document.getElementById('btnGenTestData');
  const btnClearTestData = document.getElementById('btnClearTestData');
  const changePasswordForm = document.getElementById('changePasswordForm');

  // 1. Initialize Dashboard
  async function init() {
    try {
      // Check auth
      const authRes = await fetch('/api/admin/me');
      if (authRes.status === 401 || authRes.status === 403) {
        window.location.href = '/login';
        return;
      }
      const authData = await authRes.json();
      if (!authData.success) {
        window.location.href = '/login';
        return;
      }
      state.user = authData.user;
      adminNameDisplay.textContent = `${state.user.full_name} (${state.user.username})`;

      bindEvents();
      await loadRounds();
      await loadDashboardData();
    } catch (err) {
      console.error('Failed to init admin dashboard:', err);
    }
  }

  // 2. Load Evaluation Rounds
  async function loadRounds() {
    try {
      const res = await fetch('/api/admin/rounds');
      const data = await res.json();
      if (data.success && data.rounds) {
        state.rounds = data.rounds;
        renderRoundOptions();
      }
    } catch (err) {
      console.error('Error loading rounds:', err);
    }
  }

  function renderRoundOptions() {
    roundSelect.innerHTML = '';
    if (state.rounds.length === 0) {
      roundSelect.innerHTML = '<option value="">ไม่มีรอบการประเมิน</option>';
      return;
    }

    state.rounds.forEach((r, idx) => {
      const opt = document.createElement('option');
      opt.value = r.id;
      const statusIcon = r.status === 'open' ? '🟢 เปิด' : '🔴 ปิด';
      opt.textContent = `${r.title} [${statusIcon}] (${r.real_submissions_count} คน)`;
      roundSelect.appendChild(opt);
    });

    // Default select first or active open round
    if (!state.selectedRoundId) {
      const active = state.rounds.find(r => r.status === 'open');
      state.selectedRoundId = active ? active.id : state.rounds[0].id;
    }

    roundSelect.value = state.selectedRoundId;
    updateRoundStatusUI();
  }

  function updateRoundStatusUI() {
    state.currentRound = state.rounds.find(r => r.id === parseInt(state.selectedRoundId, 10));
    if (!state.currentRound) return;

    if (state.currentRound.status === 'open') {
      roundStatusIndicator.textContent = 'สถานะ: เปิดรับ (คลิกเพื่อปิด)';
      btnToggleRoundStatus.className = 'nav-btn btn-secondary';
      btnToggleRoundStatus.style.color = '#15803d';
      btnToggleRoundStatus.style.borderColor = '#86efac';
      btnToggleRoundStatus.style.background = '#f0fdf4';
    } else {
      roundStatusIndicator.textContent = 'สถานะ: ปิดรับ (คลิกเพื่อเปิด)';
      btnToggleRoundStatus.className = 'nav-btn btn-secondary';
      btnToggleRoundStatus.style.color = '#b91c1c';
      btnToggleRoundStatus.style.borderColor = '#fca5a5';
      btnToggleRoundStatus.style.background = '#fef2f2';
    }
  }

  // 3. Load Main Dashboard Data (Stats & Comments)
  async function loadDashboardData() {
    if (!state.selectedRoundId) return;

    summaryTableBody.innerHTML = `
      <tr>
        <td colspan="13" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <span class="spinner" style="border-color: rgba(15,43,92,0.3); border-top-color: var(--primary-navy);"></span> กำลังประมวลผลข้อมูล...
        </td>
      </tr>
    `;

    try {
      const params = new URLSearchParams({
        round_id: state.selectedRoundId,
        section: state.selectedSection,
        data_type: state.selectedDataType
      });

      // 1. Fetch Stats
      const statsRes = await fetch(`/api/admin/stats?${params.toString()}`);
      const statsData = await statsRes.json();

      if (statsData.success) {
        state.statsData = statsData;
        renderKPIs(statsData.overview);
        renderSummaryTable(statsData.items);
        renderCharts(statsData);
      }

      // 2. Fetch Comments
      await loadComments();

    } catch (err) {
      console.error('Error loading dashboard data:', err);
      summaryTableBody.innerHTML = `
        <tr>
          <td colspan="13" style="text-align: center; padding: 2rem; color: #ef4444;">
            เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง
          </td>
        </tr>
      `;
    }
  }

  // 4. Render KPIs
  function renderKPIs(overview) {
    if (!overview) return;
    const total = overview.totalSubmissions || 0;
    kpiTotal.textContent = total;
    document.getElementById('kpiTotalSub').textContent = `ในรอบนี้ (${state.selectedDataType === 'real' ? 'ข้อมูลจริง' : (state.selectedDataType === 'test' ? 'ข้อมูลทดสอบ' : 'ข้อมูลทั้งหมด')})`;

    const bySec = overview.bySection || {};
    const s1 = bySec['Sec 01'] || 0;
    const s2 = bySec['Sec 02'] || 0;
    const s3 = bySec['Sec 03'] || 0;
    const s4 = bySec['Sec 04'] || 0;

    kpiSec1.textContent = s1;
    kpiSec1Pct.textContent = total > 0 ? `${((s1 / total) * 100).toFixed(1)}% ของผู้ตอบ` : '0%';

    kpiSec2.textContent = s2;
    kpiSec2Pct.textContent = total > 0 ? `${((s2 / total) * 100).toFixed(1)}% ของผู้ตอบ` : '0%';

    kpiSec3.textContent = s3;
    kpiSec3Pct.textContent = total > 0 ? `${((s3 / total) * 100).toFixed(1)}% ของผู้ตอบ` : '0%';

    kpiSec4.textContent = s4;
    kpiSec4Pct.textContent = total > 0 ? `${((s4 / total) * 100).toFixed(1)}% ของผู้ตอบ` : '0%';
  }

  // 5. Render Summary Table (Conforming to all statistical rules)
  function renderSummaryTable(items) {
    if (!items || items.length === 0) {
      summaryTableBody.innerHTML = `
        <tr>
          <td colspan="13" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            ไม่พบข้อมูลแบบประเมินตามเงื่อนไขที่เลือก
          </td>
        </tr>
      `;
      return;
    }

    // Filter by search query if any
    const query = (searchItemInput.value || '').trim().toLowerCase();
    const filteredItems = items.filter(it => {
      if (!it.is_rating) return false;
      if (!query) return true;
      return (it.section_num && it.section_num.toLowerCase().includes(query)) ||
             (it.code && it.code.toLowerCase().includes(query)) ||
             (it.title_th && it.title_th.toLowerCase().includes(query)) ||
             (it.subtitle_th && it.subtitle_th.toLowerCase().includes(query));
    });

    if (filteredItems.length === 0) {
      summaryTableBody.innerHTML = `
        <tr>
          <td colspan="13" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            ไม่พบข้อประเมินที่ตรงกับคำค้นหา "${escapeHtml(query)}"
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    let currentSec = '';

    for (const item of filteredItems) {
      // Group header by Section
      if (item.section_num !== currentSec) {
        currentSec = item.section_num;
        const sectionTitles = {
          '4.1': '4.1 การเตรียมความพร้อมในการปฏิบัติการพยาบาลเด็ก (สอบสัปดาห์ 1 & Clinical teaching 3 ฐาน)',
          '4.2': '4.2 ประสบการณ์ที่ได้รับจากการขึ้นฝึกปฏิบัติ ณ ฝ่ายพัฒนาเด็กปฐมวัย',
          '4.3': '4.3 ประสบการณ์ที่ได้รับจากการขึ้นฝึกปฏิบัติบนหอผู้ป่วย (รพ.มอ., รพ.หาดใหญ่, รพ.สงขลา)',
          '4.4': '4.4 การจัดกิจกรรมการเล่นบนหอผู้ป่วย',
          '4.5': '4.5 การอภิปรายกรณีเลือกสรรในวันแรกของสัปดาห์ที่ 8',
          '4.6': '4.6 การสอบลงกอง (OSPE 7 ข้อ)',
          '4.7': '4.7 ความพึงพอใจในภาพรวมของการจัดการเรียนการสอนของรายวิชา'
        };

        html += `
          <tr style="background: #e2e8f0; font-weight: 700; color: var(--primary-navy-dark);">
            <td colspan="13" style="padding: 0.65rem 0.85rem; font-size: 0.88rem;">
              📌 ${sectionTitles[currentSec] || currentSec}
            </td>
          </tr>
        `;
      }

      // Check if question was not in version
      const notInVersionBadge = item.countNotInVersion > 0 
        ? `<div style="font-size: 0.72rem; color: #d97706; margin-top: 2px;">(ไม่มีในฉบับที่ตอบ: ${item.countNotInVersion} ฉบับ)</div>` 
        : '';

      const notTrainedBadge = item.countNotTrained > 0
        ? `<div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">(ไม่ได้ขึ้นฝึก: ${item.countNotTrained} คน)</div>`
        : '';

      const meanDisplayClass = item.mean !== null 
        ? (item.mean >= 4.0 ? 'style="font-weight: 700; color: #15803d;"' : (item.mean < 3.5 ? 'style="font-weight: 700; color: #b91c1c;"' : 'style="font-weight: 700; color: var(--primary-navy);"'))
        : 'style="color: var(--text-light); font-style: italic;"';

      html += `
        <tr>
          <!-- Section -->
          <td style="font-weight: 600; color: var(--secondary-blue); font-size: 0.8rem;">
            ${item.section_num}
          </td>

          <!-- Title & Subtitle -->
          <td>
            <div style="font-weight: 600; color: var(--primary-navy);">${escapeHtml(item.title_th)}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(item.subtitle_th || '')}</div>
            <div style="font-family: monospace; font-size: 0.7rem; color: #94a3b8; margin-top: 1px;">${item.code}</div>
            ${notInVersionBadge}
            ${notTrainedBadge}
          </td>

          <!-- N (1-5) -->
          <td style="text-align: center; font-weight: 600;">
            ${item.numericCount}
          </td>

          <!-- Mean -->
          <td style="text-align: center;" ${meanDisplayClass}>
            ${item.meanDisplay}
          </td>

          <!-- S.D. -->
          <td style="text-align: center; color: var(--text-muted);">
            ${item.sdDisplay}
          </td>

          <!-- 5 (%) -->
          <td style="text-align: center;">
            <div>${item.scoreCounts[5]}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${item.scorePercents[5]}%</div>
          </td>

          <!-- 4 (%) -->
          <td style="text-align: center;">
            <div>${item.scoreCounts[4]}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${item.scorePercents[4]}%</div>
          </td>

          <!-- 3 (%) -->
          <td style="text-align: center;">
            <div>${item.scoreCounts[3]}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${item.scorePercents[3]}%</div>
          </td>

          <!-- 2 (%) -->
          <td style="text-align: center;">
            <div>${item.scoreCounts[2]}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${item.scorePercents[2]}%</div>
          </td>

          <!-- 1 (%) -->
          <td style="text-align: center;">
            <div>${item.scoreCounts[1]}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${item.scorePercents[1]}%</div>
          </td>

          <!-- N/A -->
          <td style="text-align: center; color: #475569; font-weight: 500;">
            ${item.countNA}
          </td>

          <!-- 1-3 Count & % -->
          <td style="text-align: center; ${item.lowCount > 0 ? 'color: #b91c1c; font-weight: 600;' : 'color: var(--text-muted);'}">
            <div>${item.lowCount}</div>
            <div style="font-size: 0.72rem;">${item.lowPercent}%</div>
          </td>

          <!-- Comments button -->
          <td style="text-align: center;">
            ${item.commentsCount > 0 ? `
              <button type="button" class="nav-btn btn-secondary btn-view-item-comments" 
                      data-qcode="${item.code}" data-title="${escapeHtml(item.title_th)}"
                      style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
                💬 ${item.commentsCount}
              </button>
            ` : '<span style="color: #cbd5e1;">-</span>'}
          </td>
        </tr>
      `;
    }

    summaryTableBody.innerHTML = html;

    // Attach comments view button event
    document.querySelectorAll('.btn-view-item-comments').forEach(btn => {
      btn.addEventListener('click', () => {
        const qCode = btn.dataset.qcode;
        // Switch to comments tab and filter by that question
        switchTab('tab-comments');
        commentSectionFilter.value = '';
        renderFilteredComments(qCode);
      });
    });
  }

  // 6. Render Charts (Chart.js)
  function renderCharts(statsData) {
    if (!window.Chart || !statsData) return;

    // A. Score Distribution Chart
    const distCanvas = document.getElementById('scoreDistributionChart');
    if (distCanvas) {
      if (state.chartDistribution) state.chartDistribution.destroy();

      let sum5 = 0, sum4 = 0, sum3 = 0, sum2 = 0, sum1 = 0, sumNA = 0;
      for (const item of statsData.items) {
        if (item.is_rating) {
          sum5 += item.scoreCounts[5];
          sum4 += item.scoreCounts[4];
          sum3 += item.scoreCounts[3];
          sum2 += item.scoreCounts[2];
          sum1 += item.scoreCounts[1];
          sumNA += item.countNA;
        }
      }

      state.chartDistribution = new Chart(distCanvas, {
        type: 'bar',
        data: {
          labels: ['5 (มากที่สุด)', '4 (มาก)', '3 (ปานกลาง)', '2 (น้อย)', '1 (น้อยที่สุด)', 'N/A (ไม่มีประสบการณ์)'],
          datasets: [{
            label: 'จำนวนคำตอบสะสมทุกข้อ',
            data: [sum5, sum4, sum3, sum2, sum1, sumNA],
            backgroundColor: [
              '#15803d',
              '#22c55e',
              '#f59e0b',
              '#f97316',
              '#ef4444',
              '#64748b'
            ],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }

    // B. Section Comparison Chart
    const compCanvas = document.getElementById('sectionComparisonChart');
    if (compCanvas && statsData.sectionComparisons) {
      if (state.chartSectionComp) state.chartSectionComp.destroy();

      // Sample key benchmark questions
      const keyCodes = [
        { code: 'SEC_4_1_1_SKILLS_W1', label: '4.1.1 สอบสัปดาห์ 1' },
        { code: 'SEC_4_4_PLAY_ACTIVITY', label: '4.4 กิจกรรมการเล่น' },
        { code: 'SEC_4_5_SELECTED_CASE', label: '4.5 กรณีเลือกสรร' },
        { code: 'SEC_4_6_OSPE_7_OVERALL', label: '4.6 ภาพรวม OSPE' },
        { code: 'SEC_4_7_OVERALL_SATISFACTION', label: '4.7 ภาพรวมรายวิชา' }
      ];

      const datasets = [
        { label: 'Sec 01', data: [], backgroundColor: '#0284c7' },
        { label: 'Sec 02', data: [], backgroundColor: '#38bdf8' },
        { label: 'Sec 03', data: [], backgroundColor: '#0f2b5c' },
        { label: 'Sec 04', data: [], backgroundColor: '#6366f1' }
      ];

      for (let i = 0; i < 4; i++) {
        const secName = ['Sec 01', 'Sec 02', 'Sec 03', 'Sec 04'][i];
        const secMap = statsData.sectionComparisons[secName] || {};
        for (const k of keyCodes) {
          const val = secMap[k.code] ? secMap[k.code].mean : 0;
          datasets[i].data.push(val !== null ? val : 0);
        }
      }

      state.chartSectionComp = new Chart(compCanvas, {
        type: 'bar',
        data: {
          labels: keyCodes.map(k => k.label),
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          },
          scales: {
            y: { min: 0, max: 5 }
          }
        }
      });
    }

    // C. OSPE Breakdown Chart
    const ospeCanvas = document.getElementById('ospeChart');
    if (ospeCanvas) {
      if (state.chartOspe) state.chartOspe.destroy();

      const ospeCodes = [
        'SEC_4_6_OSPE_1_NEB', 'SEC_4_6_OSPE_2_SUCTION', 'SEC_4_6_OSPE_3_IV',
        'SEC_4_6_OSPE_4_NG', 'SEC_4_6_OSPE_5_WRITTEN', 'SEC_4_6_OSPE_6_TIME', 'SEC_4_6_OSPE_7_OVERALL'
      ];
      const labels = ['พ่นยา', 'Suction', 'IV Injection', 'NG Tube', 'ข้อเขียน 10 ข้อ', 'เวลา 7 นาที', 'ภาพรวม OSPE'];
      const means = [];

      for (const code of ospeCodes) {
        const it = statsData.items.find(x => x.code === code);
        means.push(it && it.mean !== null ? it.mean : 0);
      }

      state.chartOspe = new Chart(ospeCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'ค่าเฉลี่ยความเหมาะสม (คะแนนเต็ม 5)',
            data: means,
            backgroundColor: '#0284c7',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { min: 0, max: 5 }
          }
        }
      });
    }
  }

  // 7. Load and Render Comments
  async function loadComments() {
    try {
      const params = new URLSearchParams({
        round_id: state.selectedRoundId,
        section: state.selectedSection,
        data_type: state.selectedDataType
      });

      const res = await fetch(`/api/admin/comments?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        state.commentsData = data.comments || [];
        commentsCountBadge.textContent = state.commentsData.length;
        renderFilteredComments();
      }
    } catch (err) {
      console.error('Error loading comments:', err);
    }
  }

  function renderFilteredComments(filterQCode = null) {
    const secNumFilter = commentSectionFilter.value;
    let list = state.commentsData;

    if (filterQCode) {
      list = list.filter(c => c.question_code === filterQCode);
    } else if (secNumFilter) {
      list = list.filter(c => c.section_num === secNumFilter);
    }

    if (list.length === 0) {
      commentsListContainer.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: var(--text-muted); background: #ffffff; border-radius: var(--radius-md);">
          ไม่มีข้อคิดเห็นหรือข้อเสนอแนะตามเงื่อนไขที่เลือก
        </div>
      `;
      return;
    }

    let html = '';
    for (const c of list) {
      const scoreClass = c.score === 'N/A' ? '' : (parseInt(c.score, 10) >= 4 ? 'high' : 'low');

      html += `
        <div class="question-card" style="margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem;">
            <div>
              <span class="question-num-tag">${c.section}</span>
              <strong style="color: var(--primary-navy); font-size: 0.95rem; margin-left: 0.25rem;">
                ${escapeHtml(c.title_th)}
              </strong>
              ${c.context ? `<span style="font-size: 0.82rem; color: #0284c7; background: #e0f2fe; padding: 0.1rem 0.45rem; border-radius: 4px; margin-left: 0.35rem;">📍 ${escapeHtml(c.context)}</span>` : ''}
            </div>
            <span class="review-score-badge ${scoreClass}">
              ${c.score === 'N/A' ? 'N/A' : `${c.score} คะแนน`}
            </span>
          </div>

          <div style="font-size: 0.92rem; color: #1e293b; background: #f8fafc; border-left: 3px solid var(--secondary-blue); padding: 0.65rem 0.85rem; border-radius: 4px; line-height: 1.5;">
            "${escapeHtml(c.comment)}"
          </div>

          <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 0.4rem; text-align: right;">
            ส่งเมื่อ: ${formatDate(c.submitted_at)}
          </div>
        </div>
      `;
    }

    commentsListContainer.innerHTML = html;
  }

  // 8. Bind Events
  function bindEvents() {
    // Round selector
    roundSelect.addEventListener('change', () => {
      state.selectedRoundId = roundSelect.value;
      updateRoundStatusUI();
      loadDashboardData();
    });

    // Toggle round status (Open / Closed)
    btnToggleRoundStatus.addEventListener('click', async () => {
      if (!state.currentRound) return;
      const newStatus = state.currentRound.status === 'open' ? 'closed' : 'open';
      const confirmMsg = newStatus === 'closed' 
        ? 'ต้องการ "ปิดรับ" แบบประเมินในรอบนี้หรือไม่? (นักศึกษาจะไม่สามารถส่งคำตอบใหม่ได้)'
        : 'ต้องการ "เปิดรับ" แบบประเมินในรอบนี้หรือไม่?';

      if (!confirm(confirmMsg)) return;

      try {
        const res = await fetch(`/api/admin/rounds/${state.currentRound.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
          await loadRounds();
          updateRoundStatusUI();
          alert('ปรับปรุงสถานะรอบการประเมินเรียบร้อยแล้ว');
        } else {
          alert(data.error || 'ไม่สามารถปรับปรุงสถานะได้');
        }
      } catch (e) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      }
    });

    // Section filter
    sectionFilter.addEventListener('change', () => {
      state.selectedSection = sectionFilter.value;
      loadDashboardData();
    });

    // Data type filter
    dataTypeFilter.addEventListener('change', () => {
      state.selectedDataType = dataTypeFilter.value;
      loadDashboardData();
    });

    // Search summary table
    searchItemInput.addEventListener('input', () => {
      if (state.statsData) {
        renderSummaryTable(state.statsData.items);
      }
    });

    // Comments section filter
    commentSectionFilter.addEventListener('change', () => {
      renderFilteredComments();
    });

    // Tabs
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        switchTab(tabId);
      });
    });

    // Export Excel
    btnExportExcel.addEventListener('click', () => {
      if (!state.selectedRoundId) return;
      window.location.href = `/api/admin/export/xlsx?round_id=${state.selectedRoundId}&data_type=${state.selectedDataType}`;
    });

    // Export CSV
    btnExportCSV.addEventListener('click', () => {
      if (!state.selectedRoundId) return;
      window.location.href = `/api/admin/export/csv?round_id=${state.selectedRoundId}&data_type=${state.selectedDataType}`;
    });

    // Logout
    btnLogout.addEventListener('click', async () => {
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.href = '/login';
    });

    // Create New Round Form
    newRoundForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const academic_year = document.getElementById('newRoundYear').value;
      const semester = document.getElementById('newRoundSem').value;
      const title = document.getElementById('newRoundTitle').value;
      const status = document.getElementById('newRoundStatus').value;
      const form_version = document.getElementById('newRoundVersion').value;
      const notes = document.getElementById('newRoundNotes').value;

      try {
        const res = await fetch('/api/admin/rounds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ academic_year, semester, title, status, form_version, notes })
        });
        const data = await res.json();
        if (data.success) {
          alert('สร้างรอบการประเมินใหม่เรียบร้อยแล้ว!');
          newRoundForm.reset();
          state.selectedRoundId = data.roundId;
          await loadRounds();
          await loadDashboardData();
          switchTab('tab-summary');
        } else {
          alert(data.error || 'เกิดข้อผิดพลาดในการสร้างรอบการประเมิน');
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      }
    });

    // Generate Test Data
    btnGenTestData.addEventListener('click', async () => {
      if (!confirm('ต้องการสร้างข้อมูลทดสอบจำลอง 36 รายการในรอบนี้หรือไม่?\n(ข้อมูลทดสอบจะถูกแยกด้วยธง is_test_data = 1 และไม่ปะปนกับข้อมูลจริง)')) return;

      try {
        btnGenTestData.disabled = true;
        const res = await fetch('/api/admin/test-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'generate', round_id: state.selectedRoundId })
        });
        const data = await res.json();
        btnGenTestData.disabled = false;

        if (data.success) {
          alert(data.message);
          // Set filter to test data or all so user can see it immediately
          dataTypeFilter.value = 'test';
          state.selectedDataType = 'test';
          await loadRounds();
          await loadDashboardData();
        } else {
          alert(data.error || 'เกิดข้อผิดพลาด');
        }
      } catch (e) {
        btnGenTestData.disabled = false;
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      }
    });

    // Clear Test Data
    btnClearTestData.addEventListener('click', async () => {
      if (!confirm('ยืนยันลบข้อมูลทดสอบจำลองทั้งหมดในรอบนี้หรือไม่?\n(ข้อมูลจริงจะไม่ถูกแตะต้องหรือสูญหาย)')) return;

      try {
        const res = await fetch('/api/admin/test-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear', round_id: state.selectedRoundId })
        });
        const data = await res.json();
        if (data.success) {
          alert(data.message);
          dataTypeFilter.value = 'real';
          state.selectedDataType = 'real';
          await loadRounds();
          await loadDashboardData();
        } else {
          alert(data.error || 'เกิดข้อผิดพลาด');
        }
      } catch (e) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      }
    });

    // Change Password Form
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const current_password = document.getElementById('currentPassword').value;
      const new_password = document.getElementById('newPassword').value;

      try {
        const res = await fetch('/api/admin/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password, new_password })
        });
        const data = await res.json();
        if (data.success) {
          alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
          changePasswordForm.reset();
        } else {
          alert(data.error || 'รหัสผ่านเดิมไม่ถูกต้อง');
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      }
    });
  }

  function switchTab(tabId) {
    tabBtns.forEach(b => {
      if (b.dataset.tab === tabId) b.classList.add('active');
      else b.classList.remove('active');
    });
    tabPanes.forEach(p => {
      if (p.id === tabId) p.classList.add('active');
      else p.classList.remove('active');
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoStr;
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
