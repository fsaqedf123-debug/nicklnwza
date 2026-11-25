const xlsx = require('xlsx');

/**
 * Sanitize text to prevent CSV/Excel Formula Injection (CWE-1236)
 */
function sanitizeFormula(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Generate CSV with UTF-8 BOM and sanitized formula injection
 */
function generateCSV(headers, rows) {
  // UTF-8 BOM
  let csv = '\uFEFF';

  // Headers
  const headerLine = headers.map(h => `"${sanitizeFormula(h).replace(/"/g, '""')}"`).join(',');
  csv += headerLine + '\r\n';

  // Rows
  for (const row of rows) {
    const line = row.map(cell => {
      if (cell === null || cell === undefined) return '""';
      const clean = sanitizeFormula(cell);
      return `"${String(clean).replace(/"/g, '""')}"`;
    }).join(',');
    csv += line + '\r\n';
  }

  return Buffer.from(csv, 'utf8');
}

/**
 * Generate Multi-sheet Excel workbook using xlsx
 */
function generateExcelWorkbook(summaryData, submissionsData, commentsData) {
  const wb = xlsx.utils.book_new();

  // Sheet 1: สรุปผลการประเมินรายข้อ
  const summaryHeaders = [
    'ลำดับหัวข้อ',
    'รหัสข้อประเมิน',
    'หัวข้อประเมิน',
    'ประเด็นการประเมิน',
    'จำนวนผู้ประเมิน (1-5)',
    'ค่าเฉลี่ย (Mean)',
    'ส่วนเบี่ยงเบน (S.D.)',
    'จำนวนคะแนน 5',
    'ร้อยละคะแนน 5',
    'จำนวนคะแนน 4',
    'ร้อยละคะแนน 4',
    'จำนวนคะแนน 3',
    'ร้อยละคะแนน 3',
    'จำนวนคะแนน 2',
    'ร้อยละคะแนน 2',
    'จำนวนคะแนน 1',
    'ร้อยละคะแนน 1',
    'จำนวน N/A',
    'ไม่ได้ขึ้นฝึก',
    'ไม่มีในแบบประเมินฉบับที่ตอบ',
    'จำนวนคะแนน 1-3',
    'ร้อยละคะแนน 1-3'
  ];

  const summaryRows = summaryData.map(item => [
    sanitizeFormula(item.section_num),
    sanitizeFormula(item.code),
    sanitizeFormula(item.title_th),
    sanitizeFormula(item.subtitle_th),
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

  const wsSummary = xlsx.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
  xlsx.utils.book_append_sheet(wb, wsSummary, 'สรุปผลรายข้อ');

  // Sheet 2: รายการข้อคิดเห็นทั้งหมด
  const commentHeaders = [
    'Section',
    'ลำดับหัวข้อ',
    'รหัสข้อประเมิน',
    'หัวข้อประเมิน',
    'คะแนนที่ให้',
    'ข้อคิดเห็น/ข้อเสนอแนะ',
    'โรงพยาบาล/หอผู้ป่วย/ฐานกิจกรรม'
  ];

  const commentRows = commentsData.map(c => [
    sanitizeFormula(c.section),
    sanitizeFormula(c.section_num),
    sanitizeFormula(c.question_code),
    sanitizeFormula(c.title_th),
    sanitizeFormula(c.score),
    sanitizeFormula(c.comment),
    sanitizeFormula(c.context || '')
  ]);

  const wsComments = xlsx.utils.aoa_to_sheet([commentHeaders, ...commentRows]);
  xlsx.utils.book_append_sheet(wb, wsComments, 'ข้อคิดเห็นและข้อเสนอแนะ');

  // Sheet 3: ข้อมูลคำตอบดิบ (Anonymized)
  if (submissionsData && submissionsData.length > 0) {
    const rawHeaders = [
      'ID',
      'Token',
      'รอบประเมิน',
      'Section',
      'วันที่ส่ง',
      'เวอร์ชัน',
      'สถานะฝึกปฐมวัย',
      'สถานะฝึกหอผู้ป่วย',
      'หอผู้ป่วยที่ขึ้นฝึก',
      'สิ่งที่ประทับใจ (4.7)',
      'สิ่งที่ควรปรับปรุง (4.7)'
    ];

    const rawRows = submissionsData.map(s => [
      s.id,
      sanitizeFormula(s.submission_token),
      sanitizeFormula(s.round_title || s.round_id),
      sanitizeFormula(s.section),
      sanitizeFormula(s.submitted_at),
      sanitizeFormula(s.form_version),
      sanitizeFormula(s.early_childhood_trained === 'trained' ? 'ได้ขึ้นฝึก' : 'ไม่ได้ขึ้นฝึก'),
      sanitizeFormula(s.ward_training_status === 'trained' ? 'ได้ขึ้นฝึก' : 'ไม่ได้ขึ้นฝึกบนหอผู้ป่วย'),
      sanitizeFormula(s.selected_wards_names || s.selected_wards_json),
      sanitizeFormula(s.impressions_to_keep || ''),
      sanitizeFormula(s.improvements_and_suggestions || '')
    ]);

    const wsRaw = xlsx.utils.aoa_to_sheet([rawHeaders, ...rawRows]);
    xlsx.utils.book_append_sheet(wb, wsRaw, 'ข้อมูลคำตอบที่ส่ง');
  }

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  sanitizeFormula,
  generateCSV,
  generateExcelWorkbook
};
