// Service del cierre anual del Impuesto a la Renta.
// Coordina clientes, configuración y declaración anual, aplicando las reglas
// de negocio antes de llamar al modelo que ejecuta SQL.
import * as clientModel from '../models/client.model.js';
import * as incomeTaxModel from '../models/incomeTax.model.js';
import * as annualTaxModel from '../models/annualTax.model.js';
import * as documentModel from '../models/document.model.js';
import * as declarationModel from '../models/declaration.model.js';

type AnnualTaxData = Awaited<ReturnType<typeof annualTaxModel.findByClientYear>>;

const NATURAL_TABLE_2026 = [
  [0, 12208, 0, 0], [12208, 15549, 0, 5], [15549, 20188, 167, 10],
  [20188, 26700, 631, 12], [26700, 35136, 1412, 15], [35136, 46575, 2678, 20],
  [46575, 62005, 4965, 25], [62005, 82679, 8823, 30], [82679, 109956, 15025, 35], [109956, Infinity, 24572, 37]
] as const;
const RIMPE_TABLE = [[20000, 50000, 60, 1], [50000, 75000, 360, 1.25], [75000, 100000, 672.5, 1.5], [100000, 200000, 1047.5, 1.75], [200000, 300000, 2797.52, 2]] as const;

function calculateNaturalTax(base: number) {
  base = Math.max(0, base);
  const row = NATURAL_TABLE_2026.find(item => base >= item[0] && base < item[1]) || NATURAL_TABLE_2026[NATURAL_TABLE_2026.length - 1];
  return Number((row[2] + Math.max(0, base - row[0]) * row[3] / 100).toFixed(2));
}

function calculateRimpeTax(sales: number) {
  const row = RIMPE_TABLE.find(item => sales > item[0] && sales <= item[1]);
  if (!row) return null;
  return Number((row[2] + (sales - row[0]) * row[3] / 100).toFixed(2));
}

export function calculateIncomeTax(configuration: any, base: any) {
  const taxpayer = String(configuration.taxpayer || '').toLowerCase();
  const regime = String(configuration.regime || '').toLowerCase();
  const isNatural = taxpayer.includes('natural');
  const isPopular = regime.includes('negocio popular');
  const isRimpe = regime.includes('rimpe');
  const sales = Number(base.sales || 0);
  const utility = Number(base.utility ?? base.total ?? 0);
  const taxableUtility = Math.max(0, utility);
  if (isRimpe && sales > 300000) {
    const tax = isNatural ? calculateNaturalTax(taxableUtility) : Number((taxableUtility * 25 / 100).toFixed(2));
    return { tax, taxBase: taxableUtility, basis: 'Utilidad acumulada', rule: isNatural ? 'Régimen General · tabla progresiva' : 'Régimen General · tarifa 25%', warning: 'Las ventas superan $300.000; se aplica Régimen General.' };
  }
  if (isPopular) return { tax: 60, taxBase: sales, basis: 'Cuota fija RIMPE Negocio Popular', rule: 'Cuota fija anual · $60' };
  if (isRimpe) {
    const tax = calculateRimpeTax(sales);
    return tax == null
      ? { tax: isNatural ? calculateNaturalTax(taxableUtility) : Number((taxableUtility * 25 / 100).toFixed(2)), taxBase: taxableUtility, basis: 'Utilidad acumulada', rule: 'Régimen General por superar límites', warning: 'Las ventas no están dentro de los rangos RIMPE.' }
      : { tax, taxBase: sales, basis: 'Ventas acumuladas', rule: 'Tabla progresiva RIMPE Emprendedor' };
  }
  if (!isNatural) return { tax: Number((taxableUtility * 25 / 100).toFixed(2)), taxBase: taxableUtility, basis: 'Utilidad acumulada', rule: 'Sociedad · tarifa plana 25%' };
  return { tax: calculateNaturalTax(taxableUtility), taxBase: taxableUtility, basis: 'Utilidad acumulada menos gastos personales', rule: 'Régimen General · tabla progresiva 2026' };
}

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Detalle anual: la columna impuesto representa el incremento del impuesto
// estimado acumulado hasta ese mes (impuesto acumulado actual - mes anterior).
export async function getAnnualDetail(clientId: string, fiscalYear: string, userCode: number) {
  const { client, configuration } = await getContext(clientId, fiscalYear, userCode);
  const annualDeclaration: any = await annualTaxModel.findByClientYear(clientId, fiscalYear, userCode);
  const declarations: any[] = await declarationModel.findByClientYear(clientId, fiscalYear, userCode);
  const byMonth = new Map(declarations.map(row => [Number(row.monthNum), row]));
  let previousTax = 0;
  let accumulatedSales = 0;
  let accumulatedCosts = 0;
  let accumulatedUtility = 0;
  let accumulatedRetentions = 0;
  const months = monthNames.map((name, _index) => {
    const month = monthNames.indexOf(name) + 1;
    const row = byMonth.get(month) || {};
    const sales = Number(row.ivaCosts || 0);
    const employeeExpense = Number(row.employeeExpense || 0);
    const costs = Number(Number(row.ivaValues || 0).toFixed(2));
    const utility = Number((sales - costs - employeeExpense).toFixed(2));
    accumulatedSales += sales;
    accumulatedCosts += costs;
    accumulatedUtility = Number((accumulatedUtility + utility).toFixed(2));
    accumulatedRetentions += Number(row.retentions || 0);
    const calculation = calculateIncomeTax(configuration, { sales: accumulatedSales, costs: accumulatedCosts, utility: accumulatedUtility, retentions: accumulatedRetentions });
    // El importe mensual es la variación del impuesto acumulado. Una pérdida
    // puede reducir la base, pero nunca genera un impuesto negativo.
    const tax = Number(Math.max(0, calculation.tax - previousTax).toFixed(2));
    previousTax = calculation.tax;
    const incomeTaxRetention = Number(row.incomeTaxRetention || 0);
    return { periodId: row.periodId, month, name, iva: Number(row.iva || 0), retentions: Number(row.retentions || 0), incomeTaxRetention, employeeExpense, sales, costs, utility, accumulatedBase: accumulatedUtility, rate: calculation.rule, tax, taxAfterRetentions: Number((tax - incomeTaxRetention).toFixed(2)), taxBase: calculation.taxBase, warning: calculation.warning || null };
  });
  const monthlyTotals = months.reduce((total, row) => ({
    iva: total.iva + Number(row.iva || 0),
    retentions: total.retentions + Number(row.retentions || 0),
    base: Number((total.base + Number(row.utility || 0)).toFixed(2)),
    employeeExpense: total.employeeExpense + Number(row.employeeExpense || 0),
    incomeTaxRetention: total.incomeTaxRetention + Number(row.incomeTaxRetention || 0)
  }), { iva: 0, retentions: 0, base: 0, employeeExpense: 0, incomeTaxRetention: 0 });
  const hasAnnualValues = Boolean(annualDeclaration && !['acumulando', 'accumulating'].includes(String(annualDeclaration.status || '').toLowerCase()) && [annualDeclaration.ivaAccumulated, annualDeclaration.retentionsAccumulated, annualDeclaration.accumulatedBase, annualDeclaration.calculatedTax].some(value => Number(value || 0) !== 0));
  const registeredMonths = months.filter(row => [row.sales, row.costs, row.employeeExpense, row.utility, row.iva, row.retentions, row.incomeTaxRetention].some(value => Number(value || 0) !== 0));
  const finalCalculation = calculateIncomeTax(configuration, { sales: accumulatedSales, costs: accumulatedCosts, utility: accumulatedUtility, retentions: accumulatedRetentions });
  const annualTax = accumulatedUtility <= 0
    ? 0
    : hasAnnualValues ? Number(annualDeclaration.calculatedTax || 0) : Number(finalCalculation.tax || 0);
  const annualTaxPayable = accumulatedUtility <= 0
    ? 0
    : Number(Math.max(0, annualTax - monthlyTotals.incomeTaxRetention).toFixed(2));
  return {
    client: { name: String(client.name || ''), ruc: String(client.ruc || '') },
    configuration,
    fiscalYear: Number(fiscalYear),
    months: registeredMonths,
    annual: {
      sales: accumulatedSales,
      costs: accumulatedCosts,
      employeeExpense: monthlyTotals.employeeExpense,
      taxRetentions: monthlyTotals.incomeTaxRetention,
      utility: accumulatedUtility,
      // El detalle debe reconciliarse con las declaraciones mensuales actuales.
      // Los valores congelados de declaraciones_anuales se reservan para el cierre,
      // pero no deben ocultar correcciones posteriores mientras se revisa el detalle.
      iva: monthlyTotals.iva,
      retentions: monthlyTotals.retentions,
      base: monthlyTotals.base,
      tax: annualTax,
      taxPayable: annualTaxPayable,
      status: annualDeclaration?.status || 'acumulando',
      dueDate: annualDeclaration?.dueDate || null
    }
  };
}

// Obtiene el noveno dígito del RUC y calcula el vencimiento de abril del año siguiente.
// El calendario se mantiene en esta función para poder reemplazarlo por una tabla
// tributaria cuando existan calendarios especiales del SRI.
function calculateDueDate(fiscalYear: number, ruc: string, taxpayer: string) {
  const digits = String(ruc || '').replace(/\D/g, '');
  const ninthDigit = Number(digits.length >= 2 ? digits[digits.length - 2] : digits.slice(-1));
  const deadlineByDigit: Record<number, number> = {
    1: 10, 2: 12, 3: 14, 4: 16, 5: 18,
    6: 20, 7: 22, 8: 24, 9: 26, 0: 28
  };
  const day = deadlineByDigit[ninthDigit] || 28;
  const normalizedTaxpayer = String(taxpayer || '').toLowerCase();
  const month = normalizedTaxpayer.includes('natural') ? '03' : '04';
  return `${fiscalYear + 1}-${month}-${String(day).padStart(2, '0')}`;
}

async function getContext(clientId: string, fiscalYear: string, userCode: number) {
  const client: any = await clientModel.findById(clientId, userCode);
  if (!client) throw new Error('Cliente no encontrado');

  const savedConfiguration: any = await incomeTaxModel.find(clientId, fiscalYear, userCode);
  const configuration: any = {
    ...(savedConfiguration || {}),
    taxpayer: savedConfiguration?.taxpayer || client.taxpayerType || 'Sociedad',
    regime: savedConfiguration?.regime || client.taxRegime || 'Régimen general',
    accounting: savedConfiguration?.accounting || client.accounting || 'Yes',
    rate: savedConfiguration?.rate ?? 25,
    periodicity: savedConfiguration?.periodicity || 'Anual',
    enabled: savedConfiguration?.enabled ?? true
  };
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
    configuration.id ? String(configuration.id) : null,
    Number(configuration.rate || 0),
    userCode
  );
  if (!created) throw new Error('No se pudo crear la declaración anual');
  return created;
}

// Devuelve la declaración anual junto con la base viva acumulada de los meses.
export async function getAnnualSummary(clientId: string, fiscalYear: string, userCode: number, maxMonth?: number, monthly = false) {
  const { configuration } = await getContext(clientId, fiscalYear, userCode);
  const declaration = await annualTaxModel.findByClientYear(clientId, fiscalYear, userCode);
  const base = monthly && maxMonth
    ? await annualTaxModel.getMonthlyBase(clientId, fiscalYear, maxMonth, userCode)
    : await annualTaxModel.getAccumulatedBase(clientId, fiscalYear, userCode, maxMonth);
  const calculation = calculateIncomeTax(configuration, base);
  const taxPayable = Number(Math.max(0, Number(calculation.tax || 0) - Number(base.retentions || 0)).toFixed(2));
  return { declaration, configuration, base, accumulatedBase: base.total, calculation: { ...calculation, taxPayable } };
}

// Calcula y congela el acumulado vigente del Módulo 5 sin calcular todavía
// el Impuesto a la Renta.
export async function accumulateAnnualBase(clientId: string, fiscalYear: string, userCode: number, maxMonth?: number) {
  const client: any = await clientModel.findById(clientId, userCode);
  if (!client) throw new Error('Cliente no encontrado');
  const existing = await annualTaxModel.findByClientYear(clientId, fiscalYear, userCode);
  const declaration = existing || await annualTaxModel.create(clientId, fiscalYear, null, 0, userCode);
  if (!declaration) throw new Error('No se pudo crear el registro de acumulación anual');
  if (declaration.status !== 'acumulando') throw new Error('El acumulado ya fue cerrado y no puede modificarse');
  const base = await annualTaxModel.getAccumulatedBase(clientId, fiscalYear, userCode, maxMonth);
  const affectedRows = await annualTaxModel.saveAccumulated(
    String(declaration.id),
    base.iva,
    base.retentions,
    base.total,
    userCode
  );
  if (affectedRows !== 1) throw new Error('No se pudo guardar el acumulado anual');
  return annualTaxModel.findByClientYear(clientId, fiscalYear, userCode);
}

// Congela la base y calcula el impuesto. Solo puede ejecutarse mientras el año
// está acumulando; después el resultado histórico no se recalcula automáticamente.
export async function closeAnnualDeclaration(clientId: string, fiscalYear: string, userCode: number, form101?: Express.Multer.File): Promise<AnnualTaxData> {
  const { client, configuration } = await getContext(clientId, fiscalYear, userCode);
  if (!['Anual', 'Annual'].includes(String(configuration.periodicity))) throw new Error('El cierre anual solo aplica a configuraciones con periodicidad anual');
  const declaration = await ensureAnnualDeclaration(clientId, fiscalYear, userCode);
  if (declaration.status !== 'acumulando') throw new Error('La declaración anual ya fue cerrada');

  const base = await annualTaxModel.getAccumulatedBase(clientId, fiscalYear, userCode);
  const calculation = calculateIncomeTax(configuration, base);
  const calculatedTax = calculation.tax;
  const dueDate = calculateDueDate(Number(fiscalYear), String(client.ruc || ''), String(configuration.taxpayer || client.taxpayerType || ''));

  const affectedRows = await annualTaxModel.close(String(declaration.id), calculation.taxBase, calculatedTax, dueDate, userCode);
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
