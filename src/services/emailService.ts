import nodemailer from 'nodemailer';
import config from '../config';
import logger from './logger';

/**
 * Generates an HTML email template for the OTP.
 * @param otp - One-Time Password to send.
 * @returns HTML string for the email body.
 */
const generateOTPEmailTemplate = (otp: string): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Blink Finances Verification Code</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f8f8; border-radius: 5px;">
        <tr>
          <td style="padding: 20px;">
            <h1 style="color: #4a90e2; text-align: center; margin-bottom: 20px;">Blink Finances</h1>
            <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>
            <p style="font-size: 16px; margin-bottom: 20px;">Thank you for choosing Blink Finances. To complete your verification, please use the following code:</p>
            <div style="background-color: #4a90e2; color: white; font-size: 24px; font-weight: bold; text-align: center; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
              ${otp}
            </div>
            <p style="font-size: 16px; margin-bottom: 20px;">This code will expire in 10 minutes for security reasons. If you didn't request this code, please ignore this email.</p>
            <p style="font-size: 16px; margin-bottom: 20px;">If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
            <p style="font-size: 16px; margin-bottom: 20px;">Best regards,<br>The Blink Finances Team</p>
          </td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #888; text-align: center; margin-top: 20px;">This is an automated message, please do not reply to this email.</p>
    </body>
    </html>
  `;
};

/**
 * Sends an OTP email to the specified recipient.
 * @param to - Recipient's email address.
 * @param otp - One-Time Password to send.
 */
export const sendOTPEmail = async (to: string, otp: string): Promise<void> => {
  try {
    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465, // true for 465, false for other ports
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: `"${config.SMTP_FROM_NAME}" <${config.SMTP_FROM_EMAIL}>`,
      to,
      subject: 'Your Blink Finances Verification Code',
      text: `Your verification code is: ${otp}`,
      html: generateOTPEmailTemplate(otp),
    };

    await transporter.sendMail(mailOptions);
    logger.info(`OTP email sent to ${to}`);
  } catch (error: any) {
    logger.error('Error sending OTP email:', error.message);
    throw new Error('Failed to send OTP email.');
  }
};

