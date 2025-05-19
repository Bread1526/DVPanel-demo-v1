
// daemon.js
// This file's functionality has been integrated into Next.js API routes
// specifically for the File Manager feature.
// See: src/app/api/panel-daemon/files/route.ts and src/app/api/panel-daemon/file/route.ts
// You can delete this file if it's no longer used for other purposes.

const fs = require('fs');
const path = require('path');

const logFile = path.resolve(__dirname, 'daemon.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${message}\n`;
  // fs.appendFileSync(logFile, logMsg); // Commented out to prevent errors if this script is run accidentally
  console.log(logMsg.trim());
}

log('Legacy daemon.js script started (functionality moved to Next.js API routes).');

// setInterval(() => {
//   log('Legacy daemon.js is running...');
// }, 10000);

// process.on('SIGINT', () => {
//   log('Legacy daemon.js stopped (SIGINT).');
//   process.exit(0);
// });
// process.on('SIGTERM', () => {
//   log('Legacy daemon.js stopped (SIGTERM).');
//   process.exit(0);
// });
