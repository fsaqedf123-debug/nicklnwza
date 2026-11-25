const config = require('../config');
const { db } = require('../db/database');

/**
 * Validates the submission payload according to all strict requirements
 */
function validateEvaluationSubmission(req, res, next) {
  const {
    submission_token,
    round_id,
    term,
    section,
    early_childhood_trained,
    early_childhood_general_suggestion,
    ward_training_status,
    selected_wards,
    answers,
    impressions_to_keep,
    improvements_and_suggestions
  } = req.body;

  const errors = [];

  // 1. Idempotency Token
  if (!submission_token || typeof submission_token !== 'string' || submission_token.trim().length === 0) {
    errors.push({ field: 'submission_token', message: 'ไม่พบรหัสส่งคำตอบ (Submission Token)' });
  }

  // 2. Round or Term check
  let targetRound = null;
  if (term && typeof term === 'string') {
    const parts = term.trim().split('/');
    if (parts.length === 2) {
      const sem = parseInt(parts[0], 10);
      const yr = parseInt(parts[1], 10);
      const code = `${yr}-${sem}`;
      targetRound = db.prepare('SELECT id, status, form_version FROM evaluation_rounds WHERE round_code = ?').get(code);
      if (!targetRound) {
        // Auto-create round if selected from term button
        const now = new Date().toISOString();
        const ins = db.prepare(`
          INSERT INTO evaluation_rounds (round_code, academic_year, semester, title, status, form_version, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'open', 'v2', ?, ?, ?)
        `);
        const rTitle = `ภาคการศึกษาที่ ${sem} ปีการศึกษา ${yr}`;
        const resIns = ins.run(code, yr, sem, rTitle, `รอบประเมิน ${sem}/${yr}`, now, now);
        targetRound = { id: Number(resIns.lastInsertRowid), status: 'open', form_version: 'v2' };
      }
    }
  }

  if (!targetRound && round_id) {
    targetRound = db.prepare('SELECT id, status, form_version FROM evaluation_rounds WHERE id = ?').get(round_id);
  }

  if (!targetRound) {
    errors.push({ field: 'round_id', message: 'กรุณาเลือกภาคการศึกษาและปีการศึกษา' });
  } else if (targetRound.status !== 'open') {
    errors.push({ field: 'round_status', message: 'รอบการประเมินนี้ปิดรับคำตอบแล้ว ไม่สามารถส่งแบบประเมินได้' });
  } else {
    req.evaluationRound = targetRound;
  }

  // 3. Section validation
  if (!section || !config.sections.includes(section)) {
    errors.push({ field: 'section', message: 'กรุณาเลือก Section ให้ถูกต้อง (Sec 01, Sec 02, Sec 03 หรือ Sec 04)' });
  }

  // 4. Section 4.2 Early childhood training status
  if (!early_childhood_trained || !['trained', 'not_trained'].includes(early_childhood_trained)) {
    errors.push({ field: 'early_childhood_trained', message: 'กรุณาระบุว่านักศึกษาได้ขึ้นฝึก ณ ฝ่ายพัฒนาเด็กปฐมวัยหรือไม่' });
  }

  // 5. Section 4.3 Ward training status and selections
  if (!ward_training_status || !['trained', 'not_trained'].includes(ward_training_status)) {
    errors.push({ field: 'ward_training_status', message: 'กรุณาระบุสถานะการขึ้นฝึกปฏิบัติบนหอผู้ป่วย' });
  } else if (ward_training_status === 'trained') {
    if (!Array.isArray(selected_wards) || selected_wards.length === 0) {
      errors.push({ field: 'selected_wards', message: 'กรุณาเลือกหอผู้ป่วยที่นักศึกษาได้ขึ้นฝึกปฏิบัติอย่างน้อย 1 หอผู้ป่วย' });
    } else if (selected_wards.includes('WARD_NONE')) {
      errors.push({ field: 'selected_wards', message: 'ไม่สามารถเลือก "ไม่ได้ขึ้นฝึกบนหอผู้ป่วย" ร่วมกับหอผู้ป่วยอื่นได้' });
    }
  } else if (ward_training_status === 'not_trained') {
    if (Array.isArray(selected_wards) && selected_wards.some(w => w !== 'WARD_NONE')) {
      errors.push({ field: 'selected_wards', message: 'เมื่อเลือกไม่ได้ขึ้นฝึกบนหอผู้ป่วย จะต้องไม่เลือกหอผู้ป่วยอื่น' });
    }
  }

  // Helper function to validate an individual rating answer
  if (!answers || typeof answers !== 'object') {
    errors.push({ field: 'answers', message: 'ไม่พบข้อมูลคำตอบแบบประเมิน' });
    return res.status(400).json({ success: false, errors });
  }

  function checkRatingItem(code, label) {
    const item = answers[code];
    if (!item) {
      errors.push({ field: code, message: `ยังไม่ได้ตอบข้อ: ${label}` });
      return;
    }

    const { score, comment } = item;
    // Score must be 1, 2, 3, 4, 5, or 'NA'
    const validScores = [1, 2, 3, 4, 5, 'NA'];
    if (!validScores.includes(score)) {
      errors.push({ field: code, message: `กรุณาเลือกระดับคะแนน (1-5 หรือ N/A) สำหรับ: ${label}` });
      return;
    }

    // If score is 1, 2, or 3: comment is STRICTLY MANDATORY (non-empty trimmed)
    if ([1, 2, 3].includes(score)) {
      if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
        errors.push({
          field: `${code}_comment`,
          message: `เนื่องจากนักศึกษาให้คะแนน ${score} ในข้อ "${label}" กรุณาระบุข้อคิดเห็น/ข้อเสนอแนะสำหรับข้อนี้`
        });
      }
    }
  }

  // Section 4.1.1
  checkRatingItem('SEC_4_1_1_SKILLS_W1', '4.1.1 การสอบทักษะทางการพยาบาลเด็กในสัปดาห์ที่ 1');

  // Section 4.1.2 Clinical Teaching (9 items)
  const clinicalTeachingCodes = [
    { code: 'SEC_4_1_2_NEO_BRIEF', label: 'ฐาน ก. CPR ทารกแรกเกิด - การทบทวนก่อนฝึก (Brief)' },
    { code: 'SEC_4_1_2_NEO_TIME', label: 'ฐาน ก. CPR ทารกแรกเกิด - ระยะเวลาฝึก' },
    { code: 'SEC_4_1_2_NEO_EQUIP', label: 'ฐาน ก. CPR ทารกแรกเกิด - ความเพียงพออุปกรณ์' },
    { code: 'SEC_4_1_2_CHILD_BRIEF', label: 'ฐาน ข. CPR เด็กเล็ก/โต - การทบทวนก่อนฝึก (Brief)' },
    { code: 'SEC_4_1_2_CHILD_TIME', label: 'ฐาน ข. CPR เด็กเล็ก/โต - ระยะเวลาฝึก' },
    { code: 'SEC_4_1_2_CHILD_EQUIP', label: 'ฐาน ข. CPR เด็กเล็ก/โต - ความเพียงพออุปกรณ์' },
    { code: 'SEC_4_1_2_CHOKE_BRIEF', label: 'ฐาน ค. Choking - การทบทวนก่อนฝึก (Brief)' },
    { code: 'SEC_4_1_2_CHOKE_TIME', label: 'ฐาน ค. Choking - ระยะเวลาฝึก' },
    { code: 'SEC_4_1_2_CHOKE_EQUIP', label: 'ฐาน ค. Choking - ความเพียงพออุปกรณ์' }
  ];
  for (const ct of clinicalTeachingCodes) {
    checkRatingItem(ct.code, ct.label);
  }

  // Section 4.2 Early Childhood
  if (early_childhood_trained === 'trained') {
    checkRatingItem('SEC_4_2_EXP', '4.2 ประสบการณ์ฝ่ายพัฒนาเด็กปฐมวัย');
  }

  // Section 4.3 Wards
  if (ward_training_status === 'trained' && Array.isArray(selected_wards)) {
    // Fetch valid wards from DB
    const validWards = db.prepare('SELECT w.code, w.ward_name_th, h.name_th as hosp_name FROM ward_definitions w JOIN hospital_definitions h ON w.hospital_code = h.code').all();
    const wardMap = new Map(validWards.map(w => [w.code, `${w.hosp_name} - ${w.ward_name_th}`]));

    for (const wardCode of selected_wards) {
      if (!wardMap.has(wardCode)) {
        errors.push({ field: 'selected_wards', message: `รหัสหอผู้ป่วยไม่ถูกต้อง: ${wardCode}` });
        continue;
      }
      const qCode = `SEC_4_3_WARD_${wardCode}_EXP`;
      const wardLabel = `4.3 ${wardMap.get(wardCode)}`;
      checkRatingItem(qCode, wardLabel);
    }
  }

  // Section 4.4 Play Activity
  checkRatingItem('SEC_4_4_PLAY_ACTIVITY', '4.4 การจัดกิจกรรมการเล่นบนหอผู้ป่วย');

  // Section 4.5 Selected Case Discussion
  checkRatingItem('SEC_4_5_SELECTED_CASE', '4.5 การอภิปรายกรณีเลือกสรรในวันแรกของสัปดาห์ที่ 8');

  // Section 4.6 OSPE (7 items)
  const ospeCodes = [
    { code: 'SEC_4_6_OSPE_1_NEB', label: '4.6 ข้อ 1 ทักษะการพ่นยา' },
    { code: 'SEC_4_6_OSPE_2_SUCTION', label: '4.6 ข้อ 2 ทักษะการดูดเสมหะ (Suction)' },
    { code: 'SEC_4_6_OSPE_3_IV', label: '4.6 ข้อ 3 ทักษะการให้ยาฉีดทางหลอดเลือดดำ' },
    { code: 'SEC_4_6_OSPE_4_NG', label: '4.6 ข้อ 4 ทักษะการใส่สายให้อาหารทางจมูก (NG)' },
    { code: 'SEC_4_6_OSPE_5_WRITTEN', label: '4.6 ข้อ 5 จำนวนข้อสอบข้อเขียน 10 ข้อ' },
    { code: 'SEC_4_6_OSPE_6_TIME', label: '4.6 ข้อ 6 ระยะเวลาสอบ 7 นาทีต่อฐาน' },
    { code: 'SEC_4_6_OSPE_7_OVERALL', label: '4.6 ข้อ 7 ความพึงพอใจโดยรวมต่อการสอบ OSPE' }
  ];
  for (const osp of ospeCodes) {
    checkRatingItem(osp.code, osp.label);
  }

  // Section 4.7 Course Overall Satisfaction
  checkRatingItem('SEC_4_7_OVERALL_SATISFACTION', '4.7 ความพึงพอใจในภาพรวมของรายวิชา');

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'ข้อมูลการประเมินยังไม่ครบถ้วนหรือไม่ถูกต้องตามเงื่อนไข',
      errors
    });
  }

  next();
}

module.exports = {
  validateEvaluationSubmission
};
