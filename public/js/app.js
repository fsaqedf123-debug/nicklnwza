/**
 * Student Evaluation Application 640-394 Pediatric Nursing Practicum
 * PSU Faculty of Nursing
 */

(function () {
  'use strict';

  // Application State
  const state = {
    round: null,
    currentStep: 1,
    totalSteps: 8,
    submissionToken: generateToken(),
    selectedTerm: '2/2569',
    selectedSection: null,
    earlyChildhoodTrained: null,
    earlyChildhoodExtraSuggestion: '',
    wardTrainingStatus: null,
    selectedWards: [],
    answers: {}, // [qCode]: { score: 1-5 | 'NA', comment: string }
    impressionsToKeep: '',
    improvementsAndSuggestions: '',
    hospitals: [],
    wardMap: {}
  };

  // Helper to generate UUID-like submission token
  function generateToken() {
    return 'sub-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
  }

  // DOM Elements
  const stepperTitle = document.getElementById('stepperTitle');
  const stepperPercent = document.getElementById('stepperPercent');
  const progressBar = document.getElementById('progressBar');
  const stepDots = document.querySelectorAll('.step-dot-item');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnSubmit = document.getElementById('btnSubmit');
  const submitBtnText = document.getElementById('submitBtnText');
  const submitBtnSpinner = document.getElementById('submitBtnSpinner');
  const navigationBar = document.getElementById('navigationBar');
  const activeRoundBadge = document.getElementById('activeRoundBadge');
  const closedNotice = document.getElementById('closedNotice');
  const dynamicWardsContainer = document.getElementById('dynamic-wards-eval-container');

  // Rating scale definition
  const ratingChoices = [
    { value: 5, label: 'มากที่สุด', class: 'high' },
    { value: 4, label: 'มาก', class: 'high' },
    { value: 3, label: 'ปานกลาง', class: 'low' },
    { value: 2, label: 'น้อย', class: 'low' },
    { value: 1, label: 'น้อยที่สุด', class: 'low' },
    { value: 'NA', label: 'N/A (ไม่มีประสบการณ์)', class: 'na' }
  ];

  // 1. Initialize Page
  async function init() {
    try {
      const res = await fetch('/api/evaluation/active-round');
      const data = await res.json();

      if (!data.success) {
        showClosedState();
        return;
      }

      state.round = data.round || { id: 1, round_code: '2569-2', title: 'ภาคการศึกษาที่ 2 ปีการศึกษา 2569' };
      state.hospitals = data.hospitals || [];

      // Build ward lookup map
      for (const h of state.hospitals) {
        if (h.wards) {
          for (const w of h.wards) {
            state.wardMap[w.code] = {
              ...w,
              hospital_code: h.code,
              hospital_name: h.name_th
            };
          }
        }
      }

      // Render terms if returned from server
      if (Array.isArray(data.terms) && data.terms.length > 0) {
        renderTermButtons(data.terms);
      }

      updateActiveRoundBadge();
      initRatingContainers();
      bindEvents();
      updateUI();
    } catch (err) {
      console.error('Failed to initialize:', err);
      activeRoundBadge.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
      showClosedState();
    }
  }

  function updateActiveRoundBadge() {
    activeRoundBadge.textContent = `ภาคการศึกษา ${state.selectedTerm}`;
  }

  function renderTermButtons(terms) {
    const grid = document.getElementById('termChoiceGrid');
    if (!grid) return;

    grid.innerHTML = terms.map((t, idx) => `
      <label class="term-radio-label ${state.selectedTerm === t ? 'selected' : ''}" id="term-label-${t.replace('/', '-')}">
        <input type="radio" name="studentTerm" value="${t}" ${state.selectedTerm === t ? 'checked' : ''}>
        <span class="term-val">${t}</span>
        <span class="term-sub">ภาค ${t}</span>
      </label>
    `).join('');

    // Re-bind term radio click
    bindTermRadios();
  }

  function bindTermRadios() {
    const termRadios = document.querySelectorAll('input[name="studentTerm"]');
    termRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        state.selectedTerm = radio.value;
        document.querySelectorAll('.term-radio-label').forEach(lbl => lbl.classList.remove('selected'));
        const label = document.getElementById(`term-label-${radio.value.replace('/', '-')}`);
        if (label) label.classList.add('selected');
        updateActiveRoundBadge();
        document.getElementById('card-term').classList.remove('has-error');
        document.getElementById('err-studentTerm').style.display = 'none';
      });
    });
  }

  function showClosedState() {
    closedNotice.style.display = 'block';
    document.getElementById('stepperCard').style.display = 'none';
    document.getElementById('step-1').style.display = 'none';
    navigationBar.style.display = 'none';
  }

  // 2. Initialize Static Rating Containers
  function initRatingContainers() {
    const containers = document.querySelectorAll('.rating-container');
    containers.forEach(container => {
      const qCode = container.dataset.qcode;
      if (qCode) {
        renderRatingGroup(container, qCode);
      }
    });
  }

  // Render Rating Pills and Dynamic Comment Box
  function renderRatingGroup(container, qCode, onRatingSelected = null) {
    const existing = state.answers[qCode] || { score: null, comment: '' };

    container.innerHTML = `
      <div class="rating-pills-wrap" id="pills-${qCode}">
        ${ratingChoices.map(rc => `
          <label class="rating-pill-label ${existing.score === rc.value ? 'selected ' + (rc.class === 'low' ? 'low-score' : (rc.class === 'na' ? 'na-score' : '')) : ''}" 
                 id="pill-${qCode}-${rc.value}">
            <input type="radio" name="score-${qCode}" value="${rc.value}" ${existing.score === rc.value ? 'checked' : ''}>
            <span class="rating-score-val">${rc.value}</span>
            <span class="rating-score-label">${rc.label}</span>
          </label>
        `).join('')}
      </div>

      <!-- Dynamic Comment Box -->
      <div class="comment-box-wrap" id="comment-wrap-${qCode}" style="${existing.score ? 'display: block;' : 'display: none;'}">
        <div class="comment-box-label">
          <span id="comment-label-text-${qCode}">
            ${[1, 2, 3].includes(existing.score)
              ? '<span class="req-tag">ข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้ * (จำเป็นต้องระบุเมื่อให้ 1-3 คะแนน)</span>'
              : '<span class="opt-tag">ข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้ (ไม่บังคับ)</span>'}
          </span>
        </div>
        <textarea id="comment-${qCode}" class="comment-textarea" 
                  placeholder="${[1, 2, 3].includes(existing.score) ? 'กรุณาระบุข้อคิดเห็นหรือข้อเสนอแนะเพื่อการพัฒนา...' : 'ระบุข้อคิดเห็นเพิ่มเติม (ถ้ามี)...'}">${existing.comment || ''}</textarea>
      </div>

      <div class="item-error-message" id="err-${qCode}">
        <span>⚠️ กรุณาตอบข้อนี้ให้ครบถ้วน</span>
      </div>
    `;

    // Attach pill events
    const pillLabels = container.querySelectorAll('.rating-pill-label');
    pillLabels.forEach(label => {
      label.addEventListener('click', () => {
        const input = label.querySelector('input');
        const val = input.value === 'NA' ? 'NA' : parseInt(input.value, 10);

        // Update answer in state
        if (!state.answers[qCode]) {
          state.answers[qCode] = { score: val, comment: '' };
        } else {
          state.answers[qCode].score = val;
        }

        // Update pill styling
        pillLabels.forEach(l => {
          l.classList.remove('selected', 'low-score', 'na-score');
        });
        label.classList.add('selected');
        if ([1, 2, 3].includes(val)) label.classList.add('low-score');
        if (val === 'NA') label.classList.add('na-score');

        // Update comment box requirement
        const commentWrap = document.getElementById(`comment-wrap-${qCode}`);
        const commentLabel = document.getElementById(`comment-label-text-${qCode}`);
        const commentText = document.getElementById(`comment-${qCode}`);

        commentWrap.style.display = 'block';

        if ([1, 2, 3].includes(val)) {
          commentLabel.innerHTML = '<span class="req-tag">ข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้ * (จำเป็นต้องระบุเมื่อให้ 1-3 คะแนน)</span>';
          commentText.placeholder = 'กรุณาระบุข้อคิดเห็นหรือข้อเสนอแนะเพื่อการพัฒนา...';
        } else {
          commentLabel.innerHTML = '<span class="opt-tag">ข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้ (ไม่บังคับ)</span>';
          commentText.placeholder = 'ระบุข้อคิดเห็นเพิ่มเติม (ถ้ามี)...';
        }

        // Clear error on this card if present
        clearItemError(qCode);

        // If this is a ward rating, update its jump button evaluated state!
        if (qCode.startsWith('SEC_4_3_WARD_')) {
          updateWardJumpButtonState();
        }

        if (typeof onRatingSelected === 'function') {
          onRatingSelected(val);
        }
      });
    });

    // Attach textarea comment input event
    const commentTextarea = container.querySelector(`#comment-${qCode}`);
    if (commentTextarea) {
      commentTextarea.addEventListener('input', (e) => {
        if (!state.answers[qCode]) {
          state.answers[qCode] = { score: null, comment: '' };
        }
        state.answers[qCode].comment = e.target.value;
        if (e.target.value.trim().length > 0) {
          commentTextarea.classList.remove('is-invalid');
          clearItemError(qCode);
        }
      });
    }
  }

  // Clear card error helper
  function clearItemError(qCode) {
    const card = document.getElementById(`card-${qCode}`);
    if (card) {
      card.classList.remove('has-error');
    }
    const errEl = document.getElementById(`err-${qCode}`);
    if (errEl) {
      errEl.style.display = 'none';
    }
  }

  // Show error helper
  function setItemError(qCode, message) {
    const card = document.getElementById(`card-${qCode}`);
    if (card) {
      card.classList.add('has-error');
    }
    const errEl = document.getElementById(`err-${qCode}`);
    if (errEl) {
      errEl.style.display = 'flex';
      errEl.innerHTML = `<span>⚠️ ${message}</span>`;
    }
    const commentArea = document.getElementById(`comment-${qCode}`);
    if (commentArea && message.includes('ข้อคิดเห็น')) {
      commentArea.classList.add('is-invalid');
    }
  }

  // 3. Bind UI Events
  function bindEvents() {
    // Term Radios
    bindTermRadios();

    // Section Radio Buttons (Step 1)
    const secRadios = document.querySelectorAll('input[name="studentSection"]');
    secRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        state.selectedSection = radio.value;
        document.querySelectorAll('.section-radio-label').forEach(lbl => lbl.classList.remove('selected'));
        const label = document.getElementById(`sec-label-${radio.value}`);
        if (label) label.classList.add('selected');
        document.getElementById('card-section').classList.remove('has-error');
        document.getElementById('err-studentSection').style.display = 'none';
      });
    });

    // Early Childhood Screening (Step 3)
    const btnEcTrained = document.getElementById('btn-ec-trained');
    const btnEcNotTrained = document.getElementById('btn-ec-nottrained');
    const ecEvalBlock = document.getElementById('ec-evaluation-block');
    const ecSkippedBlock = document.getElementById('ec-skipped-block');

    btnEcTrained.addEventListener('click', () => {
      state.earlyChildhoodTrained = 'trained';
      btnEcTrained.classList.add('selected');
      btnEcNotTrained.classList.remove('selected');
      ecEvalBlock.style.display = 'block';
      ecSkippedBlock.style.display = 'none';
      document.getElementById('card-screening-ec').classList.remove('has-error');
      document.getElementById('err-earlyChildhoodScreening').style.display = 'none';
    });

    btnEcNotTrained.addEventListener('click', () => {
      state.earlyChildhoodTrained = 'not_trained';
      btnEcNotTrained.classList.add('selected');
      btnEcTrained.classList.remove('selected');
      ecEvalBlock.style.display = 'none';
      ecSkippedBlock.style.display = 'block';
      // Clear answers for early childhood
      delete state.answers['SEC_4_2_EXP'];
      document.getElementById('card-screening-ec').classList.remove('has-error');
      document.getElementById('err-earlyChildhoodScreening').style.display = 'none';
    });

    const ecExtraText = document.getElementById('earlyChildhoodExtraSuggestion');
    ecExtraText.addEventListener('input', (e) => {
      state.earlyChildhoodExtraSuggestion = e.target.value;
    });

    // Ward Jump Buttons (Step 4 - Requirement 3: Jump Directly to Evaluate Ward)
    const wardJumpBtns = document.querySelectorAll('.ward-jump-btn');
    wardJumpBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const wardCode = btn.dataset.ward;

        if (wardCode === 'WARD_NONE') {
          // Special: Not trained on any ward
          state.wardTrainingStatus = 'not_trained';
          state.selectedWards = [];
          // Delete all ward answers
          Object.keys(state.answers).forEach(k => {
            if (k.startsWith('SEC_4_3_WARD_')) delete state.answers[k];
          });
          updateWardJumpButtonState();
          renderDynamicWardCards();
          document.getElementById('err-wardSelection').style.display = 'none';
          return;
        }

        // Student chose a specific ward to evaluate
        state.wardTrainingStatus = 'trained';

        // Add ward to selected list if not already added
        if (!state.selectedWards.includes(wardCode)) {
          state.selectedWards.push(wardCode);
        }

        // Render ward cards
        renderDynamicWardCards();
        updateWardJumpButtonState();
        document.getElementById('err-wardSelection').style.display = 'none';

        // JUMP DIRECTLY to that ward's card!
        setTimeout(() => {
          const targetCard = document.getElementById(`ward-card-block-${wardCode}`);
          if (targetCard) {
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            targetCard.style.transition = 'box-shadow 0.3s ease';
            targetCard.style.boxShadow = '0 0 0 4px rgba(2, 132, 199, 0.4)';
            setTimeout(() => {
              targetCard.style.boxShadow = '';
            }, 1200);
          }
        }, 80);
      });
    });

    // Section 4.7 Open Text Inputs
    document.getElementById('impressionsToKeep').addEventListener('input', (e) => {
      state.impressionsToKeep = e.target.value;
    });

    document.getElementById('improvementsAndSuggestions').addEventListener('input', (e) => {
      state.improvementsAndSuggestions = e.target.value;
    });

    // Navigation Buttons
    btnPrev.addEventListener('click', goPrev);
    btnNext.addEventListener('click', goNext);
    btnSubmit.addEventListener('click', handleSubmit);

    // Stepper dots click
    stepDots.forEach(dot => {
      dot.addEventListener('click', () => {
        const targetStep = parseInt(dot.dataset.step, 10);
        if (targetStep < state.currentStep) {
          state.currentStep = targetStep;
          updateUI();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (targetStep > state.currentStep) {
          if (validateCurrentStep()) {
            state.currentStep = targetStep;
            updateUI();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      });
    });
  }

  // Update button indicators in the Jump Panel
  function updateWardJumpButtonState() {
    const wardJumpBtns = document.querySelectorAll('.ward-jump-btn');
    wardJumpBtns.forEach(btn => {
      const wCode = btn.dataset.ward;

      if (wCode === 'WARD_NONE') {
        if (state.wardTrainingStatus === 'not_trained') {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
        return;
      }

      const isSelected = state.selectedWards.includes(wCode);
      const isEvaluated = isSelected && state.answers[`SEC_4_3_WARD_${wCode}_EXP`] && state.answers[`SEC_4_3_WARD_${wCode}_EXP`].score !== null;

      btn.classList.remove('active', 'evaluated');
      if (isEvaluated) {
        btn.classList.add('evaluated');
      } else if (isSelected) {
        btn.classList.add('active');
      }
    });
  }

  // 4. Render Dynamic Ward Cards (Section 4.3 - With Jump Actions & Unselect)
  function renderDynamicWardCards() {
    if (state.wardTrainingStatus === 'not_trained') {
      dynamicWardsContainer.innerHTML = `
        <div class="instruction-banner" style="margin-top: 1rem;">
          ℹ️ นักศึกษาระบุว่า <strong>ไม่ได้ขึ้นฝึกบนหอผู้ป่วย</strong> ระบบจะข้ามข้อประเมินหอผู้ป่วยทั้งหมด
        </div>
      `;
      return;
    }

    if (!state.selectedWards || state.selectedWards.length === 0) {
      dynamicWardsContainer.innerHTML = `
        <div id="ward-empty-hint" style="text-align: center; padding: 2rem; color: var(--text-muted); background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: var(--radius-md); margin-top: 1rem;">
          👆 กรุณากดปุ่มชื่อหอผู้ป่วยด้านบนเพื่อกระโดดไปเริ่มการประเมินหอผู้ป่วยนั้น
        </div>
      `;
      return;
    }

    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin: 1.25rem 0 1rem; border-bottom: 2px solid var(--light-blue-bg); padding-bottom: 0.5rem;">
        <h3 style="font-size: 1.05rem; font-weight: 600; color: var(--primary-navy);">
          หอผู้ป่วยที่นักศึกษาเลือกประเมิน (${state.selectedWards.length} หอผู้ป่วย)
        </h3>
        <button type="button" class="btn-jump-to-top" onclick="document.getElementById('wardJumpPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });">
          ↑ กระโดดไปเลือกหออื่นเพิ่ม
        </button>
      </div>
    `;

    for (const wardCode of state.selectedWards) {
      const ward = state.wardMap[wardCode];
      if (!ward) continue;
      const qCode = `SEC_4_3_WARD_${wardCode}_EXP`;
      const extraCode = `SEC_4_3_WARD_${wardCode}_EXTRA`;

      html += `
        <div class="hospital-group-card" id="ward-card-block-${wardCode}" style="background: #ffffff; border: 2px solid var(--secondary-blue); margin-bottom: 1.75rem; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
          <div class="hospital-group-header" style="color: var(--primary-navy-dark); font-size: 1.05rem; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span>🏥</span>
              <strong>${ward.hospital_name} — ${ward.ward_name_th}</strong>
            </div>
            <button type="button" class="btn-remove-ward" data-remove-ward="${wardCode}" title="ยกเลิกการประเมินหอนี้">
              🗑️ ยกเลิกหอนี้
            </button>
          </div>

          <!-- Main rating item for this ward -->
          <div class="question-card" id="card-${qCode}" style="border-left: 4px solid var(--secondary-blue); margin-bottom: 1rem;">
            <div class="question-header">
              <span class="question-num-tag">${ward.ward_name_th}</span>
              <p class="question-text">
                ความเหมาะสมของประสบการณ์การเรียนรู้ที่ได้รับจากการขึ้นฝึกปฏิบัติบนหอผู้ป่วยนี้ <span style="color: #ef4444;">*</span>
              </p>
            </div>
            <div class="rating-container" data-qcode="${qCode}"></div>
          </div>

          <!-- Optional comment for this ward -->
          <div class="question-card" style="margin-top: 0.85rem; background: #f8fafc; border: 1px solid #e2e8f0;">
            <div class="question-header">
              <span class="question-num-tag">ข้อเสนอแนะเพิ่มเติม</span>
              <p class="question-text" style="font-size: 0.88rem;">
                ข้อเสนอแนะเพิ่มเติมสำหรับ ${ward.ward_name_th} (${ward.hospital_name}) <span style="color: #64748b; font-size: 0.82rem;">(ไม่บังคับ)</span>
              </p>
            </div>
            <textarea id="ward-extra-${wardCode}" class="comment-textarea" placeholder="ระบุข้อเสนอแนะเพิ่มเติมสำหรับหอผู้ป่วยนี้ (ถ้ามี)...">${state.answers[extraCode] ? state.answers[extraCode].comment : ''}</textarea>
          </div>

          <!-- Actions footer inside card -->
          <div class="ward-card-actions">
            <button type="button" class="btn-jump-to-top" onclick="document.getElementById('wardJumpPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });">
              ↑ กระโดดกลับไปเลือกหออื่น
            </button>
            <span style="font-size: 0.8rem; color: var(--text-muted);">
              ${state.answers[qCode] && state.answers[qCode].score !== null ? '✓ ประเมินเรียบร้อยแล้ว' : '⏳ รอการให้คะแนน'}
            </span>
          </div>
        </div>
      `;
    }

    dynamicWardsContainer.innerHTML = html;

    // Initialize rating containers for the dynamic ward cards
    for (const wardCode of state.selectedWards) {
      const qCode = `SEC_4_3_WARD_${wardCode}_EXP`;
      const container = dynamicWardsContainer.querySelector(`[data-qcode="${qCode}"]`);
      if (container) {
        renderRatingGroup(container, qCode);
      }

      // Attach extra comment listener
      const extraTextarea = document.getElementById(`ward-extra-${wardCode}`);
      if (extraTextarea) {
        extraTextarea.addEventListener('input', (e) => {
          const extraCode = `SEC_4_3_WARD_${wardCode}_EXTRA`;
          if (!state.answers[extraCode]) {
            state.answers[extraCode] = { score: null, comment: '' };
          }
          state.answers[extraCode].comment = e.target.value;
        });
      }
    }

    // Attach remove ward buttons
    document.querySelectorAll('[data-remove-ward]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wardToRemove = btn.dataset.removeWard;
        state.selectedWards = state.selectedWards.filter(w => w !== wardToRemove);
        delete state.answers[`SEC_4_3_WARD_${wardToRemove}_EXP`];
        delete state.answers[`SEC_4_3_WARD_${wardToRemove}_EXTRA`];

        if (state.selectedWards.length === 0) {
          state.wardTrainingStatus = null;
        }

        renderDynamicWardCards();
        updateWardJumpButtonState();
      });
    });
  }

  // 5. Validation Logic per Step
  function validateCurrentStep() {
    let isValid = true;
    let firstErrorElement = null;

    function recordError(code, message) {
      isValid = false;
      setItemError(code, message);
      if (!firstErrorElement) {
        firstErrorElement = document.getElementById(`card-${code}`) || document.getElementById(`err-${code}`);
      }
    }

    // Step 1: Term & Section
    if (state.currentStep === 1) {
      if (!state.selectedTerm) {
        isValid = false;
        document.getElementById('card-term').classList.add('has-error');
        document.getElementById('err-studentTerm').style.display = 'flex';
        firstErrorElement = document.getElementById('card-term');
      }
      if (!state.selectedSection) {
        isValid = false;
        document.getElementById('card-section').classList.add('has-error');
        document.getElementById('err-studentSection').style.display = 'flex';
        if (!firstErrorElement) firstErrorElement = document.getElementById('card-section');
      }
    }

    // Step 2: 4.1 Preparation (Skills + 9 clinical teaching items)
    if (state.currentStep === 2) {
      const step2Codes = [
        'SEC_4_1_1_SKILLS_W1',
        'SEC_4_1_2_NEO_BRIEF', 'SEC_4_1_2_NEO_TIME', 'SEC_4_1_2_NEO_EQUIP',
        'SEC_4_1_2_CHILD_BRIEF', 'SEC_4_1_2_CHILD_TIME', 'SEC_4_1_2_CHILD_EQUIP',
        'SEC_4_1_2_CHOKE_BRIEF', 'SEC_4_1_2_CHOKE_TIME', 'SEC_4_1_2_CHOKE_EQUIP'
      ];

      for (const code of step2Codes) {
        const item = state.answers[code];
        if (!item || item.score === null || item.score === undefined) {
          recordError(code, 'กรุณาเลือกระดับคะแนน (1-5 หรือ N/A)');
        } else if ([1, 2, 3].includes(item.score)) {
          if (!item.comment || item.comment.trim().length === 0) {
            recordError(code, `เนื่องจากนักศึกษาให้ ${item.score} คะแนน กรุณาระบุข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้`);
          }
        }
      }
    }

    // Step 3: 4.2 Early Childhood
    if (state.currentStep === 3) {
      if (!state.earlyChildhoodTrained) {
        isValid = false;
        document.getElementById('card-screening-ec').classList.add('has-error');
        document.getElementById('err-earlyChildhoodScreening').style.display = 'flex';
        firstErrorElement = document.getElementById('card-screening-ec');
      } else if (state.earlyChildhoodTrained === 'trained') {
        const item = state.answers['SEC_4_2_EXP'];
        if (!item || item.score === null || item.score === undefined) {
          recordError('SEC_4_2_EXP', 'กรุณาเลือกระดับคะแนน (1-5 หรือ N/A)');
        } else if ([1, 2, 3].includes(item.score)) {
          if (!item.comment || item.comment.trim().length === 0) {
            recordError('SEC_4_2_EXP', `เนื่องจากนักศึกษาให้ ${item.score} คะแนน กรุณาระบุข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้`);
          }
        }
      }
    }

    // Step 4: 4.3 Hospital Wards
    if (state.currentStep === 4) {
      if (!state.wardTrainingStatus) {
        isValid = false;
        document.getElementById('err-wardSelection').style.display = 'flex';
        firstErrorElement = document.getElementById('wardJumpPanel');
      } else if (state.wardTrainingStatus === 'trained') {
        if (!state.selectedWards || state.selectedWards.length === 0) {
          isValid = false;
          document.getElementById('err-wardSelection').style.display = 'flex';
          firstErrorElement = document.getElementById('wardJumpPanel');
        } else {
          for (const wardCode of state.selectedWards) {
            const qCode = `SEC_4_3_WARD_${wardCode}_EXP`;
            const item = state.answers[qCode];
            if (!item || item.score === null || item.score === undefined) {
              recordError(qCode, 'กรุณาเลือกระดับคะแนน (1-5 หรือ N/A)');
            } else if ([1, 2, 3].includes(item.score)) {
              if (!item.comment || item.comment.trim().length === 0) {
                recordError(qCode, `เนื่องจากนักศึกษาให้ ${item.score} คะแนน กรุณาระบุข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้`);
              }
            }
          }
        }
      }
    }

    // Step 5: 4.4 Play Activity & 4.5 Case Discussion
    if (state.currentStep === 5) {
      const step5Codes = ['SEC_4_4_PLAY_ACTIVITY', 'SEC_4_5_SELECTED_CASE'];
      for (const code of step5Codes) {
        const item = state.answers[code];
        if (!item || item.score === null || item.score === undefined) {
          recordError(code, 'กรุณาเลือกระดับคะแนน (1-5 หรือ N/A)');
        } else if ([1, 2, 3].includes(item.score)) {
          if (!item.comment || item.comment.trim().length === 0) {
            recordError(code, `เนื่องจากนักศึกษาให้ ${item.score} คะแนน กรุณาระบุข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้`);
          }
        }
      }
    }

    // Step 6: 4.6 OSPE (7 items)
    if (state.currentStep === 6) {
      const step6Codes = [
        'SEC_4_6_OSPE_1_NEB', 'SEC_4_6_OSPE_2_SUCTION', 'SEC_4_6_OSPE_3_IV',
        'SEC_4_6_OSPE_4_NG', 'SEC_4_6_OSPE_5_WRITTEN', 'SEC_4_6_OSPE_6_TIME', 'SEC_4_6_OSPE_7_OVERALL'
      ];
      for (const code of step6Codes) {
        const item = state.answers[code];
        if (!item || item.score === null || item.score === undefined) {
          recordError(code, 'กรุณาเลือกระดับคะแนน (1-5 หรือ N/A)');
        } else if ([1, 2, 3].includes(item.score)) {
          if (!item.comment || item.comment.trim().length === 0) {
            recordError(code, `เนื่องจากนักศึกษาให้ ${item.score} คะแนน กรุณาระบุข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้`);
          }
        }
      }
    }

    // Step 7: 4.7 Course Overall Satisfaction
    if (state.currentStep === 7) {
      const item = state.answers['SEC_4_7_OVERALL_SATISFACTION'];
      if (!item || item.score === null || item.score === undefined) {
        recordError('SEC_4_7_OVERALL_SATISFACTION', 'กรุณาเลือกระดับคะแนน (1-5 หรือ N/A)');
      } else if ([1, 2, 3].includes(item.score)) {
        if (!item.comment || item.comment.trim().length === 0) {
          recordError('SEC_4_7_OVERALL_SATISFACTION', `เนื่องจากนักศึกษาให้ ${item.score} คะแนน กรุณาระบุข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้`);
        }
      }
    }

    // Scroll to the first error smoothly
    if (!isValid && firstErrorElement) {
      firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return isValid;
  }

  // 6. Navigation Control
  function goNext() {
    if (!validateCurrentStep()) return;

    if (state.currentStep < state.totalSteps) {
      state.currentStep++;
      if (state.currentStep === 8) {
        renderReviewSummary();
      }
      updateUI();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goPrev() {
    if (state.currentStep > 1) {
      state.currentStep--;
      updateUI();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // 7. Update UI on Step Change
  function updateUI() {
    // Show active step container
    for (let i = 1; i <= state.totalSteps; i++) {
      const stepEl = document.getElementById(`step-${i}`);
      if (stepEl) {
        if (i === state.currentStep) stepEl.classList.add('active');
        else stepEl.classList.remove('active');
      }
    }

    // Stepper header & Progress bar
    const stepTitles = [
      'ข้อมูลเริ่มต้น: ปีการศึกษา & Section',
      '4.1 การเตรียมความพร้อม',
      '4.2 ฝ่ายพัฒนาเด็กปฐมวัย',
      '4.3 ประสบการณ์บนหอผู้ป่วย',
      '4.4 การเล่น & 4.5 กรณีเลือกสรร',
      '4.6 การสอบลงกอง (OSPE)',
      '4.7 ความพึงพอใจในภาพรวม',
      'ตรวจทานข้อมูลก่อนส่ง'
    ];

    const currentTitle = stepTitles[state.currentStep - 1] || '';
    stepperTitle.textContent = `ขั้นตอนที่ ${state.currentStep} จาก ${state.totalSteps}: ${currentTitle}`;
    const pct = Math.round((state.currentStep / state.totalSteps) * 100);
    stepperPercent.textContent = `${pct}%`;
    progressBar.style.width = `${pct}%`;
    document.getElementById('stepProgressText').textContent = `หน้า ${state.currentStep} จาก ${state.totalSteps}`;

    // Step Dots
    stepDots.forEach(dot => {
      const s = parseInt(dot.dataset.step, 10);
      dot.classList.remove('active', 'completed');
      if (s === state.currentStep) dot.classList.add('active');
      else if (s < state.currentStep) dot.classList.add('completed');
    });

    // Nav Buttons
    btnPrev.disabled = state.currentStep === 1;

    if (state.currentStep === state.totalSteps) {
      btnNext.style.display = 'none';
      btnSubmit.style.display = 'inline-flex';
    } else {
      btnNext.style.display = 'inline-flex';
      btnSubmit.style.display = 'none';
    }
  }

  // 8. Render Review Summary (Step 8)
  function renderReviewSummary() {
    const reviewContent = document.getElementById('reviewSummaryContent');

    function renderItemRow(label, ans) {
      if (!ans || ans.score === null || ans.score === undefined) {
        return `
          <div class="review-item-row">
            <span class="review-q-text">${label}</span>
            <span class="review-score-badge">ยังไม่ได้ประเมิน</span>
          </div>
        `;
      }
      const scoreBadgeClass = ans.score === 'NA' ? '' : (ans.score >= 4 ? 'high' : 'low');
      const scoreText = ans.score === 'NA' ? 'N/A' : `${ans.score} คะแนน`;

      return `
        <div class="review-item-row">
          <div style="flex: 1;">
            <div class="review-q-text">${label}</div>
            ${ans.comment ? `<div class="review-comment-snippet">💬 "${escapeHtml(ans.comment)}"</div>` : ''}
          </div>
          <span class="review-score-badge ${scoreBadgeClass}">${scoreText}</span>
        </div>
      `;
    }

    let html = `
      <!-- Term & Section Summary -->
      <div class="review-summary-card">
        <div class="review-section-header">ภาคการศึกษาและ Section ของนักศึกษา</div>
        <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
          <div>
            <span style="font-size: 0.8rem; color: var(--text-muted);">ภาคการศึกษา/ปีการศึกษา:</span>
            <div style="font-size: 1.15rem; font-weight: 700; color: var(--primary-navy);">${state.selectedTerm || '-'}</div>
          </div>
          <div style="border-left: 2px solid #e2e8f0; padding-left: 1rem;">
            <span style="font-size: 0.8rem; color: var(--text-muted);">Section:</span>
            <div style="font-size: 1.15rem; font-weight: 700; color: var(--primary-navy);">${state.selectedSection || '-'}</div>
          </div>
        </div>
      </div>

      <!-- Section 4.1 -->
      <div class="review-summary-card">
        <div class="review-section-header">4.1 การเตรียมความพร้อมในการปฏิบัติการพยาบาลเด็ก</div>
        ${renderItemRow('4.1.1 การสอบทักษะทางการพยาบาลเด็กในสัปดาห์ที่ 1', state.answers['SEC_4_1_1_SKILLS_W1'])}
        ${renderItemRow('ฐาน ก. CPR ทารกแรกเกิด - การ Brief', state.answers['SEC_4_1_2_NEO_BRIEF'])}
        ${renderItemRow('ฐาน ก. CPR ทารกแรกเกิด - ระยะเวลา', state.answers['SEC_4_1_2_NEO_TIME'])}
        ${renderItemRow('ฐาน ก. CPR ทารกแรกเกิด - อุปกรณ์', state.answers['SEC_4_1_2_NEO_EQUIP'])}
        ${renderItemRow('ฐาน ข. CPR เด็กเล็ก/โต - การ Brief', state.answers['SEC_4_1_2_CHILD_BRIEF'])}
        ${renderItemRow('ฐาน ข. CPR เด็กเล็ก/โต - ระยะเวลา', state.answers['SEC_4_1_2_CHILD_TIME'])}
        ${renderItemRow('ฐาน ข. CPR เด็กเล็ก/โต - อุปกรณ์', state.answers['SEC_4_1_2_CHILD_EQUIP'])}
        ${renderItemRow('ฐาน ค. Choking - การ Brief', state.answers['SEC_4_1_2_CHOKE_BRIEF'])}
        ${renderItemRow('ฐาน ค. Choking - ระยะเวลา', state.answers['SEC_4_1_2_CHOKE_TIME'])}
        ${renderItemRow('ฐาน ค. Choking - อุปกรณ์', state.answers['SEC_4_1_2_CHOKE_EQUIP'])}
      </div>

      <!-- Section 4.2 -->
      <div class="review-summary-card">
        <div class="review-section-header">4.2 ประสบการณ์ฝ่ายพัฒนาเด็กปฐมวัย</div>
        <div style="margin-bottom: 0.5rem; font-size: 0.88rem;">
          สถานะ: <strong>${state.earlyChildhoodTrained === 'trained' ? '✅ ได้ขึ้นฝึก' : '❌ ไม่ได้ขึ้นฝึก'}</strong>
        </div>
        ${state.earlyChildhoodTrained === 'trained' ? renderItemRow('ความเหมาะสมของประสบการณ์เรียนรู้', state.answers['SEC_4_2_EXP']) : ''}
        ${state.earlyChildhoodExtraSuggestion ? `<div class="review-comment-snippet" style="margin-top: 0.5rem;">ข้อเสนอแนะเพิ่มเติม: "${escapeHtml(state.earlyChildhoodExtraSuggestion)}"</div>` : ''}
      </div>

      <!-- Section 4.3 -->
      <div class="review-summary-card">
        <div class="review-section-header">4.3 ประสบการณ์บนหอผู้ป่วย</div>
        ${state.wardTrainingStatus === 'not_trained' ? `
          <div style="font-size: 0.88rem; color: #64748b;">สถานะ: <strong>ไม่ได้ขึ้นฝึกบนหอผู้ป่วย</strong></div>
        ` : `
          <div style="margin-bottom: 0.5rem; font-size: 0.88rem; color: #64748b;">
            หอผู้ป่วยที่นักศึกษาเลือกประเมิน (${state.selectedWards.length} หอผู้ป่วย):
          </div>
          ${state.selectedWards.map(wCode => {
            const w = state.wardMap[wCode];
            const qCode = `SEC_4_3_WARD_${wCode}_EXP`;
            const extraCode = `SEC_4_3_WARD_${wCode}_EXTRA`;
            const extraAns = state.answers[extraCode];
            return `
              <div style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px dashed #e2e8f0;">
                <div style="font-weight: 600; color: var(--primary-navy); font-size: 0.9rem;">
                  🏥 ${w ? `${w.hospital_name} - ${w.ward_name_th}` : wCode}
                </div>
                ${renderItemRow('ความเหมาะสมของประสบการณ์เรียนรู้', state.answers[qCode])}
                ${extraAns && extraAns.comment ? `<div class="review-comment-snippet">ข้อเสนอแนะเพิ่มเติมสำหรับหอนี้: "${escapeHtml(extraAns.comment)}"</div>` : ''}
              </div>
            `;
          }).join('')}
        `}
      </div>

      <!-- Section 4.4 & 4.5 -->
      <div class="review-summary-card">
        <div class="review-section-header">4.4 กิจกรรมการเล่น & 4.5 กรณีเลือกสรร</div>
        ${renderItemRow('4.4 การจัดกิจกรรมการเล่นบนหอผู้ป่วย', state.answers['SEC_4_4_PLAY_ACTIVITY'])}
        ${renderItemRow('4.5 การอภิปรายกรณีเลือกสรรสัปดาห์ที่ 8', state.answers['SEC_4_5_SELECTED_CASE'])}
      </div>

      <!-- Section 4.6 -->
      <div class="review-summary-card">
        <div class="review-section-header">4.6 การสอบลงกอง (OSPE) 7 ข้อ</div>
        ${renderItemRow('ข้อ 1 ทักษะการพ่นยา', state.answers['SEC_4_6_OSPE_1_NEB'])}
        ${renderItemRow('ข้อ 2 ทักษะการดูดเสมหะ (Suction)', state.answers['SEC_4_6_OSPE_2_SUCTION'])}
        ${renderItemRow('ข้อ 3 ทักษะการให้ยาฉีดทางหลอดเลือดดำ', state.answers['SEC_4_6_OSPE_3_IV'])}
        ${renderItemRow('ข้อ 4 ทักษะการใส่สายให้อาหารทางจมูก (NG)', state.answers['SEC_4_6_OSPE_4_NG'])}
        ${renderItemRow('ข้อ 5 จำนวนข้อสอบข้อเขียน 10 ข้อ', state.answers['SEC_4_6_OSPE_5_WRITTEN'])}
        ${renderItemRow('ข้อ 6 ระยะเวลาสอบ 7 นาทีต่อฐาน', state.answers['SEC_4_6_OSPE_6_TIME'])}
        ${renderItemRow('ข้อ 7 ความพึงพอใจโดยรวมต่อการสอบ OSPE', state.answers['SEC_4_6_OSPE_7_OVERALL'])}
      </div>

      <!-- Section 4.7 -->
      <div class="review-summary-card">
        <div class="review-section-header">4.7 ความพึงพอใจในภาพรวมของรายวิชา</div>
        ${renderItemRow('ความพึงพอใจในภาพรวมของการจัดการเรียนการสอน', state.answers['SEC_4_7_OVERALL_SATISFACTION'])}
        ${state.impressionsToKeep ? `<div class="review-comment-snippet" style="margin-top: 0.5rem;">สิ่งที่ประทับใจ: "${escapeHtml(state.impressionsToKeep)}"</div>` : ''}
        ${state.improvementsAndSuggestions ? `<div class="review-comment-snippet" style="margin-top: 0.5rem;">สิ่งที่ควรปรับปรุง: "${escapeHtml(state.improvementsAndSuggestions)}"</div>` : ''}
      </div>
    `;

    reviewContent.innerHTML = html;
  }

  // Helper escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 9. Submit Handler (with Idempotency Token and Double-Click Prevention)
  async function handleSubmit() {
    const submitErrorAlert = document.getElementById('submitErrorAlert');
    const submitErrorMessage = document.getElementById('submitErrorMessage');
    submitErrorAlert.style.display = 'none';

    // Disable buttons and show spinner
    btnSubmit.disabled = true;
    btnPrev.disabled = true;
    submitBtnText.style.display = 'none';
    submitBtnSpinner.style.display = 'inline-block';

    const payload = {
      submission_token: state.submissionToken,
      round_id: state.round.id,
      term: state.selectedTerm,
      section: state.selectedSection,
      early_childhood_trained: state.earlyChildhoodTrained,
      early_childhood_general_suggestion: state.earlyChildhoodExtraSuggestion,
      ward_training_status: state.wardTrainingStatus,
      selected_wards: state.wardTrainingStatus === 'trained' ? state.selectedWards : [],
      answers: state.answers,
      impressions_to_keep: state.impressionsToKeep,
      improvements_and_suggestions: state.improvementsAndSuggestions
    };

    try {
      const response = await fetch('/api/evaluation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        // Show thank you screen
        document.getElementById('step-8').classList.remove('active');
        document.getElementById('step-thankyou').classList.add('active');
        document.getElementById('displaySubmissionToken').textContent = state.submissionToken;
        document.getElementById('stepperCard').style.display = 'none';
        navigationBar.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        // Error handling: keep inputs, show message, allow retry
        submitErrorMessage.textContent = result.message || result.error || 'เกิดข้อผิดพลาดในการบันทึกคำตอบ';
        submitErrorAlert.style.display = 'block';
        submitErrorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btnSubmit.disabled = false;
        btnPrev.disabled = false;
        submitBtnText.style.display = 'inline';
        submitBtnSpinner.style.display = 'none';
      }
    } catch (err) {
      console.error('Submit network error:', err);
      submitErrorMessage.textContent = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองส่งใหม่อีกครั้ง';
      submitErrorAlert.style.display = 'block';
      submitErrorAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
      btnSubmit.disabled = false;
      btnPrev.disabled = false;
      submitBtnText.style.display = 'inline';
      submitBtnSpinner.style.display = 'none';
    }
  }

  // Launch app when DOM is ready
  document.addEventListener('DOMContentLoaded', init);

})();
