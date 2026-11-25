const path = require('node:path');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'pediatric-eval-640-394-psu-secret-key-change-in-prod',
  jwtExpiresIn: '24h',
  cookieName: 'pediatric_eval_admin_token',
  
  // Database path
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'evaluations.db'),
  
  // Admin credentials (can be overridden via environment variables)
  defaultAdminUsername: process.env.ADMIN_DEFAULT_USER || 'admin',
  defaultAdminPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'Pediatric640!',
  
  // App metadata
  courseCode: '640-394',
  courseName: 'ปฏิบัติการพยาบาลเด็ก',
  facultyName: 'คณะพยาบาลศาสตร์',
  universityName: 'มหาวิทยาลัยสงขลานครินทร์',
  systemTitle: 'ระบบประเมินผลรายวิชา 640-394 ปฏิบัติการพยาบาลเด็ก',
  currentFormVersion: 'v2',

  // Allowed Sections
  sections: ['Sec 01', 'Sec 02', 'Sec 03', 'Sec 04'],

  // Default Academic Semesters & Years for selection (starts from 2/2569 onwards)
  terms: ['2/2569', '1/2570', '2/2570', '1/2571', '2/2571', '1/2572', '2/2572', '1/2573'],

  // Rating scale definition
  ratingScale: {
    5: { label: 'มากที่สุด', value: 5 },
    4: { label: 'มาก', value: 4 },
    3: { label: 'ปานกลาง', value: 3 },
    2: { label: 'น้อย', value: 2 },
    1: { label: 'น้อยที่สุด', value: 1 },
    'NA': { label: 'ไม่มีประสบการณ์เรียนรู้ในประเด็นนี้/ไม่ได้ขึ้นฝึกปฏิบัติหรือเข้าร่วมรูปแบบการจัดการเรียนการสอนในหัวข้อนั้น', value: 'NA' }
  }
};

module.exports = config;
