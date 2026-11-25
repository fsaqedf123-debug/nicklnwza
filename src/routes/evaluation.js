const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const config = require('../config');
const { db } = require('../db/database');
const { validateEvaluationSubmission } = require('../middleware/validate');

/**
 * GET /api/evaluation/active-round
 * Provides configuration, active round info, hospitals & wards hierarchy
 */
router.get('/active-round', (req, res) => {
  try {
    // Find active (open) evaluation round
    const activeRound = db.prepare(`
      SELECT id, round_code, academic_year, semester, title, status, form_version, notes
      FROM evaluation_rounds
      WHERE status = 'open'
      ORDER BY id DESC
      LIMIT 1
    `).get();

    // Fetch hospitals and wards
    const hospitals = db.prepare(`
      SELECT code, name_th, sort_order
      FROM hospital_definitions
      ORDER BY sort_order ASC
    `).all();

    const wards = db.prepare(`
      SELECT code, hospital_code, ward_name_th, short_code, sort_order
      FROM ward_definitions
      ORDER BY sort_order ASC
    `).all();

    // Group wards by hospital
    const hospitalTree = hospitals.map(h => ({
      ...h,
      wards: wards.filter(w => w.hospital_code === h.code)
    }));

    return res.json({
      success: true,
      hasActiveRound: !!activeRound,
      round: activeRound || null,
      sections: config.sections,
      terms: config.terms,
      hospitals: hospitalTree,
      ratingScale: config.ratingScale,
      systemTitle: config.systemTitle,
      facultyName: config.facultyName,
      universityName: config.universityName
    });
  } catch (err) {
    console.error('Error in /api/evaluation/active-round:', err);
    return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดข้อมูลรอบการประเมิน' });
  }
});

/**
 * POST /api/evaluation/submit
 * Handles anonymous student evaluation submission with idempotency & atomic transaction
 */
router.post('/submit', validateEvaluationSubmission, (req, res) => {
  const {
    submission_token,
    round_id,
    section,
    early_childhood_trained,
    early_childhood_general_suggestion,
    ward_training_status,
    selected_wards,
    answers,
    impressions_to_keep,
    improvements_and_suggestions
  } = req.body;

  const round = req.evaluationRound;

  // 1. Check idempotency (prevent duplicate submissions if already received with this token)
  const existingSub = db.prepare('SELECT id, submission_token FROM submissions WHERE submission_token = ?').get(submission_token);
  if (existingSub) {
    return res.json({
      success: true,
      isDuplicate: true,
      submissionId: existingSub.id,
      message: 'บันทึกผลประเมินเรียบร้อยแล้ว ขอบคุณสำหรับข้อคิดเห็นและข้อเสนอแนะของนักศึกษา ซึ่งจะนำไปใช้พัฒนาการจัดการเรียนการสอนรายวิชา 640-394 ปฏิบัติการพยาบาลเด็กต่อไป'
    });
  }

  // Hash IP address with salt for basic rate limiting/anti-replay without storing identifiable IP
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const ipHash = crypto.createHash('sha256').update(clientIp + 'psu-salt-640').digest('hex');

  // Prepare questions definition map
  const questionRows = db.prepare('SELECT code, section_num, is_rating, introduced_in_version FROM question_definitions').all();
  const qMap = new Map(questionRows.map(q => [q.code, q]));

  try {
    // Execute atomic transaction
    db.exec('BEGIN TRANSACTION;');

    // 1. Insert into submissions
    const insertSubStmt = db.prepare(`
      INSERT INTO submissions (
        submission_token, round_id, form_version, section, submitted_at, ip_hash, is_test_data,
        early_childhood_trained, early_childhood_general_suggestion,
        ward_training_status, selected_wards_json,
        impressions_to_keep, improvements_and_suggestions
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const subResult = insertSubStmt.run(
      submission_token,
      round.id,
      round.form_version || config.currentFormVersion,
      section,
      now,
      ipHash,
      early_childhood_trained,
      early_childhood_general_suggestion ? early_childhood_general_suggestion.trim() : null,
      ward_training_status,
      JSON.stringify(ward_training_status === 'trained' ? selected_wards : []),
      impressions_to_keep ? impressions_to_keep.trim() : null,
      improvements_and_suggestions ? improvements_and_suggestions.trim() : null
    );

    const submissionId = Number(subResult.lastInsertRowid);

    // 2. Insert into submission_answers
    const insertAnswerStmt = db.prepare(`
      INSERT INTO submission_answers (
        submission_id, question_code, section_num, status, score, comment, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Helper to insert an answer record
    function recordAnswer(code, sectionNum, status, score, comment, metadata) {
      insertAnswerStmt.run(
        submissionId,
        code,
        sectionNum,
        status,
        score !== null && score !== undefined ? score : null,
        comment && comment.trim().length > 0 ? comment.trim() : null,
        metadata ? JSON.stringify(metadata) : null
      );
    }

    // A. Section 4.1.1
    const a411 = answers['SEC_4_1_1_SKILLS_W1'];
    recordAnswer(
      'SEC_4_1_1_SKILLS_W1',
      '4.1',
      a411.score === 'NA' ? 'na' : 'answered',
      a411.score === 'NA' ? null : a411.score,
      a411.comment,
      { item: 'skills_week_1' }
    );

    // B. Section 4.1.2 Clinical Teaching (9 items)
    const ctItems = [
      { code: 'SEC_4_1_2_NEO_BRIEF', station: 'ก. CPR ทารกแรกเกิด' },
      { code: 'SEC_4_1_2_NEO_TIME', station: 'ก. CPR ทารกแรกเกิด' },
      { code: 'SEC_4_1_2_NEO_EQUIP', station: 'ก. CPR ทารกแรกเกิด' },
      { code: 'SEC_4_1_2_CHILD_BRIEF', station: 'ข. CPR เด็กเล็กและเด็กโต' },
      { code: 'SEC_4_1_2_CHILD_TIME', station: 'ข. CPR เด็กเล็กและเด็กโต' },
      { code: 'SEC_4_1_2_CHILD_EQUIP', station: 'ข. CPR เด็กเล็กและเด็กโต' },
      { code: 'SEC_4_1_2_CHOKE_BRIEF', station: 'ค. Choking' },
      { code: 'SEC_4_1_2_CHOKE_TIME', station: 'ค. Choking' },
      { code: 'SEC_4_1_2_CHOKE_EQUIP', station: 'ค. Choking' }
    ];
    for (const ct of ctItems) {
      const ans = answers[ct.code];
      recordAnswer(
        ct.code,
        '4.1',
        ans.score === 'NA' ? 'na' : 'answered',
        ans.score === 'NA' ? null : ans.score,
        ans.comment,
        { station: ct.station }
      );
    }

    // C. Section 4.2 Early Childhood
    if (early_childhood_trained === 'trained') {
      const a42 = answers['SEC_4_2_EXP'];
      recordAnswer(
        'SEC_4_2_EXP',
        '4.2',
        a42.score === 'NA' ? 'na' : 'answered',
        a42.score === 'NA' ? null : a42.score,
        a42.comment,
        { trained: true }
      );
    } else {
      recordAnswer(
        'SEC_4_2_EXP',
        '4.2',
        'not_trained',
        null,
        null,
        { trained: false }
      );
    }

    // D. Section 4.3 Hospital Wards
    const allWardsInDb = db.prepare('SELECT w.code, w.ward_name_th, w.hospital_code, h.name_th as hosp_name FROM ward_definitions w JOIN hospital_definitions h ON w.hospital_code = h.code').all();

    if (ward_training_status === 'trained' && Array.isArray(selected_wards)) {
      for (const w of allWardsInDb) {
        const qCode = `SEC_4_3_WARD_${w.code}_EXP`;
        const isSelected = selected_wards.includes(w.code);

        if (isSelected) {
          const ans = answers[qCode];
          if (ans) {
            recordAnswer(
              qCode,
              '4.3',
              ans.score === 'NA' ? 'na' : 'answered',
              ans.score === 'NA' ? null : ans.score,
              ans.comment,
              { hospital_code: w.hospital_code, hospital_name: w.hosp_name, ward_code: w.code, ward_name: w.ward_name_th }
            );
          }
          // Extra suggestion for ward
          const extraAns = answers[`SEC_4_3_WARD_${w.code}_EXTRA`];
          if (extraAns && extraAns.comment && extraAns.comment.trim()) {
            recordAnswer(
              `SEC_4_3_WARD_${w.code}_EXTRA`,
              '4.3',
              'answered',
              null,
              extraAns.comment.trim(),
              { hospital_code: w.hospital_code, hospital_name: w.hosp_name, ward_code: w.code, ward_name: w.ward_name_th }
            );
          }
        } else {
          // Explicitly record not_trained for wards the student did not attend
          recordAnswer(
            qCode,
            '4.3',
            'not_trained',
            null,
            null,
            { hospital_code: w.hospital_code, hospital_name: w.hosp_name, ward_code: w.code, ward_name: w.ward_name_th }
          );
        }
      }
    } else {
      // Not trained in any ward
      for (const w of allWardsInDb) {
        const qCode = `SEC_4_3_WARD_${w.code}_EXP`;
        recordAnswer(
          qCode,
          '4.3',
          'not_trained',
          null,
          null,
          { hospital_code: w.hospital_code, hospital_name: w.hosp_name, ward_code: w.code, ward_name: w.ward_name_th }
        );
      }
    }

    // E. Section 4.4 Play Activity
    const a44 = answers['SEC_4_4_PLAY_ACTIVITY'];
    recordAnswer(
      'SEC_4_4_PLAY_ACTIVITY',
      '4.4',
      a44.score === 'NA' ? 'na' : 'answered',
      a44.score === 'NA' ? null : a44.score,
      a44.comment,
      null
    );

    // F. Section 4.5 Selected Case Discussion
    const a45 = answers['SEC_4_5_SELECTED_CASE'];
    recordAnswer(
      'SEC_4_5_SELECTED_CASE',
      '4.5',
      a45.score === 'NA' ? 'na' : 'answered',
      a45.score === 'NA' ? null : a45.score,
      a45.comment,
      null
    );

    // G. Section 4.6 OSPE (7 items)
    const ospeItems = [
      'SEC_4_6_OSPE_1_NEB',
      'SEC_4_6_OSPE_2_SUCTION',
      'SEC_4_6_OSPE_3_IV',
      'SEC_4_6_OSPE_4_NG',
      'SEC_4_6_OSPE_5_WRITTEN',
      'SEC_4_6_OSPE_6_TIME',
      'SEC_4_6_OSPE_7_OVERALL'
    ];
    for (const oCode of ospeItems) {
      const ans = answers[oCode];
      recordAnswer(
        oCode,
        '4.6',
        ans.score === 'NA' ? 'na' : 'answered',
        ans.score === 'NA' ? null : ans.score,
        ans.comment,
        null
      );
    }

    // H. Section 4.7 Course Overall Satisfaction
    const a47 = answers['SEC_4_7_OVERALL_SATISFACTION'];
    recordAnswer(
      'SEC_4_7_OVERALL_SATISFACTION',
      '4.7',
      a47.score === 'NA' ? 'na' : 'answered',
      a47.score === 'NA' ? null : a47.score,
      a47.comment,
      null
    );

    db.exec('COMMIT;');

    return res.json({
      success: true,
      submissionId,
      message: 'บันทึกผลประเมินเรียบร้อยแล้ว ขอบคุณสำหรับข้อคิดเห็นและข้อเสนอแนะของนักศึกษา ซึ่งจะนำไปใช้พัฒนาการจัดการเรียนการสอนรายวิชา 640-394 ปฏิบัติการพยาบาลเด็กต่อไป'
    });
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch (rbErr) {}
    console.error('Error saving submission:', err);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลงฐานข้อมูล กรุณาลองใหม่อีกครั้ง ข้อมูลที่นักศึกษากรอกยังคงอยู่บนหน้านี้'
    });
  }
});

module.exports = router;
