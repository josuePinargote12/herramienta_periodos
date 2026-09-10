export const UPLOAD_TYPES = {
  excel: {
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      // file-type identifica los contenedores OOXML como ZIP y los XLS como CFB.
      'application/zip',
      'application/x-cfb'
    ],
    allowedExtensions: ['.xlsx', '.xls'],
    blockedExtensions: /\.(xlsm|xlsb|exe|bat|sh|js|php|html)$/i,
    maxSizeMb: 15
  },
  pdf: {
    allowedMimeTypes: ['application/pdf'],
    allowedExtensions: ['.pdf'],
    blockedExtensions: /\.(xlsm|xlsb|exe|bat|sh|js|php|html)$/i,
    maxSizeMb: 15
  }
} as const;

export type UploadTypeKey = keyof typeof UPLOAD_TYPES;
