// src/services/emailService.ts

import nodemailer from 'nodemailer';
import config from '../config';
import logger from './logger';

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
      from: `"Blink Finances" <${config.SMTP_FROM_EMAIL}>`,
      to,
      subject: 'Your Blink Finances Verification Code',
      text: `Your verification code is: ${otp}`,
      html: `<p>Your verification code is: <b>${otp}</b></p>`,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`OTP email sent to ${to}`);
  } catch (error: any) {
    logger.error('Error sending OTP email:', error.message);
    throw new Error('Failed to send OTP email.');
  }
};
