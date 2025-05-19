// daemon.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.DAEMON_PORT || 3005;

app.use(cors());
app.use(express.json());

// Sanitize and resolve file paths within a root directory
const BASE_DIR = '/srv/www';
const resolveSafePath = (userPath) => {
  const safePath = path.resolve(BASE_DIR, userPath || '');
  if (!safePath.startsWith(BASE_DIR)) throw new Error('Access denied');
  return safePath;
};

// List files in a directory
app.get('/api/v1/files', (req, res) => {
  try {
    const userPath = req.query.path || '/';
    const dirPath = resolveSafePath(userPath);

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'folder' : 'file',
    }));

    res.json({ path: userPath, files: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list files.' });
  }
});

// Read a file
app.get('/api/v1/file', (req, res) => {
  try {
    const userPath = req.query.path;
    const filePath = resolveSafePath(userPath);

    const content = fs.readFileSync(filePath, 'utf-8');
    res.send(content);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file.' });
  }
});

// Start the daemon
app.listen(PORT, () => {
  console.log(`🔧 DVPanel Daemon running at http://localhost:${PORT}`);
});
