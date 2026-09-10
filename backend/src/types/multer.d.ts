import type { FileTypeResult } from 'file-type';

declare global {
  namespace Express {
    namespace Multer {
      interface File {
        safeName?: string;
        detectedType?: FileTypeResult;
      }
    }
  }
}

export {};
