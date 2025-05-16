// src/lib/config.ts

/**
 * @fileOverview Configuration loader for DVPanel.
 * Reads essential configuration from environment variables.
 */

const INSTALLATION_CODE_ENV_VAR = 'INSTALLATION_CODE';
const DATA_PATH_ENV_VAR = 'DVSPANEL_DATA_PATH';
const DEFAULT_DATA_PATH = './.dvpanel_data/'; // Relative to project root

let memoizedInstallationCode: string | null = null;
let memoizedDataPath: string | null = null;

/**
 * Retrieves the unique installation code for this DVPanel instance.
 * This code is critical for encryption and security.
 * @returns {string} The installation code.
 * @throws {Error} If the INSTALLATION_CODE environment variable is not set.
 */
export function getInstallationCode(): string {
  if (memoizedInstallationCode) {
    return memoizedInstallationCode;
  }

  const code = process.env[INSTALLATION_CODE_ENV_VAR];
  if (!code) {
    console.error(
      `CRITICAL ERROR: The '${INSTALLATION_CODE_ENV_VAR}' environment variable is not set. ` +
      `This code is essential for panel operation and security. ` +
      `Please generate a strong unique code and set it in your .env.local file.`
    );
    throw new Error(
      `Configuration Error: '${INSTALLATION_CODE_ENV_VAR}' is not set.`
    );
  }
  memoizedInstallationCode = code;
  return code;
}

/**
 * Retrieves the path for storing DVPanel's local data files.
 * Defaults to './.dvpanel_data/' in the project root if not specified.
 * @returns {string} The absolute path to the data directory.
 */
export function getDataPath(): string {
  if (memoizedDataPath) {
    return memoizedDataPath;
  }
  // Node.js 'path' module is not available in edge runtime, but this file
  // should primarily be used in server-side contexts (actions, API routes).
  const path = require('path');
  const dataPath = process.env[DATA_PATH_ENV_VAR] || DEFAULT_DATA_PATH;
  
  // Ensure the path is absolute. If it's relative, resolve it from the project root.
  if (path.isAbsolute(dataPath)) {
    memoizedDataPath = dataPath;
  } else {
    memoizedDataPath = path.resolve(process.cwd(), dataPath);
  }
  return memoizedDataPath;
}

// Attempt to load critical config on module load to catch errors early.
try {
  getInstallationCode();
  console.log(`DVPanel Installation Code: Loaded`);
  console.log(`DVPanel Data Path: ${getDataPath()}`);
} catch (error) {
  // Error is already logged by getInstallationCode,
  // and it will throw, halting further server-side execution that depends on it.
  // This ensures the application doesn't run in an insecure/improperly configured state.
}
