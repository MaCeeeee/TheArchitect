/* eslint-disable @typescript-eslint/no-empty-interface */
import { IUser } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      jwtPayload?: {
        userId: string;
        role: string;
        type: 'access' | 'refresh';
        iat: number;
        exp: number;
      };
    }
    interface User extends IUser {}
  }
}

export {};
