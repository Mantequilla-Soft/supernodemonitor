import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const expectedKey = config.secretKey;
  
  if (!expectedKey) {
    return res.status(500).json({
      success: false,
      error: 'Server configuration error: SECRET_KEY not set',
    });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Missing authorization header',
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer '
  
  if (token !== expectedKey) {
    // Log failed auth attempts
    console.warn(`Failed authentication attempt from ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid authorization token',
    });
  }
  
  next();
}
