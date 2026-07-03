import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

/**
 * Generate a TOTP secret and QR code for 2FA setup
 */
export async function generateTOTPSecret(email: string) {
  const secret = new OTPAuth.Secret({ size: 20 });
  
  const totp = new OTPAuth.TOTP({
    issuer: "LMS Admin",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secret,
  });

  const otpauth = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  return {
    secret: secret.base32,
    qrCode: qrCodeDataUrl,
    otpauth,
  };
}

/**
 * Verify a TOTP token
 */
export function verifyTOTPToken(secret: string, token: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  } catch (error) {
    console.error("Error verifying TOTP:", error);
    return false;
  }
}

/**
 * Generate backup codes for 2FA recovery
 */
export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Verify a backup code
 */
export function verifyBackupCode(backupCodes: string[], code: string): boolean {
  return backupCodes.includes(code.toUpperCase());
}
