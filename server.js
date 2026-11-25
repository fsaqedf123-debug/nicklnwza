const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const config = require('./src/config');
const { initDatabase } = require('./src/db/database');
const { seedDatabase } = require('./src/db/seed');

// Initialize database schema and initial data
initDatabase();
seedDatabase();

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Static public directory (allow dotfiles because parent path .gemini has a dot)
app.use(express.static(PUBLIC_DIR, { dotfiles: 'allow' }));

// API Routes
const evaluationRouter = require('./src/routes/evaluation');
const adminRouter = require('./src/routes/admin');

app.use('/api/evaluation', evaluationRouter);
app.use('/api/admin', adminRouter);

// Helper for sending static html files safely
function sendPublicHtml(res, filename) {
  res.sendFile(filename, { root: PUBLIC_DIR, dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) {
      console.error(`Error sending ${filename}:`, err);
      res.status(500).send('Error loading page');
    }
  });
}

// Fallback HTML routes
app.get('/admin', (req, res) => {
  sendPublicHtml(res, 'admin.html');
});

app.get('/login', (req, res) => {
  sendPublicHtml(res, 'login.html');
});

// Catch-all route to serve student index.html
app.use((req, res) => {
  sendPublicHtml(res, 'index.html');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง'
    });
  }
});

const PORT = config.port;
const server = app.listen(PORT, config.host, () => {
  console.log(`================================================================`);
  console.log(`  ${config.systemTitle}`);
  console.log(`  ${config.facultyName} ${config.universityName}`);
  console.log(`----------------------------------------------------------------`);
  console.log(`  - Student Evaluation URL: http://localhost:${PORT}/`);
  console.log(`  - Admin Dashboard URL:    http://localhost:${PORT}/admin`);
  console.log(`  - Admin Login URL:        http://localhost:${PORT}/login`);
  console.log(`  - Default Admin:          ${config.defaultAdminUsername} / ${config.defaultAdminPassword}`);
  console.log(`================================================================`);
});

module.exports = { app, server };
