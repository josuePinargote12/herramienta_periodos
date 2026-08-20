// Service del cierre anual del Impuesto a la Renta.
// Coordina clientes, configuración y declaración anual, aplicando las reglas
// de negocio antes de llamar al modelo que ejecuta SQL.
import * as clientModel from '../models/client.model.js';
import * as incomeTaxModel from '../models/incomeTax.model.js';
import * as annualTaxModel from '../models/annualTax.model.js';
import * as documentModel from '../models/document.model.js';

type AnnualTaxData = Awaited<ReturnType<typeof annualTaxModel.findByClientYear>>;

// Obtiene el noveno dígito del RUC y calcula el vencimiento de abril del año siguiente.
// El calendario se mantiene en esta función para poder reemplazarlo por una tabla
// tributaria cuando existan calendarios especiales del SRI.
function calculateDueDate(fiscalYear: number, ruc: string) {
  const digits = String(ruc || '').replace(/\D/g, '');
  const ninthDigit = Number(digits.length >= 2 ? digits[digits.length - 2] : digits.slice(-1));
  const deadlineByDigit: Record<number, number> = {
    1: 10, 2: 12, 3: 14, 4: 16, 5: 18,
    6: 20, 7: 22, 8: 24, 9: 26, 0: 28
  };
  const day = deadlineByDigit[ninthDigit] || 28;
  return `${fiscalYear + 1}-04-${String(day).padStart(2, '0')}`;
}

async function getContext(clientId: string, fiscalYear: string, userCode: number) {
  const client: any = await clientModel.findById(clientId, userCode);
  if (!client) throw new Error('Cliente no encontrado');

  const configuration: any = await incomeTaxModel.find(clientId, fiscalYear, userCode);
  if (!configuration) throw new Error('No existe configuración de impuesto para este año');

  return { client, configuration };
}

// Crea la declaración anual una sola vez y la deja acumulando.
export async function ensureAnnualDeclaration(clientId: string, fiscalYear: string, userCode: number): Promise<AnnualTaxData> {
  const { configuration } = await getContext(clientId, fiscalYear, userCode);
  const existing = await annualTaxModel.findByClientYear(clientId, fiscalYear, userCode);
  if (existing) return existing;

  const created = await annualTaxModel.create(
    clientId,
    fiscalYear,
    String(configuration.id),
    Number(configuration.rate || 0),
    userCode
  );
  if (!created) throw new Error('No se pudo crear la declaración anual');
  return created;
}

// Devuelve la declaración anual junto con la base viva acumulada de los meses.
export async function getAnnualSummary(clientId: string, fiscalYear: string, userCode: number) {
  const { configuration } = await getContext(clientId, fiscalYear, userCode);
  const declaration = await annualTaxModel.findByClientYear(clientId, fiscalYear, userCode);
  const base = await annualTaxModel.getAccumulatedBase(clientId, fiscalYear, userCode);
  return { declaration, configuration, base, accumulatedBase: base.total };
}

// Congela la base y calcula el impuesto. Solo puede ejecutarse mientras el año
// está acumulando; después el resultado histórico no se recalcula automáticamente.
export async function closeAnnualDeclaration(clientId: string, fiscalYear: string, userCode: number, form101?: Express.Multer.File): Promise<AnnualTaxData> {
  const { client, configuration } = await getContext(clientId, fiscalYear, userCode);
  if (!['Anual', 'Annual'].includes(String(configuration.periodicity))) throw new Error('El cierre anual solo aplica a configuraciones con periodicidad anual');
  const rate = Number(configuration.rate || 0);
  if (!Number.isFinite(rate) || rate < 0) throw new Error('El porcentaje configurado no es válido');
  const declaration = await ensureAnnualDeclaration(clientId, fiscalYear, userCode);
  if (declaration.status !== 'acumulando') throw new Error('La declaración anual ya fue cerrada');

  const base = await annualTaxModel.getAccumulatedBase(clientId, fiscalYear, userCode);
  const calculatedTax = Number((base.total * rate / 100).toFixed(2));
  const dueDate = calculateDueDate(Number(fiscalYear), String(client.ruc || ''));

  const affectedRows = await annualTaxModel.close(String(declaration.id), base.total, calculatedTax, dueDate, userCode);
  if (affectedRows !== 1) throw new Error('La declaración anual ya fue cerrada o no pertenece al usuario');
  if (form101) {
    const periodId = await annualTaxModel.findFirstPeriod(clientId, fiscalYear, userCode);
    if (!periodId) throw new Error('No existe un periodo contable para asociar el Formulario 101');
    const document = await documentModel.create(String(periodId), 'Income Tax', 'form101', form101, userCode);
    await annualTaxModel.attachDocument(String(declaration.id), String(document.id), userCode);
  }
  const closed = await annualTaxModel.findByClientYear(clientId, fiscalYear, userCode);
  if (!closed) throw new Error('No se pudo consultar el cierre anual');
  return closed;
}

// Presenta el Formulario 101 únicamente después de cerrar el año.
export async function presentAnnualDeclaration(declarationId: string, form101: Express.Multer.File | undefined, userCode: number) {
  if (!form101) throw new Error('El Formulario 101 es obligatorio');
  const declaration: any = await annualTaxModel.findById(declarationId, userCode);
  if (!declaration || declaration.status !== 'calculada') throw new Error('La declaración debe estar calculada antes de presentar el Formulario 101');
  const periodId = await annualTaxModel.findFirstPeriod(String(declaration.clientId), String(declaration.fiscalYear), userCode);
  if (!periodId) throw new Error('No existe un periodo contable para asociar el Formulario 101');
  const document = await documentModel.create(String(periodId), 'Income Tax', 'form101', form101, userCode);
  const affectedRows = await annualTaxModel.attachDocument(declarationId, String(document.id), userCode);
  if (affectedRows !== 1) throw new Error('No se pudo presentar el Formulario 101');
}

export async function getAnnualDeclarationById(declarationId: string, userCode: number) {
  return annualTaxModel.findById(declarationId, userCode);
}

// Registra el pago únicamente cuando la declaración ya fue presentada.
export async function payAnnualDeclaration(declarationId: string, paidAmount: number, paymentDate: string, userCode: number) {
  if (!Number.isFinite(paidAmount) || paidAmount < 0) throw new Error('El valor pagado no es válido');
  if (!paymentDate) throw new Error('La fecha de pago es obligatoria');
  const affectedRows = await annualTaxModel.registerPayment(declarationId, paidAmount, paymentDate, userCode);
  if (affectedRows !== 1) throw new Error('La declaración debe estar presentada antes de registrar el pago');
}
