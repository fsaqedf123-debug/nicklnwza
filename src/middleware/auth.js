const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db/database');

function authMiddleware(req, res, next) {
  let token = null;

  // 1. Check cookies
  if (req.cookies && req.cookies[config.cookieName]) {
    token = req.cookies[config.cookieName];
  }

  // 2. Check Authorization header
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'กรุณาเข้าสู่ระบบก่อนเข้าใช้งาน' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const admin = db.prepare('SELECT id, username, full_name, role FROM admins WHERE id = ?').get(decoded.id);
    if (!admin) {
      return res.status(401).json({ success: false, error: 'ไม่พบข้อมูลผู้ดูแลระบบ หรือบัญชีถูกระงับ' });
    }
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
  }
}

module.exports = authMiddleware;
