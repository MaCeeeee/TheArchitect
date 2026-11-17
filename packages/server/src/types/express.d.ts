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
      authMethod?: 'jwt' | 'api_key';
      /**
       * Security-Audit H12: Scope des API-Keys. Fehlt bei JWT und bei Keys
       * ohne Scope (leere Liste = Rechte des Besitzers, so legt die UI sie an).
       */
      apiKeyScope?: string[];
    }
    interface User extends IUser {}
  }
}

export {};
