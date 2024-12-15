// src/utils/jwtGenerator.ts ⭐️⭐️⭐️

import jwt from 'jsonwebtoken';
import config from '../config';

/**
 * Generates a JWT token for the user.
 * @param userId - The user's unique identifier.
 * @returns A signed JWT token.
 */
export const generateJWT = (userId: string): string => {
  const payload = {
    userId,
  };

  const token = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: '1h', // Token validity duration
  });

  return token;
};
