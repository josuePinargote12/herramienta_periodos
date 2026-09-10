/**
 * Validación segura de archivos subidos.
 * Primero trabaja en memoria; solo después de validar el contenido escribe el
 * archivo en storage/accounting con un nombre aleatorio y seguro.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { fileTypeFromBuffer, type FileTypeResult } from 'file-type';
import { UPLOAD_TYPES, type UploadTypeKey } from '../config/uploadTypes.js';

const storageDir = path.resolve('storage/accounting');

// Envía un error uniforme al frontend sin exponer detalles internos.
function reject(res: Response, message: string, status = 400) {
  return res.status(status).json({ ok: false, error: message });
}

function filesFromRequest(req: Request): Express.Multer.File[] {
  // Normaliza req.file, req.files como array y req.files como objeto por campo.
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files) Object.values(req.files).forEach(list => files.push(...list));
  return files;
}

function hasFiles(req: Request) {
  // Se usa en rutas donde reemplazar el archivo es opcional.
  return Boolean(req.file) || (Array.isArray(req.files) ? req.files.length > 0 : Boolean(req.files && Object.values(req.files).some(list => list.length > 0)));
}

function canonicalExtension(typeKey: UploadTypeKey, originalName: string, detected: FileTypeResult) {
  // El nombre final nunca conserva la ruta original ni el nombre enviado por
  // el usuario; solo conserva una extensión compatible con el contenido real.
  if (typeKey === 'pdf') return '.pdf';
  const originalExtension = path.extname(originalName).toLowerCase();
  // ZIP is the container used by XLSX and CFB is the container used by XLS.
  return originalExtension === '.xls' && detected.mime === 'application/x-cfb' ? '.xls' : '.xlsx';
}

async function validateOne(file: Express.Multer.File, typeKey: UploadTypeKey) {
  // Valida tamaño, extensión declarada y firma binaria antes de persistir.
  const config = UPLOAD_TYPES[typeKey];
  const originalName = String(file.originalname || '');
  const extension = path.extname(originalName).toLowerCase();
  if (!file.buffer?.length) throw new Error('El archivo está vacío o no pudo ser leído');
  if (file.size > config.maxSizeMb * 1024 * 1024) throw new Error(`El archivo supera el máximo permitido de ${config.maxSizeMb} MB`);
  if (config.blockedExtensions.test(originalName) || !config.allowedExtensions.includes(extension as never)) throw new Error('La extensión del archivo no está permitida');

  // fileTypeFromBuffer analiza magic bytes y no confía en file.mimetype.
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !config.allowedMimeTypes.includes(detected.mime as never)) throw new Error('El contenido real del archivo no coincide con el tipo permitido');
  if (typeKey === 'excel' && detected.mime === 'application/zip') {
    const zipHeader = file.buffer.toString('latin1');
    if (!zipHeader.includes('[Content_Types].xml') || !zipHeader.includes('xl/')) throw new Error('El ZIP no contiene una estructura válida de Excel');
  }
  file.detectedType = detected;
  // Desde este punto los parsers y el modelo reciben el tipo detectado, nunca el declarado por el cliente.
  file.mimetype = detected.mime;
  file.safeName = `${crypto.randomUUID()}${canonicalExtension(typeKey, originalName, detected)}`;
}

async function validateFiles(req: Request, res: Response, next: NextFunction, typeKey: UploadTypeKey) {
  // Aplica la misma validación a uno o varios archivos.
  const files = filesFromRequest(req);
  if (!files.length) return reject(res, 'Debes adjuntar un archivo');
  try {
    for (const file of files) await validateOne(file, typeKey);
    return next();
  } catch (error) {
    return reject(res, error instanceof Error ? error.message : 'El archivo no es válido', 422);
  }
}

export function validateFile(typeKey: UploadTypeKey) {
  // Middleware para rutas con un archivo de tipo conocido.
  return (req: Request, res: Response, next: NextFunction) => validateFiles(req, res, next, typeKey);
}

export function validateUploadedFiles(typeKey: UploadTypeKey) {
  // Alias semántico usado por rutas que reciben fields o arrays de Multer.
  return (req: Request, res: Response, next: NextFunction) => validateFiles(req, res, next, typeKey);
}

export function validateAnyUploadedFiles() {
  // Acepta Excel o PDF y prueba ambos perfiles de seguridad.
  return async (req: Request, res: Response, next: NextFunction) => {
    const files = filesFromRequest(req);
    if (!files.length) return reject(res, 'Debes adjuntar un archivo');
    try {
      for (const file of files) {
        let lastError: unknown;
        for (const typeKey of ['excel', 'pdf'] as const) {
          try {
            await validateOne(file, typeKey);
            lastError = undefined;
            break;
          } catch (error) { lastError = error; }
        }
        if (lastError) throw lastError;
      }
      return next();
    } catch (error) {
      return reject(res, error instanceof Error ? error.message : 'El archivo no es válido', 422);
    }
  };
}

export function validateOptionalUploadedFiles(typeKey?: UploadTypeKey) {
  // Igual que la validación normal, pero permite continuar si no se envió un
  // archivo porque algunas rutas permiten conservar el documento existente.
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasFiles(req)) return next();
    return typeKey ? validateFiles(req, res, next, typeKey) : validateAnyUploadedFiles()(req, res, next);
  };
}

export function persistValidatedFiles() {
  // Escribe únicamente archivos que ya tienen safeName y buffer validados.
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = filesFromRequest(req);
      await fs.mkdir(storageDir, { recursive: true });
      for (const file of files) {
        if (!file.safeName || !file.buffer) throw new Error('El archivo no fue validado');
        const absolutePath = path.join(storageDir, file.safeName);
        await fs.writeFile(absolutePath, file.buffer);
        file.filename = file.safeName;
        file.path = absolutePath;
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
