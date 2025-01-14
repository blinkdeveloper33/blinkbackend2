// src/services/emailService.ts

import { Resend } from 'resend';
import logger from './logger';

// Initialize Resend with the API key directly
const resend = new Resend('re_QSQXoq4M_7zW9zvWSnRcwbAHu6s34zg9w');

const generateOTPEmailTemplate = (otp: string): string => {
  const logoUrl = "https://www.dropbox.com/scl/fi/zi32vtqmzzxqq0bifx47m/blink_logo.svg?rlkey=0v8hh6ezsvy8vrt2g6ym8jflh&dl=0";
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>Verify Your Blink Account</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
        
        :root {
          color-scheme: light dark;
          supported-color-schemes: light dark;
        }

        @media (prefers-color-scheme: dark) {
          .email-wrapper { background-color: #111827 !important; }
          .email-content { background-color: #1F2937 !important; }
          .text-content { color: #F3F4F6 !important; }
          .highlight-box { background: linear-gradient(135deg, #3B82F6, #2563EB) !important; }
        }

        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes glowPulse {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
          70% { box-shadow: 0 0 0 15px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }

        .animate-slide-up {
          animation: slideUp 0.6s ease-out forwards;
        }

        .animate-glow {
          animation: glowPulse 2s infinite;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; background: #F3F4F6;">
      <div class="email-wrapper" style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div class="email-content animate-slide-up" style="background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <!-- Header with Logo -->
          <div style="background: linear-gradient(135deg, #3B82F6, #2563EB); padding: 40px 20px; text-align: center;">
            <img src="${logoUrl}" 
                 alt="Blink" 
                 style="height: 45px; width: auto; max-width: 180px;"
                 width="180"
                 height="45">
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="font-size: 24px; color: #111827; margin: 0 0 20px;">Verify your email</h2>
            
            <p class="text-content" style="font-size: 16px; color: #4B5563; line-height: 1.6; margin-bottom: 30px;">
              Enter this verification code to get started with Blink:
            </p>

            <!-- OTP Box -->
            <div class="animate-glow" style="background: linear-gradient(135deg, #3B82F6, #2563EB); border-radius: 16px; padding: 30px; text-align: center; margin: 30px 0;">
              <div style="color: white; font-size: 36px; font-weight: 800; letter-spacing: 8px;">
                ${otp}
              </div>
            </div>

            <div style="background: #F3F4F6; border-radius: 12px; padding: 20px; margin: 30px 0;">
              <p style="font-size: 14px; color: #6B7280; margin: 0;">
                Code expires in 10 minutes<br>
                For your security, never share this code
              </p>
            </div>

            <p class="text-content" style="font-size: 14px; color: #6B7280; text-align: center; margin-top: 40px;">
              This is an automated message from Blink.<br>Please do not reply to this email.
            </p>
          </div>

          <!-- Footer -->
          <div style="background: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #E5E7EB;">
            <p style="font-size: 12px; color: #9CA3AF; margin: 0;">
              © 2025 Rise Digital Financial Corp. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const sendOTPEmail = async (to: string, otp: string): Promise<void> => {
  try {
    logger.info('Starting email send attempt', { to });

    const { data, error } = await resend.emails.send({
      from: 'Blink <alejandro@blinkfinances.com>',
      to: [to],
      subject: 'Welcome to Blink! Verify Your Email',
      html: generateOTPEmailTemplate(otp),
      text: `Your verification code is: ${otp}. This code will expire in 10 minutes.`
    });

    if (error) {
      logger.error('Resend API Error:', error);
      throw error;
    }

    logger.info('Email sent successfully', { messageId: data?.id });

  } catch (error: any) {
    logger.error('Email Service Error:', {
      message: error.message,
      name: error.name
    });
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
};
