// src/backend/services/storageService.ts
// 'use server'; // This directive should NOT be here as this file exports non-async utilities/constants if it had them.

/**
 * @fileOverview Service for storing and retrieving data from local JSON files.
 * Implements AES-256-GCM encryption.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getInstallationCode, getDataPath } from '@/backend/lib/config';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // bytes
const AUTH_TAG_LENGTH = 16; // bytes
// const KEY_LENGTH = 32; // bytes for AES-256 (derived key will be 32 bytes from sha256)

/**
 * Derives a consistent 32-byte key from the installation code using SHA-256.
 * @returns {Buffer} The derived 32-byte key.
 */
function getDerivedKey(): Buffer {
  const installationCode = getInstallationCode();
  return crypto.createHash('sha256').update(String(installationCode)).digest();
}

/**
 * Ensures that the data directory, as specified by DVSPANEL_DATA_PATH or default, exists.
 * If it doesn't exist, it attempts to create it.
 * @throws {Error} If the directory cannot be created.
 */
async function ensureDataDirectoryExists(): Promise<void> {
  const dataPath = getDataPath();
  // Unconditional log to always see the path being checked/created
  console.log(`[StorageService - ensureDataDirectoryExists] Checking/creating data path: ${dataPath}`);
  if (!fs.existsSync(dataPath)) {
    console.warn(`[StorageService - ensureDataDirectoryExists] Data directory does not exist, attempting to create: ${dataPath}`);
    try {
      fs.mkdirSync(dataPath, { recursive: true });
      console.log(`[StorageService - ensureDataDirectoryExists] Data directory successfully created: ${dataPath}`);
    } catch (error: any) {
      const detailedMessage = `Storage Service FATAL ERROR: Failed to create data directory at '${dataPath}'. Please check permissions. System Error: ${error.message || String(error)}`;
      console.error(`[StorageService - ensureDataDirectoryExists] ${detailedMessage}`, error);
      throw new Error(detailedMessage);
    }
  } else {
    // console.log(`[StorageService - ensureDataDirectoryExists] Data directory already exists: ${dataPath}`);
  }
}

/**
 * Saves data to an encrypted JSON file within the configured data directory.
 * @param {string} filename - The name of the file (e.g., 'settings.json').
 * @param {object} data - The data to be saved.
 * @throws {Error} If saving or encryption fails.
 */
export async function saveEncryptedData(filename: string, data: object): Promise<void> {
  await ensureDataDirectoryExists(); // This call can throw and halt execution if directory cannot be ensured

  const derivedKey = getDerivedKey();
  const dataPath = getDataPath();
  const filePath = path.join(dataPath, filename);

  const dataSnippetForLog = JSON.stringify(data)?.substring(0, 200) + (JSON.stringify(data)?.length > 200 ? "..." : "");
  // Unconditional log to always see what's being attempted
  console.log(`[StorageService - saveEncryptedData] Attempting to write to: '${filePath}'. Data snippet: ${dataSnippetForLog}`);

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);

    const jsonData = JSON.stringify(data); // No pretty print for storage efficiency
    let encryptedDataBuffer = cipher.update(jsonData, 'utf8');
    encryptedDataBuffer = Buffer.concat([encryptedDataBuffer, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Store IV, authTag, and ciphertext together, e.g., separated by a colon
    const fileContent = `${iv.toString('hex')}:${authTag.toString('hex')}:${encryptedDataBuffer.toString('hex')}`;

    fs.writeFileSync(filePath, fileContent, 'utf8');
    console.log(`[StorageService - saveEncryptedData] SUCCESS: Data encrypted and saved to '${filePath}'`);
  } catch (error: any) {
    const detailedMessage = `Storage Service FATAL ERROR: Failed to write encrypted data to file '${filename}' (Path: '${filePath}'). System Error: ${error.message || String(error)}`;
    console.error(`[StorageService - saveEncryptedData] ${detailedMessage}`, error);
    throw new Error(detailedMessage); // Re-throw to be caught by calling server action
  }
}

/**
 * Loads and decrypts data from a JSON file within the configured data directory.
 * @param {string} filename - The name of the file (e.g., 'settings.json').
 * @returns {Promise<object | null>} The loaded and decrypted data, or null if the file doesn't exist or decryption fails.
 */
export async function loadEncryptedData(filename: string): Promise<object | null> {
  // No need to call ensureDataDirectoryExists() here, as if it doesn't exist, existsSync below will handle it.
  const derivedKey = getDerivedKey();
  const dataPath = getDataPath();
  const filePath = path.join(dataPath, filename);

  // console.log(`[StorageService - loadEncryptedData] Attempting to load from: ${filePath}`);

  try {
    if (!fs.existsSync(filePath)) {
      // console.log(`[StorageService - loadEncryptedData] File not found: ${filePath}. Returning null.`);
      return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parts = fileContent.split(':');
    if (parts.length !== 3) {
      console.error(`[StorageService - loadEncryptedData] DECRYPTION FAILED (Invalid Format): Encrypted file '${filePath}' has invalid format. Expected 3 parts, got ${parts.length}. File content might be plain text or corrupted.`);
      return null;
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = Buffer.from(parts[2], 'hex');

    if (iv.length !== IV_LENGTH) {
        console.error(`[StorageService - loadEncryptedData] DECRYPTION FAILED (Invalid IV Length): IV length in '${filePath}' is ${iv.length}, expected ${IV_LENGTH}.`);
        return null;
    }
     if (authTag.length !== AUTH_TAG_LENGTH) {
        console.error(`[StorageService - loadEncryptedData] DECRYPTION FAILED (Invalid AuthTag Length): AuthTag length in '${filePath}' is ${authTag.length}, expected ${AUTH_TAG_LENGTH}.`);
        return null;
    }

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);

    let decryptedJsonBuffer = decipher.update(encryptedData);
    decryptedJsonBuffer = Buffer.concat([decryptedJsonBuffer, decipher.final()]); // final() will throw if authTag is bad

    const jsonData = JSON.parse(decryptedJsonBuffer.toString('utf8'));
    // console.log(`[StorageService - loadEncryptedData] Data successfully loaded and decrypted from ${filePath}`);
    return jsonData;

  } catch (error: any) {
    if (error.code === 'ERR_CRYPTO_AEAD_BAD_TAG' || (error.message && error.message.toLowerCase().includes('unsupported state or bad tag'))) {
      console.error(`[StorageService - loadEncryptedData] DECRYPTION FAILED (Bad Auth Tag): Failed to decrypt '${filePath}'. Authentication tag is invalid. This could mean incorrect INSTALLATION_CODE or tampered data. Error: ${error.message}`);
    } else if (error instanceof SyntaxError) {
      console.error(`[StorageService - loadEncryptedData] PARSE FAILED: Failed to parse JSON from decrypted content of '${filePath}'. The file might be corrupted post-decryption or was not valid JSON. Error: ${error.message}`);
    } else {
      // For other errors during load (e.g., fs.readFileSync issues if permissions change between existsSync and readFileSync)
      console.error(`[StorageService - loadEncryptedData] UNEXPECTED LOAD ERROR: Failed to load or process file '${filePath}'. System Error: ${error.message || String(error)}`, error);
    }
    return null; // Return null on decryption, parse, or unexpected load failure
  }
}
