// src/utils/otpGenerator.ts ⭐️⭐️⭐️

/**
 * Generates a 6-digit One-Time Password (OTP).
 * @returns A string representing the OTP.
 */
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
