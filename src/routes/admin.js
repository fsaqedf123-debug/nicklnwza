const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const config = require('../config');
const { db } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const { calculateItemStats } = require('../utils/stats');
const { generateCSV, generateExcelWorkbook } = require('../utils/export');

/**
 * POST /api/admin/login
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim());
  if (!admin) {
    return res.status(401).json({ success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  const isMatch = bcrypt.compareSync(password, admin.password_hash);
  if (!isMatch) {
    return res.status(401).json({ success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  // Generate JWT token
  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  // Set HTTP-only cookie
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  return res.json({
    success: true,
    token,
    user: {
      id: admin.id,
      username: admin.username,
      fullName: admin.full_name,
      role: admin.role
    }
  });
});

/**
 * POST /api/admin/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie(config.cookieName);
  return res.json({ success: true, message: 'ออกจากระบบเรียบร้อยแล้ว' });
});

/**
 * GET /api/admin/me
 */
router.get('/me', authMiddleware, (req, res) => {
  return res.json({
    success: true,
    user: req.admin
  });
});

/**
 * GET /api/admin/rounds
 * List all evaluation rounds with submission count breakdown
 */
router.get('/rounds', authMiddleware, (req, res) => {
  try {
    const rounds = db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM submissions s WHERE s.round_id = r.id AND s.is_test_data = 0) as real_submissions_count,
        (SELECT COUNT(*) FROM submissions s WHERE s.round_id = r.id AND s.is_test_data = 1) as test_submissions_count,
        (SELECT COUNT(*) FROM submissions s WHERE s.round_id = r.id) as total_submissions_count
      FROM evaluation_rounds r
      ORDER BY r.academic_year DESC, r.semester DESC, r.id DESC
    `).all();

    return res.json({ success: true, rounds });
  } catch (err) {
    console.error('Error fetching rounds:', err);
    return res.status(500).json({ success: false, error: 'ไม่สามารถโหลดข้อมูลรอบการประเมินได้' });
  }
});

/**
 * POST /api/admin/rounds
 * Create a new evaluation round
 */
router.post('/rounds', authMiddleware, (req, res) => {
  const { academic_year, semester, title, status, form_version, notes } = req.body;

  if (!academic_year || !semester) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุปีการศึกษาและภาคการศึกษา' });
  }

  const yearNum = parseInt(academic_year, 10);
  const semNum = parseInt(semester, 10);
  const roundCode = `${yearNum}-${semNum}`;
  const roundTitle = title && title.trim().length > 0 ? title.trim() : `ภาคการศึกษาที่ ${semNum} ปีการศึกษา ${yearNum}`;
  const roundStatus = status === 'open' ? 'open' : 'closed';
  const version = form_version === 'v1' ? 'v1' : 'v2';

  // Check unique round_code
  const existing = db.prepare('SELECT id FROM evaluation_rounds WHERE round_code = ?').get(roundCode);
  if (existing) {
    return res.status(400).json({ success: false, error: `มีรอบการประเมินรหัส ${roundCode} ในระบบแล้ว` });
  }

  const now = new Date().toISOString();
  try {
    const insert = db.prepare(`
      INSERT INTO evaluation_rounds (
        round_code, academic_year, semester, title, status, form_version, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(roundCode, yearNum, semNum, roundTitle, roundStatus, version, notes || null, now, now);
    return res.json({
      success: true,
      roundId: Number(result.lastInsertRowid),
      message: 'สร้างรอบการประเมินใหม่เรียบร้อยแล้ว'
    });
  } catch (err) {
    console.error('Error creating round:', err);
    return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึกรอบการประเมิน' });
  }
});

/**
 * PATCH /api/admin/rounds/:id
 * Update an evaluation round status or details
 */
router.patch('/rounds/:id', authMiddleware, (req, res) => {
  const roundId = parseInt(req.params.id, 10);
  const { title, status, notes, academic_year, semester } = req.body;

  const round = db.prepare('SELECT * FROM evaluation_rounds WHERE id = ?').get(roundId);
  if (!round) {
    return res.status(404).json({ success: false, error: 'ไม่พบรอบการประเมิน' });
  }

  const now = new Date().toISOString();
  const newTitle = title !== undefined ? title : round.title;
  const newStatus = status !== undefined ? status : round.status;
  const newNotes = notes !== undefined ? notes : round.notes;
  const newYear = academic_year !== undefined ? parseInt(academic_year, 10) : round.academic_year;
  const newSem = semester !== undefined ? parseInt(semester, 10) : round.semester;
  const newCode = `${newYear}-${newSem}`;

  try {
    db.prepare(`
      UPDATE evaluation_rounds
      SET title = ?, status = ?, notes = ?, academic_year = ?, semester = ?, round_code = ?, updated_at = ?
      WHERE id = ?
    `).run(newTitle, newStatus, newNotes, newYear, newSem, newCode, now, roundId);

    return res.json({ success: true, message: 'ปรับปรุงข้อมูลรอบการประเมินเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error updating round:', err);
    return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการปรับปรุงรอบการประเมิน' });
  }
});

/**
 * GET /api/admin/stats
 * Detailed statistics, distributions, and comparisons with comprehensive filters
 */
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const { round_id, section, hospital_code, ward_code, data_type } = req.query;

    // Default round if not specified
    let selectedRoundId = round_id ? parseInt(round_id, 10) : null;
    if (!selectedRoundId) {
      const active = db.prepare("SELECT id FROM evaluation_rounds WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
      if (active) selectedRoundId = active.id;
      else {
        const anyRound = db.prepare("SELECT id FROM evaluation_rounds ORDER BY id DESC LIMIT 1").get();
        if (anyRound) selectedRoundId = anyRound.id;
      }
    }

    if (!selectedRoundId) {
      return res.json({
        success: true,
        rounds: [],
        overview: { total: 0, bySection: {} },
        items: []
      });
    }

    // Build filter query for submissions
    let subWhere = ['s.round_id = ?'];
    let subParams = [selectedRoundId];

    // Separate test data from real submissions
    // data_type: 'real' (default), 'test', 'all'
    if (data_type === 'test') {
      subWhere.push('s.is_test_data = 1');
    } else if (data_type === 'all') {
      // allow both
    } else {
      // default: real data only!
      subWhere.push('s.is_test_data = 0');
    }

    if (section && config.sections.includes(section)) {
      subWhere.push('s.section = ?');
      subParams.push(section);
    }

    const subWhereSql = subWhere.join(' AND ');

    // 1. Overview counts: total and by Section
    const totalCountRow = db.prepare(`SELECT COUNT(*) as total FROM submissions s WHERE ${subWhereSql}`).get(...subParams);
    const totalSubmissions = totalCountRow ? totalCountRow.total : 0;

    // Count by Section
    const sectionCountRows = db.prepare(`
      SELECT s.section, COUNT(*) as count 
      FROM submissions s 
      WHERE ${subWhereSql}
      GROUP BY s.section
    `).all(...subParams);

    const bySection = { 'Sec 01': 0, 'Sec 02': 0, 'Sec 03': 0, 'Sec 04': 0 };
    for (const r of sectionCountRows) {
      if (bySection[r.section] !== undefined) {
        bySection[r.section] = r.count;
      }
    }

    // 2. Fetch all questions definitions
    const questionDefs = db.prepare(`
      SELECT * FROM question_definitions 
      ORDER BY sort_order ASC
    `).all();

    // 3. Fetch all answers for the selected submissions
    const answersQuery = `
      SELECT a.*, s.section, s.submission_token, s.form_version, s.round_id
      FROM submission_answers a
      JOIN submissions s ON a.submission_id = s.id
      WHERE ${subWhereSql}
    `;
    const answersList = db.prepare(answersQuery).all(...subParams);

    // 4. Calculate stats for each question item
    let itemStatsList = questionDefs.map(qDef => calculateItemStats(qDef, answersList));

    // Optional filters by hospital/ward
    if (hospital_code) {
      itemStatsList = itemStatsList.filter(item => {
        if (!item.hospital_code) return true; // keep general items or filter if specific
        return item.hospital_code === hospital_code;
      });
    }
    if (ward_code) {
      itemStatsList = itemStatsList.filter(item => {
        if (!item.ward_code) return true;
        return item.ward_code === ward_code;
      });
    }

    // 5. Section comparisons: for each rating item, compute mean for Sec 01, 02, 03, 04
    const sectionComparisons = {};
    for (const sec of config.sections) {
      const secAnswers = answersList.filter(a => a.section === sec);
      sectionComparisons[sec] = {};
      for (const qDef of questionDefs) {
        if (qDef.is_rating) {
          const stats = calculateItemStats(qDef, secAnswers);
          sectionComparisons[sec][qDef.code] = {
            numericCount: stats.numericCount,
            mean: stats.mean,
            meanDisplay: stats.meanDisplay
          };
        }
      }
    }

    // 6. Current Round metadata
    const currentRound = db.prepare('SELECT * FROM evaluation_rounds WHERE id = ?').get(selectedRoundId);

    return res.json({
      success: true,
      currentRound,
      overview: {
        totalSubmissions,
        bySection,
        dataType: data_type || 'real'
      },
      items: itemStatsList,
      sectionComparisons
    });
  } catch (err) {
    console.error('Error in /api/admin/stats:', err);
    return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการประมวลผลสถิติ' });
  }
});

/**
 * GET /api/admin/comments
 * Filter and view comments with context
 */
router.get('/comments', authMiddleware, (req, res) => {
  try {
    const { round_id, section, section_num, hospital_code, data_type } = req.query;

    let where = ["a.comment IS NOT NULL AND a.comment != ''"];
    let params = [];

    if (round_id) {
      where.push('s.round_id = ?');
      params.push(parseInt(round_id, 10));
    }

    if (data_type === 'test') {
      where.push('s.is_test_data = 1');
    } else if (data_type === 'all') {
      // both
    } else {
      where.push('s.is_test_data = 0');
    }

    if (section && config.sections.includes(section)) {
      where.push('s.section = ?');
      params.push(section);
    }

    if (section_num) {
      where.push('a.section_num = ?');
      params.push(section_num);
    }

    const whereSql = where.join(' AND ');

    const comments = db.prepare(`
      SELECT 
        a.id, a.submission_id, a.question_code, a.section_num, a.status, a.score, a.comment, a.metadata_json,
        s.section, s.submitted_at, s.submission_token,
        q.title_th, q.subtitle_th, q.station_name_th, q.hospital_code, q.ward_code,
        h.name_th as hosp_name, w.ward_name_th
      FROM submission_answers a
      JOIN submissions s ON a.submission_id = s.id
      JOIN question_definitions q ON a.question_code = q.code
      LEFT JOIN hospital_definitions h ON q.hospital_code = h.code
      LEFT JOIN ward_definitions w ON q.ward_code = w.code
      WHERE ${whereSql}
      ORDER BY a.section_num ASC, a.id DESC
    `).all(...params);

    const formatted = comments.map(c => {
      let context = '';
      if (c.station_name_th) context = c.station_name_th;
      else if (c.hosp_name && c.ward_name_th) context = `${c.hosp_name} - ${c.ward_name_th}`;
      else if (c.metadata_json) {
        try {
          const meta = JSON.parse(c.metadata_json);
          if (meta.station) context = meta.station;
          else if (meta.hospital_name && meta.ward_name) context = `${meta.hospital_name} - ${meta.ward_name}`;
        } catch (e) {}
      }

      return {
        id: c.id,
        submissionId: c.submission_id,
        section: c.section,
        section_num: c.section_num,
        question_code: c.question_code,
        title_th: c.title_th,
        subtitle_th: c.subtitle_th,
        score: c.status === 'na' ? 'N/A' : (c.score !== null ? c.score : '-'),
        comment: c.comment,
        context,
        submitted_at: c.submitted_at
      };
    });

    return res.json({ success: true, count: formatted.length, comments: formatted });
  } catch (err) {
    console.error('Error fetching comments:', err);
    return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดข้อคิดเห็น' });
  }
});

/**
 * GET /api/admin/export/xlsx
 * Export summary, raw responses, and comments as Excel (.xlsx)
 */
router.get('/export/xlsx', authMiddleware, (req, res) => {
  try {
    const { round_id, data_type } = req.query;
    const selectedRoundId = round_id ? parseInt(round_id, 10) : 1;

    const round = db.prepare('SELECT * FROM evaluation_rounds WHERE id = ?').get(selectedRoundId) || { round_code: 'all', title: 'ทั้งหมด' };

    // Where clause
    let subWhere = ['s.round_id = ?'];
    let subParams = [selectedRoundId];
    if (data_type === 'test') subWhere.push('s.is_test_data = 1');
    else if (data_type !== 'all') subWhere.push('s.is_test_data = 0');

    const subWhereSql = subWhere.join(' AND ');

    // Questions and Answers
    const questionDefs = db.prepare('SELECT * FROM question_definitions ORDER BY sort_order ASC').all();
    const answersList = db.prepare(`
      SELECT a.*, s.section, s.submission_token, s.form_version, s.round_id
      FROM submission_answers a
      JOIN submissions s ON a.submission_id = s.id
      WHERE ${subWhereSql}
    `).all(...subParams);

    const summaryData = questionDefs.map(qDef => calculateItemStats(qDef, answersList));

    // Comments data
    const commentsRaw = db.prepare(`
      SELECT 
        a.id, a.submission_id, a.question_code, a.section_num, a.status, a.score, a.comment, a.metadata_json,
        s.section, q.title_th, q.station_name_th, h.name_th as hosp_name, w.ward_name_th
      FROM submission_answers a
      JOIN submissions s ON a.submission_id = s.id
      JOIN question_definitions q ON a.question_code = q.code
      LEFT JOIN hospital_definitions h ON q.hospital_code = h.code
      LEFT JOIN ward_definitions w ON q.ward_code = w.code
      WHERE a.comment IS NOT NULL AND a.comment != '' AND ${subWhereSql}
      ORDER BY a.section_num ASC, a.id DESC
    `).all(...subParams);

    const commentsData = commentsRaw.map(c => {
      let context = '';
      if (c.station_name_th) context = c.station_name_th;
      else if (c.hosp_name && c.ward_name_th) context = `${c.hosp_name} - ${c.ward_name_th}`;
      return {
        section: c.section,
        section_num: c.section_num,
        question_code: c.question_code,
        title_th: c.title_th,
        score: c.status === 'na' ? 'N/A' : (c.score !== null ? c.score : '-'),
        comment: c.comment,
        context
      };
    });

    // Submissions Raw
    const submissionsData = db.prepare(`
      SELECT s.*, r.title as round_title
      FROM submissions s
      JOIN evaluation_rounds r ON s.round_id = r.id
      WHERE ${subWhereSql}
      ORDER BY s.id DESC
    `).all(...subParams);

    // Map selected wards to human readable names
    const allWards = db.prepare('SELECT w.code, w.ward_name_th, h.name_th as hosp_name FROM ward_definitions w JOIN hospital_definitions h ON w.hospital_code = h.code').all();
    const wardMap = new Map(allWards.map(w => [w.code, `${w.hosp_name} - ${w.ward_name_th}`]));

    for (const s of submissionsData) {
      if (s.selected_wards_json) {
        try {
          const list = JSON.parse(s.selected_wards_json);
          s.selected_wards_names = list.map(code => wardMap.get(code) || code).join(', ');
        } catch (e) {
          s.selected_wards_names = s.selected_wards_json;
        }
      }
    }

    const buffer = generateExcelWorkbook(summaryData, submissionsData, commentsData);

    const filename = `Evaluation-640-394-Round-${round.round_code || selectedRoundId}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error generating Excel export:', err);
    return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการสร้างไฟล์ Excel' });
  }
});

/**
 * GET /api/admin/export/csv
 * Export item summaries as CSV with UTF-8 BOM
 */
router.get('/export/csv', authMiddleware, (req, res) => {
  try {
    const { round_id, data_type } = req.query;
    const selectedRoundId = round_id ? parseInt(round_id, 10) : 1;

    let subWhere = ['s.round_id = ?'];
    let subParams = [selectedRoundId];
    if (data_type === 'test') subWhere.push('s.is_test_data = 1');
    else if (data_type !== 'all') subWhere.push('s.is_test_data = 0');

    const subWhereSql = subWhere.join(' AND ');

    const questionDefs = db.prepare('SELECT * FROM question_definitions ORDER BY sort_order ASC').all();
    const answersList = db.prepare(`
      SELECT a.*, s.section, s.submission_token, s.form_version, s.round_id
      FROM submission_answers a
      JOIN submissions s ON a.submission_id = s.id
      WHERE ${subWhereSql}
    `).all(...subParams);

    const summaryData = questionDefs.map(qDef => calculateItemStats(qDef, answersList));

    const headers = [
      'ลำดับหัวข้อ',
      'รหัสข้อประเมิน',
      'หัวข้อประเมิน',
      'ประเด็นการประเมิน',
      'จำนวนผู้ตอบ (1-5)',
      'ค่าเฉลี่ย',
      'ส่วนเบี่ยงเบนมาตรฐาน',
      'คะแนน 5 (จำนวน)',
      'คะแนน 5 (%)',
      'คะแนน 4 (จำนวน)',
      'คะแนน 4 (%)',
      'คะแนน 3 (จำนวน)',
      'คะแนน 3 (%)',
      'คะแนน 2 (จำนวน)',
      'คะแนน 2 (%)',
      'คะแนน 1 (จำนวน)',
      'คะแนน 1 (%)',
      'จำนวน N/A',
      'จำนวนไม่ได้ขึ้นฝึก',
      'ไม่มีในแบบประเมินฉบับที่ตอบ',
      'คะแนน 1-3 (จำนวน)',
      'คะแนน 1-3 (%)'
    ];

    const rows = summaryData.map(item => [
      item.section_num,
      item.code,
      item.title_th,
      item.subtitle_th,
      item.numericCount,
      item.meanDisplay,
      item.sdDisplay,
      item.scoreCounts[5],
      item.scorePercents[5],
      item.scoreCounts[4],
      item.scorePercents[4],
      item.scoreCounts[3],
      item.scorePercents[3],
      item.scoreCounts[2],
      item.scorePercents[2],
      item.scoreCounts[1],
      item.scorePercents[1],
      item.countNA,
      item.countNotTrained,
      item.countNotInVersion,
      item.lowCount,
      item.lowPercent
    ]);

    const buffer = generateCSV(headers, rows);
    const filename = `Evaluation-640-394-Summary.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error generating CSV export:', err);
    return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการสร้างไฟล์ CSV' });
  }
});

/**
 * POST /api/admin/test-data
 * Manage simulated test data (strictly isolated with is_test_data = 1)
 */
router.post('/test-data', authMiddleware, (req, res) => {
  const { action, round_id } = req.body;
  const targetRoundId = round_id ? parseInt(round_id, 10) : 1;

  if (action === 'clear') {
    db.prepare('DELETE FROM submissions WHERE is_test_data = 1 AND round_id = ?').run(targetRoundId);
    return res.json({ success: true, message: 'ลบข้อมูลทดสอบทั้งหมดในรอบนี้เรียบร้อยแล้ว' });
  }

  if (action === 'generate') {
    // Generate realistic sample submissions (40 students across Sec 01 - Sec 04)
    // Marked strictly as is_test_data = 1
    const sections = ['Sec 01', 'Sec 02', 'Sec 03', 'Sec 04'];
    const wardsList = [
      'WARD_PSU_PED1', 'WARD_PSU_PED2', 'WARD_PSU_NMCU', 'WARD_PSU_SURG', 'WARD_PSU_NICU',
      'WARD_HY_PED1', 'WARD_HY_PED2', 'WARD_HY_NICU', 'WARD_SK_NICU'
    ];

    try {
      db.exec('BEGIN TRANSACTION;');
      const insertSub = db.prepare(`
        INSERT INTO submissions (
          submission_token, round_id, form_version, section, submitted_at, ip_hash, is_test_data,
          early_childhood_trained, early_childhood_general_suggestion,
          ward_training_status, selected_wards_json,
          impressions_to_keep, improvements_and_suggestions
        ) VALUES (?, ?, 'v2', ?, ?, 'test-hash', 1, ?, ?, ?, ?, ?, ?)
      `);

      const insertAns = db.prepare(`
        INSERT INTO submission_answers (
          submission_id, question_code, section_num, status, score, comment, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const allWardsInDb = db.prepare('SELECT w.code, w.ward_name_th, w.hospital_code, h.name_th as hosp_name FROM ward_definitions w JOIN hospital_definitions h ON w.hospital_code = h.code').all();

      const commentsPool1to3 = [
        'ควรเพิ่มเวลาในการอธิบายขั้นตอนก่อนเริ่มปฏิบัติจริง',
        'อุปกรณ์บางชิ้นในฐานไม่ค่อยพร้อมใช้งาน อยากให้ตรวจเช็กก่อนเริ่มสอบ',
        'อยากให้มีเวลาฝึกซ้อมก่อนสอบมากกว่านี้',
        'สถานที่คับแคบไปนิดหน่อยสำหรับกลุ่มนักศึกษา',
        'อยากให้อาจารย์สาธิตซ้ำอีกครั้งในส่วนของทักษะที่ซับซ้อน'
      ];

      for (let i = 1; i <= 36; i++) {
        const sec = sections[i % 4];
        const token = `test-sample-token-${targetRoundId}-${i}-${Date.now()}`;
        const trainedEC = i % 5 === 0 ? 'not_trained' : 'trained';
        const hasWards = i % 10 !== 0;
        const selectedWards = hasWards ? [wardsList[i % wardsList.length], wardsList[(i + 2) % wardsList.length]] : [];

        const subRes = insertSub.run(
          token,
          targetRoundId,
          sec,
          new Date(Date.now() - (i * 3600000)).toISOString(),
          trainedEC,
          trainedEC === 'trained' ? 'กิจกรรมเสริมสร้างพัฒนาการเด็กดีมาก' : null,
          hasWards ? 'trained' : 'not_trained',
          JSON.stringify(selectedWards),
          'อาจารย์ผู้สอนและพี่พยาบาลให้คำแนะนำอย่างอบอุ่นและเป็นกันเอง',
          'ควรจัดตารางการขึ้นฝึกให้มีความต่อเนื่องมากขึ้น'
        );

        const subId = Number(subRes.lastInsertRowid);

        // Answers helper
        const addAns = (code, secNum, score, comment, meta) => {
          insertAns.run(subId, code, secNum, score === 'NA' ? 'na' : 'answered', score === 'NA' ? null : score, comment || null, meta ? JSON.stringify(meta) : null);
        };

        // 4.1.1
        const s411 = (i % 7 === 0) ? 2 : (i % 4 === 0 ? 3 : (i % 2 === 0 ? 5 : 4));
        addAns('SEC_4_1_1_SKILLS_W1', '4.1', s411, s411 <= 3 ? commentsPool1to3[i % commentsPool1to3.length] : null);

        // 4.1.2 Clinical teaching (9 items)
        const ctCodes = [
          'SEC_4_1_2_NEO_BRIEF', 'SEC_4_1_2_NEO_TIME', 'SEC_4_1_2_NEO_EQUIP',
          'SEC_4_1_2_CHILD_BRIEF', 'SEC_4_1_2_CHILD_TIME', 'SEC_4_1_2_CHILD_EQUIP',
          'SEC_4_1_2_CHOKE_BRIEF', 'SEC_4_1_2_CHOKE_TIME', 'SEC_4_1_2_CHOKE_EQUIP'
        ];
        for (const code of ctCodes) {
          const sc = ((i + code.length) % 8 === 0) ? 'NA' : (((i + code.length) % 6 === 0) ? 3 : (((i + code.length) % 3 === 0) ? 5 : 4));
          addAns(code, '4.1', sc, sc <= 3 ? commentsPool1to3[(i + 1) % commentsPool1to3.length] : null);
        }

        // 4.2 Early Childhood
        if (trainedEC === 'trained') {
          const sc42 = (i % 5 === 1) ? 3 : (i % 3 === 0 ? 5 : 4);
          addAns('SEC_4_2_EXP', '4.2', sc42, sc42 <= 3 ? 'การดูแลเด็กวัยเตาะแตะมีรายละเอียดเยอะ อยากได้คู่มือแนะนำล่วงหน้า' : null);
        } else {
          insertAns.run(subId, 'SEC_4_2_EXP', '4.2', 'not_trained', null, null, null);
        }

        // 4.3 Wards
        for (const w of allWardsInDb) {
          const qCode = `SEC_4_3_WARD_${w.code}_EXP`;
          if (hasWards && selectedWards.includes(w.code)) {
            const scW = (i % 6 === 0) ? 3 : (i % 2 === 0 ? 5 : 4);
            addAns(qCode, '4.3', scW, scW <= 3 ? `ควรชี้แจงบทบาทของ นศ. บน ${w.ward_name_th} ให้ชัดเจนก่อนขึ้นฝึก` : null, { hospital_name: w.hosp_name, ward_name: w.ward_name_th });
          } else {
            insertAns.run(subId, qCode, '4.3', 'not_trained', null, null, null);
          }
        }

        // 4.4 Play Activity
        const s44 = (i % 9 === 0) ? 3 : (i % 2 === 0 ? 5 : 4);
        addAns('SEC_4_4_PLAY_ACTIVITY', '4.4', s44, s44 <= 3 ? 'อุปกรณ์จัดกิจกรรมการเล่นควรมีความหลากหลายและเหมาะกับช่วงวัยของเด็กมากขึ้น' : null);

        // 4.5 Selected Case
        const s45 = (i % 8 === 0) ? 3 : (i % 2 === 0 ? 4 : 5);
        addAns('SEC_4_5_SELECTED_CASE', '4.5', s45, s45 <= 3 ? 'อยากให้มีกรณีศึกษาตัวอย่างเพิ่มเติมสำหรับการเตรียมตัว' : null);

        // 4.6 OSPE (7 items)
        const ospe = [
          'SEC_4_6_OSPE_1_NEB', 'SEC_4_6_OSPE_2_SUCTION', 'SEC_4_6_OSPE_3_IV',
          'SEC_4_6_OSPE_4_NG', 'SEC_4_6_OSPE_5_WRITTEN', 'SEC_4_6_OSPE_6_TIME', 'SEC_4_6_OSPE_7_OVERALL'
        ];
        for (const oCode of ospe) {
          const sc = ((i + oCode.length) % 9 === 0) ? 2 : (((i + oCode.length) % 7 === 0) ? 3 : 4);
          addAns(oCode, '4.6', sc, sc <= 3 ? 'เวลา 7 นาทีในบางฐานค่อนข้างกระชั้นชิดสำหรับการทำหัตถการ' : null);
        }

        // 4.7 Overall
        const s47 = (i % 6 === 0) ? 4 : 5;
        addAns('SEC_4_7_OVERALL_SATISFACTION', '4.7', s47, null);
      }

      db.exec('COMMIT;');
      return res.json({ success: true, message: 'สร้างข้อมูลทดสอบจำลอง (36 รายการ) เรียบร้อยแล้ว (มีธง is_test_data = 1 กำกับแยกชัดเจน)' });
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch (e) {}
      console.error('Error generating test data:', err);
      return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการสร้างข้อมูลทดสอบ' });
    }
  }

  return res.status(400).json({ success: false, error: 'คำสั่งไม่ถูกต้อง' });
});

/**
 * POST /api/admin/change-password
 */
router.post('/change-password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ success: false, error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  const isMatch = bcrypt.compareSync(current_password, admin.password_hash);
  if (!isMatch) {
    return res.status(400).json({ success: false, error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  }

  const salt = bcrypt.genSaltSync(10);
  const newHash = bcrypt.hashSync(new_password, salt);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, req.admin.id);

  return res.json({ success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
});

module.exports = router;
