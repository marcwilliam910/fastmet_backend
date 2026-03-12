import axios from "axios";
import jwt from "jsonwebtoken";

/**
 * Calls Google's reCAPTCHA verification endpoint.
 * Works for both v2 (boolean score check) and v3 (score >= threshold).
 */
const RECAPTCHA_SECRET = process.env.GOOGLE_RECAPTCHA_SECRET!;
const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
export async function verifyReCaptcha(
  token: string,
  remoteip?: string,
): Promise<void> {
  const params = new URLSearchParams({
    secret: RECAPTCHA_SECRET,
    response: token,
    ...(remoteip ? { remoteip } : {}),
  });

  const { data } = await axios.post<{
    success: boolean;
    "error-codes"?: string[];
  }>(RECAPTCHA_VERIFY_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!data.success) {
    const reasons = data["error-codes"]?.join(", ") ?? "unknown";
    throw new Error(`reCAPTCHA failed: ${reasons}`);
  }
}

export function verifyOTPRegistrationToken(token: string): {
  phoneNumber: string;
} {
  const payload = jwt.verify(token, process.env.OTP_JWT_SECRET!) as {
    phoneNumber: string;
    purpose: string;
  };

  if (payload.purpose !== "pre-register") {
    throw new Error("Invalid token purpose");
  }

  return { phoneNumber: payload.phoneNumber };
}
