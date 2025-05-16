
// src/backend/services/storageService.ts
'use server';

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
const KEY_LENGTH = 32; // bytes for AES-256

/**
 * Derives a consistent 32-byte key from the installation code.
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
  // console.log(`[StorageService] Resolved data path: ${dataPath}`); 
  if (!fs.existsSync(dataPath)) {
    try {
      fs.mkdirSync(dataPath, { recursive: true });
      console.log(`[StorageService] Data directory created: ${dataPath}`);
    } catch (error) {
      console.error(`[StorageService] Failed to create data directory at ${dataPath}:`, error);
      const baseMessage = `Storage Error: Could not create data directory at ${dataPath}.`;
      const detailedMessage = error instanceof Error ? `${baseMessage} Reason: ${error.message}` : baseMessage;
      throw new Error(detailedMessage);
    }
  }
}

/**
 * Saves data to an encrypted JSON file within the configured data directory.
 * @param {string} filename - The name of the file (e.g., 'settings.json').
 * @param {object} data - The data to be saved.
 * @throws {Error} If saving or encryption fails.
 */
export async function saveEncryptedData(filename: string, data: object): Promise<void> {
  await ensureDataDirectoryExists();
  const derivedKey = getDerivedKey();
  const dataPath = getDataPath();
  const filePath = path.join(dataPath, filename);

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);
    
    const jsonData = JSON.stringify(data);
    let encryptedData = cipher.update(jsonData, 'utf8');
    encryptedData = Buffer.concat([encryptedData, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Store as iv:authTag:encryptedData (all hex encoded)
    const fileContent = `${iv.toString('hex')}:${authTag.toString('hex')}:${encryptedData.toString('hex')}`;
    
    fs.writeFileSync(filePath, fileContent, 'utf8');
    console.log(`[StorageService] Data successfully encrypted and saved to ${filePath}`);
  } catch (error) {
    console.error(`[StorageService] Error saving or encrypting data to ${filePath}:`, error);
    const baseMessage = `Storage Error: Failed to save data to ${filename}.`;
    const detailedMessage = error instanceof Error ? `${baseMessage} Reason: ${error.message}` : baseMessage;
    throw new Error(detailedMessage);
  }
}

/**
 * Loads and decrypts data from a JSON file within the configured data directory.
 * @param {string} filename - The name of the file (e.g., 'settings.json').
 * @returns {Promise<object | null>} The loaded and decrypted data, or null if the file doesn't exist or decryption fails.
 * @throws {Error} If loading fails critically (other than file not found or decryption failure).
 */
export async function loadEncryptedData(filename: string): Promise<object | null> {
  await ensureDataDirectoryExists(); 
  const derivedKey = getDerivedKey();
  const dataPath = getDataPath();
  const filePath = path.join(dataPath, filename);

  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[StorageService] File not found: ${filePath}. Returning null.`);
      return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parts = fileContent.split(':');
    if (parts.length !== 3) {
      console.error(`[StorageService] Invalid encrypted file format: ${filePath}. Expected 3 parts, got ${parts.length}.`);
      return null; // Or throw a more specific error
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = Buffer.from(parts[2], 'hex');

    if (iv.length !== IV_LENGTH) {
        console.error(`[StorageService] Invalid IV length in ${filePath}. Expected ${IV_LENGTH}, got ${iv.length}.`);
        return null;
    }
     if (authTag.length !== AUTH_TAG_LENGTH) {
        console.error(`[StorageService] Invalid authTag length in ${filePath}. Expected ${AUTH_TAG_LENGTH}, got ${authTag.length}.`);
        return null;
    }

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    let decryptedJson = decipher.update(encryptedData);
    decryptedJson = Buffer.concat([decryptedJson, decipher.final()]);
    
    const data = JSON.parse(decryptedJson.toString('utf8'));
    console.log(`[StorageService] Data successfully loaded and decrypted from ${filePath}`);
    return data;
  } catch (error) {
    console.error(`[StorageService] Error loading or decrypting data from ${filePath}:`, error);
    // Common errors:
    // - "Unsupported state or unable to authenticate" (if authTag is wrong / key is wrong / data tampered)
    // - SyntaxError if JSON.parse fails
    if (error instanceof SyntaxError) {
        const baseMessage = `Storage Error: Failed to parse JSON from decrypted content of ${filename}.`;
        const detailedMessage = `${baseMessage} Reason: ${error.message}`;
        // Potentially re-throw or return null depending on how critical this is
        console.error(detailedMessage); // Keep logging
        return null; // Or throw new Error(detailedMessage) if you want loadPanelSettings to handle it differently
    }
    // For other errors (like GCM auth failure), returning null is a safe default
    return null;
  }
}
