
// src/backend/services/storageService.ts
'use server';

/**
 * @fileOverview Service for storing and retrieving data from local JSON files.
 * This service will eventually handle encryption/decryption.
 */

import fs from 'fs';
import path from 'path';
import { getInstallationCode, getDataPath } from '@/backend/lib/config';

/**
 * Ensures that the data directory, as specified by DVSPANEL_DATA_PATH or default, exists.
 * If it doesn't exist, it attempts to create it.
 * @throws {Error} If the directory cannot be created.
 */
async function ensureDataDirectoryExists(): Promise<void> {
  const dataPath = getDataPath();
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
 * Saves data to a JSON file within the configured data directory.
 * Currently, encryption is a placeholder.
 * @param {string} filename - The name of the file (e.g., 'users.json').
 * @param {object} data - The data to be saved.
 * @throws {Error} If saving fails.
 */
export async function saveEncryptedData(filename: string, data: object): Promise<void> {
  await ensureDataDirectoryExists();
  const installationCode = getInstallationCode(); // Ensure it's available, though not used for encryption yet.
  const dataPath = getDataPath();
  const filePath = path.join(dataPath, filename);

  try {
    // Placeholder for actual encryption:
    // const encryptedData = await encrypt(JSON.stringify(data), installationCode, perInstallSeed);
    console.log(`[StorageService] Placeholder: Would encrypt data for ${filename} using installation code.`);
    const jsonData = JSON.stringify(data, null, 2); // Pretty print JSON

    fs.writeFileSync(filePath, jsonData, 'utf8');
    console.log(`[StorageService] Data successfully saved to ${filePath}`);
  } catch (error) {
    console.error(`[StorageService] Error saving data to ${filePath}:`, error);
    const baseMessage = `Storage Error: Failed to save data to ${filename}.`;
    const detailedMessage = error instanceof Error ? `${baseMessage} Reason: ${error.message}` : baseMessage;
    throw new Error(detailedMessage);
  }
}

/**
 * Loads data from a JSON file within the configured data directory.
 * Currently, decryption is a placeholder.
 * @param {string} filename - The name of the file (e.g., 'users.json').
 * @returns {Promise<object | null>} The loaded data, or null if the file doesn't exist or an error occurs.
 * @throws {Error} If loading fails critically (other than file not found).
 */
export async function loadEncryptedData(filename: string): Promise<object | null> {
  await ensureDataDirectoryExists(); // Ensure directory exists before attempting read
  const installationCode = getInstallationCode(); // Ensure it's available
  const dataPath = getDataPath();
  const filePath = path.join(dataPath, filename);

  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[StorageService] File not found: ${filePath}. Returning null.`);
      return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Placeholder for actual decryption:
    // const decryptedJson = await decrypt(fileContent, installationCode, perInstallSeed);
    console.log(`[StorageService] Placeholder: Would decrypt data from ${filename} using installation code.`);
    
    const data = JSON.parse(fileContent); // Assuming fileContent is the already decrypted JSON string for now
    console.log(`[StorageService] Data successfully loaded from ${filePath}`);
    return data;
  } catch (error) {
    // Differentiate between parse error and other errors
    if (error instanceof SyntaxError) {
        console.error(`[StorageService] Error parsing JSON from ${filePath}:`, error);
        // Optionally, handle corrupted files, e.g., by backing them up and returning null
        // For now, re-throw as a more specific error or return null
        const baseMessage = `Storage Error: Failed to parse JSON from ${filename}.`;
        const detailedMessage = `${baseMessage} Reason: ${error.message}`;
        throw new Error(detailedMessage);
    }
    console.error(`[StorageService] Error loading data from ${filePath}:`, error);
    const baseMessage = `Storage Error: Failed to load data from ${filename}.`;
    const detailedMessage = error instanceof Error ? `${baseMessage} Reason: ${error.message}` : baseMessage;
    throw new Error(detailedMessage);
  }
}
