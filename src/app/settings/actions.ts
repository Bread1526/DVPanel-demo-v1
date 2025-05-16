
"use server";

import { z } from 'zod';
import { firestoreAdmin } from '@/lib/firebase/admin';

const panelSettingsSchema = z.object({
  panelPort: z.coerce.number().min(1024).max(65535),
  panelIp: z.string().min(1, { message: "Panel IP/Domain cannot be empty" }), // Basic validation, can be improved for IP/domain format
});

export interface SavePanelSettingsState {
  message: string;
  status: "success" | "error" | "idle";
  errors?: {
    panelPort?: string[];
    panelIp?: string[];
  }
}

export async function savePanelSettings(
  prevState: SavePanelSettingsState,
  formData: FormData
): Promise<SavePanelSettingsState> {

  const validatedFields = panelSettingsSchema.safeParse({
    panelPort: formData.get('panel-port'),
    panelIp: formData.get('panel-ip'),
  });

  if (!validatedFields.success) {
    return {
      message: "Validation failed. Please check the input fields.",
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  if (!firestoreAdmin) {
    console.error("Firestore Admin is not initialized. Cannot save panel settings.");
    return {
      message: "Panel settings cannot be saved: Server configuration error (Firebase Admin).",
      status: "error",
    };
  }

  const { panelPort, panelIp } = validatedFields.data;
  const configurationsCollection = firestoreAdmin.collection('dvPanelConfigurations');
  let panelIdToSave = 0;
  const MAX_PANEL_ID_CHECK = 100; // Limit to prevent infinite loops

  try {
    for (let i = 1; i <= MAX_PANEL_ID_CHECK; i++) {
      const docRef = configurationsCollection.doc(String(i));
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        panelIdToSave = i;
        break;
      }
    }

    if (panelIdToSave === 0) {
      // All IDs from 1 to MAX_PANEL_ID_CHECK are taken
      console.error(`All panel configuration slots up to ${MAX_PANEL_ID_CHECK} are taken.`);
      return {
        message: `Failed to save settings: All configuration slots are currently in use. Please contact support.`,
        status: "error",
      };
    }

    const timestamp = new Date().toISOString();

    await configurationsCollection.doc(String(panelIdToSave)).set({
      panelPort,
      panelIp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    console.log(`Panel Settings saved to Firestore with ID ${panelIdToSave}: Port ${panelPort}, IP ${panelIp}`);
    return {
      message: `Panel settings (Port: ${panelPort}, IP: ${panelIp}) saved to Firebase with Panel ID ${panelIdToSave}.`,
      status: "success",
    };

  } catch (error) {
    console.error("Error saving panel settings to Firestore:", error);
    return {
      message: "Failed to save settings to database due to a server error. Please try again.",
      status: "error",
    };
  }
}
