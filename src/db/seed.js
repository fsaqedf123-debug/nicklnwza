const bcrypt = require('bcryptjs');
const { db } = require('./database');
const config = require('../config');

const hospitals = [
  { code: 'HOSP_PSU', name_th: 'โรงพยาบาลสงขลานครินทร์ (รพ.มอ.)', sort_order: 1 },
  { code: 'HOSP_HATYAI', name_th: 'โรงพยาบาลหาดใหญ่', sort_order: 2 },
  { code: 'HOSP_SONGKHLA', name_th: 'โรงพยาบาลสงขลา', sort_order: 3 },
];

const wards = [
  // โรงพยาบาลสงขลานครินทร์ (รพ.มอ.)
  { code: 'WARD_PSU_PED1', hospital_code: 'HOSP_PSU', ward_name_th: 'หอผู้ป่วยเด็ก 1 (มอ1)', short_code: 'หอผู้ป่วยเด็ก 1 (มอ1)', sort_order: 101 },
  { code: 'WARD_PSU_PED2', hospital_code: 'HOSP_PSU', ward_name_th: 'หอผู้ป่วยเด็ก 2 (มอ2)', short_code: 'หอผู้ป่วยเด็ก 2 (มอ2)', sort_order: 102 },
  { code: 'WARD_PSU_NMCU', hospital_code: 'HOSP_PSU', ward_name_th: 'หอผู้ป่วยเด็กแรกเกิด (NMCU)', short_code: 'หอผู้ป่วยเด็กแรกเกิด (NMCU)', sort_order: 103 },
  { code: 'WARD_PSU_SURG', hospital_code: 'HOSP_PSU', ward_name_th: 'หอผู้ป่วยศัลยกรรมเด็ก (ศด)', short_code: 'หอผู้ป่วยศัลยกรรมเด็ก (ศด)', sort_order: 104 },
  { code: 'WARD_PSU_NICU', hospital_code: 'HOSP_PSU', ward_name_th: 'หออภิบาลทารกแรกเกิด (NICU)', short_code: 'หออภิบาลทารกแรกเกิด (NICU)', sort_order: 105 },
  { code: 'WARD_PSU_PMCU', hospital_code: 'HOSP_PSU', ward_name_th: 'หอผู้ป่วยเด็กกึ่งวิกฤต (PMCU)', short_code: 'หอผู้ป่วยเด็กกึ่งวิกฤต (PMCU)', sort_order: 106 },
  { code: 'WARD_PSU_PICU', hospital_code: 'HOSP_PSU', ward_name_th: 'หออภิบาลผู้ป่วยเด็ก (PICU)', short_code: 'หออภิบาลผู้ป่วยเด็ก (PICU)', sort_order: 107 },

  // โรงพยาบาลหาดใหญ่
  { code: 'WARD_HY_PED1', hospital_code: 'HOSP_HATYAI', ward_name_th: 'หอผู้ป่วยกุมารเวชกรรมเด็ก 1 (ด110)', short_code: 'หอผู้ป่วยกุมารเวชกรรมเด็ก 1 (ด110)', sort_order: 201 },
  { code: 'WARD_HY_PED2', hospital_code: 'HOSP_HATYAI', ward_name_th: 'หอผู้ป่วยกุมารเวชกรรมเด็ก 2 (ด120)', short_code: 'หอผู้ป่วยกุมารเวชกรรมเด็ก 2 (ด120)', sort_order: 202 },
  { code: 'WARD_HY_NM', hospital_code: 'HOSP_HATYAI', ward_name_th: 'หอผู้ป่วยกึ่งวิกฤตทารกแรกเกิด (NM)', short_code: 'หอผู้ป่วยกึ่งวิกฤตทารกแรกเกิด (NM)', sort_order: 203 },
  { code: 'WARD_HY_NICU', hospital_code: 'HOSP_HATYAI', ward_name_th: 'หอผู้ป่วย NICU', short_code: 'หอผู้ป่วย NICU', sort_order: 204 },
  { code: 'WARD_HY_PICU', hospital_code: 'HOSP_HATYAI', ward_name_th: 'หอผู้ป่วย PICU', short_code: 'หอผู้ป่วย PICU', sort_order: 205 },

  // โรงพยาบาลสงขลา
  { code: 'WARD_SK_NICU', hospital_code: 'HOSP_SONGKHLA', ward_name_th: 'หออภิบาลผู้ป่วยวิกฤตทารกแรกเกิด (NICU)', short_code: 'หออภิบาลผู้ป่วยวิกฤตทารกแรกเกิด (NICU)', sort_order: 301 },
  { code: 'WARD_SK_PICU', hospital_code: 'HOSP_SONGKHLA', ward_name_th: 'หออภิบาลผู้ป่วยเด็กวิกฤต (PICU)', short_code: 'หออภิบาลผู้ป่วยเด็กวิกฤต (PICU)', sort_order: 302 },
];

function seedDatabase() {
  // 1. Seed Admin
  const checkAdmin = db.prepare('SELECT id FROM admins WHERE username = ?');
  const existingAdmin = checkAdmin.get(config.defaultAdminUsername);
  if (!existingAdmin) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(config.defaultAdminPassword, salt);
    const insertAdmin = db.prepare(`
      INSERT INTO admins (username, password_hash, full_name, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertAdmin.run(
      config.defaultAdminUsername,
      hash,
      'ผู้ประสานงานรายวิชา 640-394',
      'coordinator',
      new Date().toISOString()
    );
    console.log(`[SEED] Created default admin account: ${config.defaultAdminUsername}`);
  }

  // 2. Seed Hospitals
  const insertHosp = db.prepare(`
    INSERT OR REPLACE INTO hospital_definitions (code, name_th, sort_order)
    VALUES (?, ?, ?)
  `);
  for (const h of hospitals) {
    insertHosp.run(h.code, h.name_th, h.sort_order);
  }

  // 3. Seed Wards
  const insertWard = db.prepare(`
    INSERT OR REPLACE INTO ward_definitions (code, hospital_code, ward_name_th, short_code, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const w of wards) {
    insertWard.run(w.code, w.hospital_code, w.ward_name_th, w.short_code, w.sort_order);
  }

  // 4. Seed Question Definitions
  const insertQ = db.prepare(`
    INSERT OR REPLACE INTO question_definitions (
      code, section_num, category, title_th, subtitle_th, 
      station_code, station_name_th, hospital_code, ward_code, 
      is_rating, introduced_in_version, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const questions = [
    // 4.1 การเตรียมความพร้อมในการปฏิบัติการพยาบาลเด็ก
    // 4.1.1
    {
      code: 'SEC_4_1_1_SKILLS_W1',
      section_num: '4.1',
      category: 'prep_skills',
      title_th: '4.1.1 การสอบทักษะทางการพยาบาลเด็กในสัปดาห์ที่ 1',
      subtitle_th: 'ความเหมาะสมของการสอบทักษะทางการพยาบาลเด็กในสัปดาห์ที่ 1 เพื่อเตรียมความพร้อมก่อนขึ้นฝึกปฏิบัติ',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 10
    },
    // 4.1.2 Clinical teaching - ฐาน ก. CPR ทารกแรกเกิด
    {
      code: 'SEC_4_1_2_NEO_BRIEF',
      section_num: '4.1',
      category: 'clinical_teaching',
      title_th: 'ฐาน ก. CPR ทารกแรกเกิด - ข้อ 1',
      subtitle_th: 'ความเหมาะสมของการทบทวนก่อนฝึกปฏิบัติ (Brief)',
      station_code: 'STATION_A_NEONATE',
      station_name_th: 'ฐาน ก. CPR ทารกแรกเกิด',
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 21
    },
    {
      code: 'SEC_4_1_2_NEO_TIME',
      section_num: '4.1',
      category: 'clinical_teaching',
      title_th: 'ฐาน ก. CPR ทารกแรกเกิด - ข้อ 2',
      subtitle_th: 'ความเหมาะสมของระยะเวลาที่ฝึกปฏิบัติในฐาน',
      station_code: 'STATION_A_NEONATE',
      station_name_th: 'ฐาน ก. CPR ทารกแรกเกิด',
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 22
    },
    {
      code: 'SEC_4_1_2_NEO_EQUIP',
      section_num: '4.1',
      category: 'clinical_teaching',
      title_th: 'ฐาน ก. CPR ทารกแรกเกิด - ข้อ 3',
      subtitle_th: 'ความเพียงพอและความพร้อมของอุปกรณ์ที่ใช้ฝึกปฏิบัติ',
      station_code: 'STATION_A_NEONATE',
      station_name_th: 'ฐาน ก. CPR ทารกแรกเกิด',
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 23
    },
    // 4.1.2 Clinical teaching - ฐาน ข. CPR เด็กเล็กและเด็กโต
    {
      code: 'SEC_4_1_2_CHILD_BRIEF',
      section_num: '4.1',
      category: 'clinical_teaching',
      title_th: 'ฐาน ข. CPR เด็กเล็กและเด็กโต - ข้อ 1',
      subtitle_th: 'ความเหมาะสมของการทบทวนก่อนฝึกปฏิบัติ (Brief)',
      station_code: 'STATION_B_CHILD',
      station_name_th: 'ฐาน ข. CPR เด็กเล็กและเด็กโต',
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 24
    },
    {
      code: 'SEC_4_1_2_CHILD_TIME',
      section_num: '4.1',
      category: 'clinical_teaching',
      title_th: 'ฐาน ข. CPR เด็กเล็กและเด็กโต - ข้อ 2',
      subtitle_th: 'ความเหมาะสมของระยะเวลาที่ฝึกปฏิบัติในฐาน',
      station_code: 'STATION_B_CHILD',
      station_name_th: 'ฐาน ข. CPR เด็กเล็กและเด็กโต',
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 25
    },
    {
      code: 'SEC_4_1_2_CHILD_EQUIP',
      section_num: '4.1',
      category: 'clinical_teaching',
      title_th: 'ฐาน ข. CPR เด็กเล็กและเด็กโต - ข้อ 3',
      subtitle_th: 'ความเพียงพอและความพร้อมของอุปกรณ์ที่ใช้ฝึกปฏิบัติ',
      station_code: 'STATION_B_CHILD',
      station_name_th: 'ฐาน ข. CPR เด็กเล็กและเด็กโต',
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 26
    },
    // 4.1.2 Clinical teaching - ฐาน ค. Choking
    {
      code: 'SEC_4_1_2_CHOKE_BRIEF',
      section_num: '4.1',
      category: 'clinical_teaching',
      title_th: 'ฐาน ค. การช่วยเหลือเด็กที่มีสิ่งแปลกปลอมอุดกั้นทางเดินหายใจ (Choking) - ข้อ 1',
      subtitle_th: 'ความเหมาะสมของการทบทวนก่อนฝึกปฏิบัติ (Brief)',
      station_code: 'STATION_C_CHOKING',
      station_name_th: 'ฐาน ค. การช่วยเหลือเด็กที่มีสิ่งแปลกปลอมอุดกั้นทางเดินหายใจ (Choking)',
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 27
    },
    {
      code: 'SEC_4_1_2_CHOKE_TIME',
      section_num: '4.1',
      category: 'clinical_teaching',
      title_th: 'ฐาน ค. การช่วยเหลือเด็กที่มีสิ่งแปลกปลอมอุดกั้นทางเดินหายใจ (Choking) - ข้อ 2',
      subtitle_th: 'ความเหมาะสมของระยะเวลาที่ฝึกปฏิบัติในฐาน',
      station_code: 'STATION_C_CHOKING',
      station_name_th: 'ฐาน ค. การช่วยเหลือเด็กที่มีสิ่งแปลกปลอมอุดกั้นทางเดินหายใจ (Choking)',
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 28
    },
    {
      code: 'SEC_4_1_2_CHOKE_EQUIP',
      section_num: '4.1',
      category: 'clinical_teaching',
      title_th: 'ฐาน ค. การช่วยเหลือเด็กที่มีสิ่งแปลกปลอมอุดกั้นทางเดินหายใจ (Choking) - ข้อ 3',
      subtitle_th: 'ความเพียงพอและความพร้อมของอุปกรณ์ที่ใช้ฝึกปฏิบัติ',
      station_code: 'STATION_C_CHOKING',
      station_name_th: 'ฐาน ค. การช่วยเหลือเด็กที่มีสิ่งแปลกปลอมอุดกั้นทางเดินหายใจ (Choking)',
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 29
    },

    // 4.2 ประสบการณ์ฝ่ายพัฒนาเด็กปฐมวัย คณะพยาบาลศาสตร์
    {
      code: 'SEC_4_2_EXP',
      section_num: '4.2',
      category: 'early_childhood',
      title_th: '4.2 ประสบการณ์ที่ได้รับจากการขึ้นฝึกปฏิบัติ ณ ฝ่ายพัฒนาเด็กปฐมวัย',
      subtitle_th: 'ความเหมาะสมของประสบการณ์การเรียนรู้ที่ได้รับจากการขึ้นฝึกปฏิบัติ ณ ฝ่ายพัฒนาเด็กปฐมวัย',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 40
    },
    {
      code: 'SEC_4_2_SUGGESTION_EXTRA',
      section_num: '4.2',
      category: 'early_childhood',
      title_th: '4.2 ข้อเสนอแนะเพิ่มเติมเกี่ยวกับการฝึก ณ ฝ่ายพัฒนาเด็กปฐมวัย',
      subtitle_th: 'ข้อเสนอแนะเพิ่มเติมเกี่ยวกับการฝึก ณ ฝ่ายพัฒนาเด็กปฐมวัย (ไม่บังคับ)',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 0,
      introduced_in_version: 'v1',
      sort_order: 41
    },

    // 4.4 การจัดกิจกรรมการเล่นบนหอผู้ป่วย (New item in v2)
    {
      code: 'SEC_4_4_PLAY_ACTIVITY',
      section_num: '4.4',
      category: 'ward_play',
      title_th: '4.4 การจัดกิจกรรมการเล่นบนหอผู้ป่วย',
      subtitle_th: 'ความเหมาะสมโดยรวมของการจัดกิจกรรมการเล่นบนหอผู้ป่วย',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v2',
      sort_order: 60
    },

    // 4.5 การอภิปรายกรณีเลือกสรร (New item in v2)
    {
      code: 'SEC_4_5_SELECTED_CASE',
      section_num: '4.5',
      category: 'case_discussion',
      title_th: '4.5 การอภิปรายกรณีเลือกสรร',
      subtitle_th: 'ความเหมาะสมโดยรวมของการอภิปรายกรณีเลือกสรรในวันแรกของสัปดาห์ที่ 8',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v2',
      sort_order: 70
    },

    // 4.6 การสอบลงกอง (OSPE) - 7 ข้อเดิม รักษารหัสถาวร
    {
      code: 'SEC_4_6_OSPE_1_NEB',
      section_num: '4.6',
      category: 'ospe',
      title_th: '4.6 การสอบลงกอง (OSPE) ข้อ 1',
      subtitle_th: 'ความเหมาะสมของทักษะการพ่นยาที่ใช้สอบลงกอง',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 81
    },
    {
      code: 'SEC_4_6_OSPE_2_SUCTION',
      section_num: '4.6',
      category: 'ospe',
      title_th: '4.6 การสอบลงกอง (OSPE) ข้อ 2',
      subtitle_th: 'ความเหมาะสมของทักษะการดูดเสมหะ (Suction) ที่ใช้สอบลงกอง',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 82
    },
    {
      code: 'SEC_4_6_OSPE_3_IV',
      section_num: '4.6',
      category: 'ospe',
      title_th: '4.6 การสอบลงกอง (OSPE) ข้อ 3',
      subtitle_th: 'ความเหมาะสมของทักษะการให้ยาฉีดทางหลอดเลือดดำที่ใช้สอบลงกอง',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 83
    },
    {
      code: 'SEC_4_6_OSPE_4_NG',
      section_num: '4.6',
      category: 'ospe',
      title_th: '4.6 การสอบลงกอง (OSPE) ข้อ 4',
      subtitle_th: 'ความเหมาะสมของทักษะการใส่สายให้อาหารทางจมูก (NG) ที่ใช้สอบลงกอง',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 84
    },
    {
      code: 'SEC_4_6_OSPE_5_WRITTEN',
      section_num: '4.6',
      category: 'ospe',
      title_th: '4.6 การสอบลงกอง (OSPE) ข้อ 5',
      subtitle_th: 'ความเหมาะสมของจำนวนข้อสอบข้อเขียนทั้งหมด 10 ข้อ',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 85
    },
    {
      code: 'SEC_4_6_OSPE_6_TIME',
      section_num: '4.6',
      category: 'ospe',
      title_th: '4.6 การสอบลงกอง (OSPE) ข้อ 6',
      subtitle_th: 'ความเหมาะสมของระยะเวลาสอบทักษะ 7 นาทีต่อฐาน',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 86
    },
    {
      code: 'SEC_4_6_OSPE_7_OVERALL',
      section_num: '4.6',
      category: 'ospe',
      title_th: '4.6 การสอบลงกอง (OSPE) ข้อ 7',
      subtitle_th: 'ความพึงพอใจโดยรวมต่อการสอบ OSPE',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 87
    },

    // 4.7 ความพึงพอใจในภาพรวมของการจัดการเรียนการสอนของรายวิชา - รักษารหัสถาวรเดิม
    {
      code: 'SEC_4_7_OVERALL_SATISFACTION',
      section_num: '4.7',
      category: 'course_overall',
      title_th: '4.7 ความพึงพอใจในภาพรวมของรายวิชา',
      subtitle_th: 'ความพึงพอใจในภาพรวมของการจัดการเรียนการสอนรายวิชา 640-394 ปฏิบัติการพยาบาลเด็ก',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: 90
    },
    {
      code: 'SEC_4_7_IMPRESSIONS',
      section_num: '4.7',
      category: 'course_overall',
      title_th: 'สิ่งที่ประทับใจหรือเห็นว่าควรคงไว้',
      subtitle_th: 'สิ่งที่นักศึกษาประทับใจหรือเห็นว่าควรคงไว้ในรายวิชานี้ (ไม่บังคับ)',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 0,
      introduced_in_version: 'v1',
      sort_order: 91
    },
    {
      code: 'SEC_4_7_SUGGESTIONS',
      section_num: '4.7',
      category: 'course_overall',
      title_th: 'สิ่งที่ควรปรับปรุงและข้อเสนอแนะ',
      subtitle_th: 'สิ่งที่ควรปรับปรุงและข้อเสนอแนะสำหรับการจัดการเรียนการสอนครั้งต่อไป (ไม่บังคับ)',
      station_code: null,
      station_name_th: null,
      hospital_code: null,
      ward_code: null,
      is_rating: 0,
      introduced_in_version: 'v1',
      sort_order: 92
    }
  ];

  // Also add ward dynamic question templates to question_definitions for completeness
  const hospMap = {
    'HOSP_PSU': 'รพ.มอ.',
    'HOSP_HATYAI': 'รพ.หาดใหญ่',
    'HOSP_SONGKHLA': 'รพ.สงขลา'
  };

  for (const w of wards) {
    const hospLabel = hospMap[w.hospital_code] || '';
    questions.push({
      code: `SEC_4_3_WARD_${w.code}_EXP`,
      section_num: '4.3',
      category: 'ward_experience',
      title_th: `4.3 ${hospLabel} - ${w.ward_name_th}`,
      subtitle_th: 'ความเหมาะสมของประสบการณ์การเรียนรู้ที่ได้รับจากการขึ้นฝึกปฏิบัติบนหอผู้ป่วยนี้',
      station_code: null,
      station_name_th: null,
      hospital_code: w.hospital_code,
      ward_code: w.code,
      is_rating: 1,
      introduced_in_version: 'v1',
      sort_order: w.sort_order
    });
    questions.push({
      code: `SEC_4_3_WARD_${w.code}_EXTRA`,
      section_num: '4.3',
      category: 'ward_experience',
      title_th: `4.3 ${hospLabel} - ${w.ward_name_th} (ข้อเสนอแนะเพิ่มเติม)`,
      subtitle_th: 'ข้อเสนอแนะเพิ่มเติมสำหรับหอผู้ป่วยนี้ (ไม่บังคับ)',
      station_code: null,
      station_name_th: null,
      hospital_code: w.hospital_code,
      ward_code: w.code,
      is_rating: 0,
      introduced_in_version: 'v1',
      sort_order: w.sort_order + 500
    });
  }

  for (const q of questions) {
    insertQ.run(
      q.code,
      q.section_num,
      q.category,
      q.title_th,
      q.subtitle_th,
      q.station_code,
      q.station_name_th,
      q.hospital_code,
      q.ward_code,
      q.is_rating,
      q.introduced_in_version,
      q.sort_order
    );
  }

  // 5. Seed Evaluation Rounds (starting from 2/2569, 1/2570, 2/2570 onwards)
  const defaultTerms = [
    { sem: 2, year: 2569, code: '2569-2', title: 'ภาคการศึกษาที่ 2 ปีการศึกษา 2569' },
    { sem: 1, year: 2570, code: '2570-1', title: 'ภาคการศึกษาที่ 1 ปีการศึกษา 2570' },
    { sem: 2, year: 2570, code: '2570-2', title: 'ภาคการศึกษาที่ 2 ปีการศึกษา 2570' },
    { sem: 1, year: 2571, code: '2571-1', title: 'ภาคการศึกษาที่ 1 ปีการศึกษา 2571' },
    { sem: 2, year: 2571, code: '2571-2', title: 'ภาคการศึกษาที่ 2 ปีการศึกษา 2571' },
    { sem: 1, year: 2572, code: '2572-1', title: 'ภาคการศึกษาที่ 1 ปีการศึกษา 2572' },
    { sem: 2, year: 2572, code: '2572-2', title: 'ภาคการศึกษาที่ 2 ปีการศึกษา 2572' },
    { sem: 1, year: 2573, code: '2573-1', title: 'ภาคการศึกษาที่ 1 ปีการศึกษา 2573' }
  ];

  const now = new Date().toISOString();
  const insertRound = db.prepare(`
    INSERT OR IGNORE INTO evaluation_rounds (
      round_code, academic_year, semester, title, status, form_version, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const t of defaultTerms) {
    insertRound.run(
      t.code,
      t.year,
      t.sem,
      t.title,
      'open',
      'v2',
      `รอบประเมิน ${t.sem}/${t.year}`,
      now,
      now
    );
  }
  console.log('[SEED] Ensured evaluation rounds from 2/2569 to 1/2573 (open, v2)');
}

module.exports = {
  seedDatabase,
  hospitals,
  wards
};
