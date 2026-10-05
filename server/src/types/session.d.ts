// Extend express-session's SessionData interface to include userId
// This eliminates the need for type casting in every route

import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}
