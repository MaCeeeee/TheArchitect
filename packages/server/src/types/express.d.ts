/* eslint-disable @typescript-eslint/no-empty-interface */
import { IUser } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      jwtPayload?: {
        userId: string;
        role: string;
        type: 'access' | 'refresh';
        /** Session-Id (THE-535) — fehlt bei API-Keys und Alt-Tokens von vor dem Deploy. */
        sid?: string;
        iat: number;
        exp: number;
      };
    }
    interface User extends IUser {}
  }
}

export {};
