// types.d.ts or global.d.ts (ensure TypeScript picks this up globally)

import * as express from 'express';
declare global {
  namespace Express {
    interface MulterFile {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
      destination?: string; // Optional
      filename?: string;    // Optional
      path?: string;        // Optional
    }

    interface Request {
      file?: MulterFile;
      user?: any
    }
  }
}



