
"use server";

interface LicenseVerificationResponse {
  status: "valid" | "invalid" | "error" | "pending" | "idle";
  pro: boolean;
  features?: {
    project_limit: string;
    advanced_logs: boolean;
    custom_daemon_configs: boolean;
  };
  message?: string;
}

// This is a mock of the external API call.
// In a real scenario, this would make an HTTPS POST request to `https://dvpanel-api.example.com/check`.
async function fetchLicenseStatusFromExternalAPI(licenseKey: string): Promise<any> {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (licenseKey === "PRO-VALID-KEY-1234") {
    return {
      status: "valid",
      pro: true,
      features: {
        project_limit: "unlimited",
        advanced_logs: true,
        custom_daemon_configs: true,
      },
    };
  } else if (licenseKey === "PRO-INVALID-KEY-0000") {
    return {
      status: "invalid",
      pro: false,
      message: "This license key is invalid or has expired."
    };
  } else {
    // Simulate a generic invalid key
    return {
      status: "invalid",
      pro: false,
      message: "The provided license key could not be validated."
    };
  }
}

export async function verifyLicenseKey(licenseKey: string): Promise<LicenseVerificationResponse> {
  try {
    const response = await fetchLicenseStatusFromExternalAPI(licenseKey);
    
    if (response.status === "valid" && response.pro) {
      return {
        status: "valid",
        pro: true,
        features: response.features,
        message: "License successfully validated."
      };
    } else {
      return {
        status: "invalid",
        pro: false,
        message: response.message || "Invalid license key."
      };
    }
  } catch (error) {
    console.error("License verification error:", error);
    return {
      status: "error",
      pro: false,
      message: "An error occurred while trying to verify the license key. Please check your internet connection and try again."
    };
  }
}
