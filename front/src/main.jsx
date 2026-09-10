// Punto de entrada del frontend: contiene la interfaz, el formulario de login,
// las llamadas al backend y las vistas principales de ContaMatic.
import React, { Fragment, useMemo, useState, useEffect, useRef, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './styles.css';
import './retentionTable.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import api, { getCsrfToken } from './api/client.js';

async function openProtectedDocument(periodId, documentId) {
  const response = await api.get(`/periods/${periodId}/documents/${documentId}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Compatibilidad con la vista histórica de declaraciones.
const CLIENTS_ONLY_MODE = true;
const WORKFLOW_STEPS = [
  ['estados', 'Estados financieros'], ['cxc', 'CxC / CxP'], ['declaraciones', 'Declaraciones mensuales'],
  ['completado', 'Periodo completado'], ['compartir', 'Compartir documentación']
];
// Compartir documentación no forma parte del avance del periodo.
WORKFLOW_STEPS.splice(4, 1);
WORKFLOW_STEPS[3][1] = 'Documentación completa';
const WORKFLOW_CONTEXT = createContext(null);

function WorkflowTimeline({ client, year, compact = false, showAction = true, showTimeline = true, onPersistStep, onPersistSelection, onCompletePeriod, onClose }) {
  const workflow = useContext(WORKFLOW_CONTEXT);
  const activeStepRef = useRef(null);
  const [localCompleted, setLocalCompleted] = useState(new Set(['cliente']));
  const [localActive, setLocalActive] = useState('estados');
  const [localYear, setLocalYear] = useState(String(year));
  const [localMonth, setLocalMonth] = useState('Enero');
  const [localFiles, setLocalFiles] = useState({});
  const [existingDocuments, setExistingDocuments] = useState({});
  const [existingDeclaration, setExistingDeclaration] = useState(null);
  const [parsedIvaDeclaration, setParsedIvaDeclaration] = useState(null);
  const [parsedRetentionDeclaration, setParsedRetentionDeclaration] = useState(null);
  const [financialPreviews, setFinancialPreviews] = useState({});
  const [financialManual, setFinancialManual] = useState({});
  const [activePeriodId, setActivePeriodId] = useState(null);
  const [portfolioPreview, setPortfolioPreview] = useState({});
  const [portfolioManual, setPortfolioManual] = useState({});
  const [taxPreview, setTaxPreview] = useState(null);
  const [userHasChanges, setUserHasChanges] = useState(false);
  const completed = workflow?.completed ?? localCompleted;
  const setCompleted = workflow?.setCompleted ?? setLocalCompleted;
  const active = workflow?.active ?? localActive;
  const setActive = workflow?.setActive ?? setLocalActive;
  const selectedYear = workflow?.selectedYear ?? localYear;
  const setSelectedYear = workflow?.setSelectedYear ?? setLocalYear;
  const selectedMonth = workflow?.selectedMonth ?? localMonth;
  const setSelectedMonth = workflow?.setSelectedMonth ?? setLocalMonth;
  const files = workflow?.files ?? localFiles;
  const setFiles = workflow?.setFiles ?? setLocalFiles;
  const index = WORKFLOW_STEPS.findIndex(([id]) => !completed.has(id));
  const lastAvailableIndex = index < 0 ? WORKFLOW_STEPS.length - 1 : index;
  const activeIndex = WORKFLOW_STEPS.findIndex(([id]) => id === active);
  const current = WORKFLOW_STEPS[index] || WORKFLOW_STEPS.at(-1);
  const activeLabel = WORKFLOW_STEPS.find(([id]) => id === active)?.[1] || current[1];
  useEffect(() => {
    if (!compact || !activeStepRef.current) return;
    activeStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [compact, active]);
  useEffect(() => {
    if (active !== 'completado') return;
    const button = document.querySelector('.workflow-timeline-action > button.primary');
    if (button) button.textContent = 'Revisar información';
  }, [active]);
  const process = new Set(['estados', 'cxc', 'declaraciones']);
  const requirements = active === 'estados'
    ? ['balance', 'results', 'equity', 'cashflow', 'notes']
    : active === 'cxc' ? ['receivable', 'payable']
    : active === 'declaraciones' ? ['iva'] : [];
  // Estados financieros es un avance informativo: puede continuar sin adjuntos.
  // Los demás avances conservan la validación de sus documentos requeridos.
  // CxC/CxP es un paso opcional: puede continuar con ambos, uno o ningún archivo.
  const ready = active === 'estados' || active === 'cxc' || requirements.every(key => files[key] || existingDocuments[key]);
  const hasDeclarationChanges = active === 'declaraciones' && Boolean(existingDeclaration) && (
    String(workflow?.ivaValue ?? existingDeclaration.iva ?? '') !== String(existingDeclaration.iva ?? '')
    || String(workflow?.retentionValue ?? existingDeclaration.retentions ?? '') !== String(existingDeclaration.retentions ?? '')
    || String(workflow?.employeeExpense ?? existingDeclaration.employeeExpense ?? 0) !== String(existingDeclaration.employeeExpense ?? 0)
  );
  const hasChanges = userHasChanges && (Object.keys(files).length > 0 || hasDeclarationChanges);
  useEffect(() => {
    let cancelled = false;
    if (active !== 'renta' || !client?.id) { setTaxPreview(null); return undefined; }
    setTaxPreview({ loading: true });
    const monthNumber = MONTHS.findIndex(item => item.name === selectedMonth) + 1;
    api.get(`/clients/${client.id}/annual-tax/${selectedYear}`, { params: { month: monthNumber } })
      .then(({ data }) => { if (!cancelled) setTaxPreview(data.data || {}); })
      .catch(() => { if (!cancelled) setTaxPreview({ error: 'No se pudo cargar el cálculo tributario.' }); });
    return () => { cancelled = true; };
  }, [active, client?.id, selectedYear, selectedMonth]);
  useEffect(() => {
    const action = document.querySelector('.workflow-timeline-action');
    if (!action || active !== 'renta') return undefined;
    action.querySelector('.workflow-tax-preview')?.remove();
    const box = document.createElement('section');
    box.className = 'workflow-tax-preview';
    const config = taxPreview?.configuration || {};
    const base = taxPreview?.base || {};
    const calculation = taxPreview?.calculation || {};
    const money = value => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    box.innerHTML = taxPreview?.loading ? '<strong>Cargando cálculo tributario...</strong>' : taxPreview?.error ? `<strong>${taxPreview.error}</strong>` : `<div class="workflow-tax-title">Cálculo del impuesto causado</div><div class="workflow-tax-config"><span><small>Contribuyente</small><b>${config.taxpayer || '—'}</b></span><span><small>Régimen</small><b>${config.regime || '—'}</b></span><span><small>Contabilidad</small><b>${config.accounting === 'No' ? 'No obligado' : 'Obligado'}</b></span></div><div class="workflow-tax-values"><span><small>Ventas acumuladas</small><b>${money(base.sales)}</b></span><span><small>Costos y gastos</small><b>${money(base.costs)}</b></span><span><small>Utilidad acumulada</small><b>${money(base.utility)}</b></span><span class="workflow-tax-result"><small>Impuesto causado</small><b>${money(calculation.tax)}</b></span></div><p class="workflow-tax-rule"><strong>Regla aplicada:</strong> ${calculation.rule || 'Pendiente de cálculo'}<br><strong>Base:</strong> ${calculation.basis || '—'} · ${money(calculation.taxBase)}</p>${calculation.warning ? `<div class="workflow-tax-warning">⚠ ${calculation.warning}</div>` : ''}`;
    Object.assign(box.style, { margin: '16px 0', padding: '16px', border: '1px solid #dbe3ef', borderLeft: '5px solid #252566', borderRadius: '10px', background: '#f8fafc', color: '#26364a' });
    if (!taxPreview?.loading && !taxPreview?.error) {
      const taxpayer = String(config.taxpayer || '').toLowerCase();
      const regime = String(config.regime || '').toLowerCase();
      const isNatural = taxpayer.includes('natural');
      const isRimpe = regime.includes('rimpe');
      const sales = Number(base.sales || 0);
      const costs = Number(base.costs || 0);
      const utility = Number(base.utility || 0);
      const taxBase = Number(calculation.taxBase || 0);
      const tax = Number(calculation.tax || 0);
      const excess = Math.max(0, taxBase - 109956);
      const formula = isRimpe && sales <= 300000
        ? `${money(sales)} × tarifa progresiva RIMPE`
        : isNatural
          ? `$24,572.00 + (${money(taxBase)} − $109,956.00) × 37%`
          : `${money(taxBase)} × 25%`;
      box.innerHTML = `<div class="workflow-tax-title">Cálculo del impuesto causado</div><div class="workflow-tax-config"><span><small>Contribuyente</small><b>${config.taxpayer || '—'}</b></span><span><small>Régimen</small><b>${config.regime || '—'}</b></span><span><small>Contabilidad</small><b>${config.accounting === 'No' ? 'No obligado' : 'Obligado'}</b></span><span><small>Periodo</small><b>${selectedYear}</b></span></div><div class="workflow-tax-values"><span><small>Ventas acumuladas</small><b>${money(sales)}</b></span><span><small>Costos y gastos</small><b>${money(costs)}</b></span><span><small>Utilidad acumulada</small><b>${money(utility)}</b></span><span class="workflow-tax-result"><small>Impuesto causado</small><b>${money(tax)}</b></span></div><div class="workflow-tax-formula"><small>Fórmula aplicada</small><strong>${formula}</strong></div><details class="workflow-tax-details" open><summary>Ver cálculo paso a paso</summary><div><p><b>1. Datos de origen:</b> ${money(sales)} de ventas − ${money(costs)} de costos = <strong>${money(utility)} de utilidad.</strong></p><p><b>2. Base tributaria:</b> ${calculation.basis || 'Base definida por la configuración'} = <strong>${money(taxBase)}.</strong></p><p><b>3. Impuesto causado:</b> <strong>${money(tax)}.</strong> ${isNatural && !isRimpe ? `Excedente sobre $109,956: ${money(excess)} × 37%, más impuesto de fracción básica de $24,572.` : calculation.rule || ''}</p></div></details>${calculation.warning ? `<div class="workflow-tax-warning">⚠ ${calculation.warning}</div>` : ''}`;
    }
    if (!taxPreview?.loading && !taxPreview?.error) {
      box.innerHTML = box.innerHTML
        .replaceAll('Ventas acumuladas', 'Ventas del mes')
        .replaceAll('Costos y gastos', 'Costos y gastos del mes')
        .replaceAll('Utilidad acumulada', 'Utilidad del mes')
        .replaceAll('Utilidad del mes menos gastos personales', 'Utilidad del mes sin gastos personales')
        .replaceAll('Impuesto causado', 'Impuesto anual estimado');
      const taxNote = document.createElement('p');
      taxNote.textContent = 'Referencia: tabla anual del SRI aplicada sobre la utilidad de este mes. No incluye gastos personales.';
      taxNote.style.cssText = 'margin:10px 0 0;color:#68758b;font-size:11px;line-height:1.4';
      box.querySelector('.workflow-tax-formula')?.appendChild(taxNote);
      const periodLabel = document.createElement('span');
      periodLabel.innerHTML = `<small>Periodo calculado</small><b>${selectedMonth} ${selectedYear}</b>`;
      box.querySelector('.workflow-tax-config')?.appendChild(periodLabel);
    }
    box.querySelector('.workflow-tax-title')?.style.setProperty('font-size', '17px');
    box.querySelector('.workflow-tax-title')?.style.setProperty('font-weight', '800');
    box.querySelectorAll('.workflow-tax-config,.workflow-tax-values').forEach(row => Object.assign(row.style, { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginTop: '12px' }));
    box.querySelectorAll('small').forEach(label => { label.style.display = 'block'; label.style.fontSize = '11px'; label.style.color = '#68758b'; });
    box.querySelectorAll('b').forEach(value => { value.style.display = 'block'; value.style.marginTop = '3px'; value.style.fontSize = '14px'; });
    box.querySelector('.workflow-tax-result')?.style.setProperty('color', '#16885b');
    box.querySelector('.workflow-tax-warning')?.style.setProperty('color', '#a16207');
    box.querySelector('.workflow-tax-formula')?.style.setProperty('margin-top', '14px');
    box.querySelector('.workflow-tax-formula')?.style.setProperty('padding', '10px 12px');
    box.querySelector('.workflow-tax-formula')?.style.setProperty('background', '#eef4ff');
    box.querySelector('.workflow-tax-formula')?.style.setProperty('border-radius', '7px');
    box.querySelector('.workflow-tax-formula strong')?.style.setProperty('display', 'block');
    box.querySelector('.workflow-tax-details')?.style.setProperty('margin-top', '12px');
    box.querySelector('.workflow-tax-details summary')?.style.setProperty('cursor', 'pointer');
    box.querySelector('.workflow-tax-details summary')?.style.setProperty('font-weight', '800');
    box.querySelectorAll('.workflow-tax-details p').forEach(item => { item.style.margin = '8px 0'; item.style.lineHeight = '1.4'; });
    action.querySelector('button.primary')?.before(box);
    return () => box.remove();
  }, [active, taxPreview, selectedMonth, selectedYear]);
  useEffect(() => {
    let cancelled = false;
    const loadSavedStep = async () => {
      if (!client?.id || !['estados', 'cxc', 'declaraciones'].includes(active)) return;
      try {
        const periodsResponse = await api.get('/periods', { params: { clientId: client.id, year: String(selectedYear) } });
        const period = (periodsResponse.data.data || []).find(item => String(item.month) === String(selectedMonth));
        if (!period) return;
        setActivePeriodId(period.id);
        const documentsResponse = await api.get(`/periods/${period.id}/documents`);
        const latest = {};
        (documentsResponse.data.data || []).forEach(document => {
          const key = active === 'cxc'
            ? (['CXC', 'receivable'].includes(document.documentType) ? 'receivable' : ['CXP', 'payable'].includes(document.documentType) ? 'payable' : document.documentType)
            : document.documentType;
          if (!latest[key] || Number(document.version) > Number(latest[key].version)) latest[key] = document;
        });
        const declarationResponse = active === 'declaraciones'
          ? await api.get(`/periods/${period.id}/declaration`).catch(() => ({ data: { data: null } }))
          : { data: { data: null } };
        if (!cancelled) {
          const declaration = declarationResponse.data.data || null;
          setExistingDocuments(latest);
          setExistingDeclaration(declaration);
          setParsedIvaDeclaration(null);
          setParsedRetentionDeclaration(null);
          setFiles({});
          setUserHasChanges(false);
          if (active === 'declaraciones' && declaration) {
            workflow?.setIvaValue?.(String(declaration.iva ?? ''));
            workflow?.setRetentionValue?.(String(declaration.retentions ?? ''));
            workflow?.setEmployeeExpense?.(String(declaration.employeeExpense ?? 0));
          }
        }
      } catch {
        if (!cancelled) { setExistingDocuments({}); setExistingDeclaration(null); }
      }
    };
    void loadSavedStep();
    return () => { cancelled = true; };
  }, [client?.id, selectedYear, selectedMonth, active]);
  const complete = async () => {
    if (process.has(active) && !ready) return;
    // La validación de datos extraídos queda archivada: el informe incorpora los documentos originales.
    if (false && active === 'estados') {
      const manualFields = {
        balance: ['total_activos', 'total_pasivos', 'patrimonio'],
        results: ['ingresos_periodo', 'costos_gastos_operativos', 'utilidad_antes_participacion_impuestos']
      };
      for (const [type, fields] of Object.entries(manualFields)) {
        if (!files[type] || !financialPreviews[type]?.error) continue;
        const missing = fields.some(field => financialManual[type]?.[field] == null || !Number.isFinite(Number(financialManual[type][field])));
        if (missing) {
          alert('Completa todos los datos manuales del documento antes de continuar. Si el valor es cero, ingresa 0.');
          return;
        }
      }
    }
    const hasNewFiles = hasChanges;
    // Si el paso ya tiene todos sus documentos guardados y no se seleccionó
    // ningún archivo nuevo, solo se continúa sin crear otra versión.
    if (process.has(active) && !hasNewFiles && ready && active !== 'cxc') {
      setCompleted(value => new Set([...value, active]));
      const next = WORKFLOW_STEPS[activeIndex + 1];
      if (next) setActive(next[0]);
      return;
    }
    if (active === 'completado') {
      if (onPersistStep && !(await onPersistStep(active, files, selectedYear, selectedMonth))) return;
      setCompleted(value => new Set([...value, active]));
      onCompletePeriod?.();
      return;
    }
    if (completed.has(active)) {
      if (process.has(active) && onPersistStep && !(await onPersistStep(active, files, selectedYear, selectedMonth, financialManual, portfolioManual))) return;
      setActive(current[0]);
      setFiles({});
      return;
    }
    if (active === 'mes' && onPersistSelection && !(await onPersistSelection(selectedYear, selectedMonth))) return;
    if (onPersistStep && process.has(active) && !(await onPersistStep(active, files, selectedYear, selectedMonth, financialManual, portfolioManual))) return;
    setCompleted(value => new Set([...value, active]));
    const next = WORKFLOW_STEPS[activeIndex + 1];
    if (next) setActive(next[0]);
    setFiles({});
  };
  const continueWithoutSaving = () => {
    setCompleted(value => new Set([...value, active]));
    const next = WORKFLOW_STEPS[activeIndex + 1];
    if (next) setActive(next[0]);
    setFiles({});
  };
  const setFile = async (key, file) => {
    setFiles(value => ({ ...value, [key]: file }));
    setUserHasChanges(true);
    if (!file || !workflow) return;
    if (false && active === 'estados' && (key === 'balance' || key === 'results')) {
      const formData = new FormData(); formData.append('file', file);
      try { const { data } = await api.post(`/periods/financial-statements/parse?type=${key}`, formData); const parsed = data.data || {}; const recognized = Object.values(parsed).some(value => value != null); setFinancialPreviews(value => ({ ...value, [key]: recognized ? parsed : { error: 'No se reconocieron datos en este formato.' } })); }
      catch (error) { setFinancialPreviews(value => ({ ...value, [key]: { error: error?.response?.data?.error || 'No se pudo leer el archivo.' } })); }
      return;
    }
    if (false && active === 'cxc' && (key === 'receivable' || key === 'payable')) {
      if (!activePeriodId) return;
      const formData = new FormData(); formData.append('file', file);
      try { const { data } = await api.post(`/periods/${activePeriodId}/portfolio/preview`, formData); setPortfolioPreview(value => ({ ...value, [key]: data.data?.totals || {} })); }
      catch (error) { setPortfolioPreview(value => ({ ...value, [key]: { error: error?.response?.data?.error || 'No se pudo leer el archivo.' } })); }
      return;
    }
    if (key === 'retentions' && workflow.setRetentionValue) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const { data } = await api.post('/periods/declaration/parse?type=retentions', formData);
        workflow.setRetentionValue(String(data.data.retentions));
        setParsedRetentionDeclaration(data.data);
      } catch { /* permite registrar el valor manualmente */ }
      return;
    }
    if (key !== 'iva' || !workflow.setIvaValue) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await api.post('/periods/declaration/parse', formData);
      workflow.setIvaValue(String(data.data.iva));
      setParsedIvaDeclaration(data.data);
    } catch {
      // Si el PDF no tiene un campo SRI legible, el valor se puede registrar manualmente.
    }
  };
  const viewExistingDocument = document => {
    if (!activePeriodId || !document?.id) return;
    openProtectedDocument(activePeriodId, document.id).catch(() => alert('No se pudo visualizar el documento.'));
  };
  const labels = active === 'estados'
    ? [['balance', 'Estado de situación financiera'], ['results', 'Estado del resultado integral'], ['equity', 'Estado de cambios en el patrimonio'], ['cashflow', 'Estado de flujos de efectivo'], ['notes', 'Notas a los estados financieros']]
    : active === 'cxc' ? [['receivable', 'Cuentas por cobrar'], ['payable', 'Cuentas por pagar']]
      : active === 'declaraciones' ? [['iva', 'PDF de IVA'], ['retentions', 'PDF de retenciones']]
      : [];
  useEffect(() => {
    if (active !== 'cxc' && active !== 'estados') return;
    document.querySelectorAll('.workflow-upload-grid input[type="file"]').forEach(input => { input.accept = '.pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'; });
  }, [active]);
  useEffect(() => {
    if (active !== 'cxc' || !activePeriodId) return;
    const savedFiles = document.querySelectorAll('.workflow-upload-grid .workflow-saved-file');
    savedFiles.forEach(savedFile => {
      if (savedFile.nextElementSibling?.classList.contains('workflow-view-saved')) return;
      const key = savedFile.parentElement?.querySelector('input[type="file"]')?.closest('label')?.textContent?.toLowerCase().includes('pagar') ? 'payable' : 'receivable';
      const savedDocument = existingDocuments[key];
      if (!savedDocument) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'row-upload-btn workflow-view-saved';
      button.innerHTML = '<span>◉</span> Visualizar';
      button.addEventListener('click', () => viewExistingDocument(savedDocument));
      savedFile.insertAdjacentElement('afterend', button);
    });
    return () => document.querySelectorAll('.workflow-view-saved').forEach(button => button.remove());
  }, [active, activePeriodId, existingDocuments]);
  useEffect(() => {
    if (active !== 'declaraciones' || !activePeriodId) return;
    const fields = document.querySelectorAll('.workflow-upload-grid > label');
    ['iva', 'retentions'].forEach((key, index) => {
      const field = fields[index];
      const savedDocument = existingDocuments[key] || (existingDeclaration?.[key === 'iva' ? 'ivaDocumentId' : 'retentionDocumentId'] ? { id: existingDeclaration[key === 'iva' ? 'ivaDocumentId' : 'retentionDocumentId'] } : null);
      if (!field || !savedDocument || field.querySelector('.workflow-view-saved')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'row-upload-btn workflow-view-saved';
      button.innerHTML = '<span>◉</span> Visualizar PDF';
      button.addEventListener('click', () => viewExistingDocument(savedDocument));
      field.querySelector('.workflow-saved-file')?.insertAdjacentElement('afterend', button);
    });
    return () => document.querySelectorAll('.workflow-view-saved').forEach(button => button.remove());
  }, [active, activePeriodId, existingDocuments, existingDeclaration]);
  useEffect(() => {
    if (active !== 'cxc') return;
    const fields = document.querySelectorAll('.workflow-upload-grid > label');
    ['receivable', 'payable'].forEach((key, index) => {
      const field = fields[index];
      if (!field) return;
      let box = field.querySelector('.portfolio-read-results');
      if (!box) { box = document.createElement('div'); box.className = 'portfolio-read-results'; field.appendChild(box); }
      const value = portfolioPreview[key];
      const count = Number(value?.movementCount ?? value?.records ?? 0);
      box.innerHTML = value ? `<strong>${key === 'receivable' ? 'Cuentas por cobrar' : 'Cuentas por pagar'} · Lectura del PDF</strong><span>Total: USD ${Number(value.totalAmount ?? value.total ?? 0).toFixed(2)}</span><span>Saldo pendiente: USD ${Number(value.pendingAmount ?? value.pending ?? 0).toFixed(2)}</span><span>${count} registro${count === 1 ? '' : 's'} procesado${count === 1 ? '' : 's'}</span>` : '';
    });
  }, [active, portfolioPreview]);
  useEffect(() => {
    if (active !== 'cxc') return;
    const fields = document.querySelectorAll('.workflow-upload-grid > label');
    ['receivable', 'payable'].forEach((key, index) => {
      const value = portfolioPreview[key];
      if (!value?.error || !fields[index]) return;
      const box = fields[index].querySelector('.portfolio-read-results');
      if (!box) return;
      box.innerHTML = `<span>${value.error}</span><label class="portfolio-manual-field">Total<input type="number" step="0.01" data-portfolio-key="totalAmount" value="${portfolioManual[key]?.totalAmount ?? ''}" placeholder="Ingresar manualmente" /></label><label class="portfolio-manual-field">Saldo pendiente<input type="number" step="0.01" data-portfolio-key="pendingAmount" value="${portfolioManual[key]?.pendingAmount ?? ''}" placeholder="Ingresar manualmente" /></label>`;
      box.querySelectorAll('input[data-portfolio-key]').forEach(input => input.addEventListener('input', event => setPortfolioManual(current => ({ ...current, [key]: { ...(current[key] || {}), [event.target.dataset.portfolioKey]: event.target.value === '' ? null : Number(event.target.value) } }))));
    });
  }, [active, portfolioPreview, portfolioManual]);
  useEffect(() => {
    if (active !== 'estados') return undefined;
    const keys = ['balance', 'results', 'equity', 'cashflow', 'notes'];
    const visibleFields = {
      balance: ['total_activos', 'total_pasivos', 'patrimonio'],
      results: ['ingresos_periodo', 'costos_gastos_operativos', 'utilidad_antes_participacion_impuestos']
    };
    const labels = { total_activos: 'Total Activos', total_pasivos: 'Total Pasivos', patrimonio: 'Patrimonio', ingresos_periodo: 'Ingresos', costos_gastos_operativos: 'Costos y Gastos Operativos', utilidad_antes_participacion_impuestos: 'Utilidad antes de participación e impuestos' };
    const fields = document.querySelectorAll('.workflow-upload-grid > label');
    fields.forEach((field, index) => {
      const key = keys[index];
      const preview = financialPreviews[key];
      let box = field.querySelector('.financial-read-results');
      if (!box) { box = document.createElement('div'); box.className = 'financial-read-results'; field.appendChild(box); }
      box.innerHTML = preview?.error
        ? `<span>${preview.error}</span>${(visibleFields[key] || []).map(name => `<label class="financial-manual-field">${labels[name]}<input type="number" step="0.01" data-financial-key="${name}" value="${financialManual[key]?.[name] ?? ''}" placeholder="Ingresar manualmente" /></label>`).join('')}`
        : preview ? (visibleFields[key] || []).map(name => { const value = preview[name]; return `<span><small>${labels[name]}</small><strong>${value == null ? 'No encontrado' : `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</strong></span>`; }).join('') : '';
      box.querySelectorAll('input[data-financial-key]').forEach(input => input.addEventListener('input', event => setFinancialManual(value => ({ ...value, [key]: { ...(value[key] || {}), [event.target.dataset.financialKey]: event.target.value === '' ? null : Number(event.target.value) } }))));
    });
    return () => document.querySelectorAll('.financial-read-results').forEach(box => box.remove());
  }, [active, financialPreviews]);
  useEffect(() => {
    if (active !== 'declaraciones') return;
    const uploadFields = document.querySelectorAll('.workflow-upload-grid > label');
    if (uploadFields.length < 2) return;
    const declaration = parsedIvaDeclaration || existingDeclaration || {};
    const numberValue = value => value == null || value === '' ? '' : Number(value).toFixed(2);
    const addInput = (parent, className, label, value, onChange) => {
      const field = document.createElement('label');
      field.className = className;
      field.innerHTML = `${label}<input type="number" min="0" step="0.01" value="${value}" />`;
      field.querySelector('input').addEventListener('input', event => onChange?.(event.target.value));
      parent.appendChild(field);
    };
    const ivaFields = document.createElement('div');
    ivaFields.className = 'iva-declaration-fields';
    addInput(ivaFields, 'iva-extracted-input', 'Ventas (casillero 419)', numberValue(declaration.ivaCosts ?? declaration.costs));
    addInput(ivaFields, 'iva-extracted-input', 'Costos (casillero 519)', numberValue(declaration.ivaValues ?? declaration.values));
    uploadFields[0].appendChild(ivaFields);
    const retentionFields = document.createElement('div');
    retentionFields.className = 'retention-declaration-field';
    addInput(retentionFields, 'retention-input-field', 'Valor retenciones ($)', numberValue(workflow?.retentionValue ?? existingDeclaration?.retentions), value => workflow?.setRetentionValue?.(value));
    uploadFields[1].appendChild(retentionFields);
    return () => { ivaFields.remove(); retentionFields.remove(); };
  }, [active, existingDeclaration, parsedIvaDeclaration, workflow?.retentionValue]);
  useEffect(() => {
    if (active !== 'declaraciones') return;
    const action = document.querySelector('.workflow-timeline-action');
    if (!action) return;
    const ivaSection = action.querySelector('.workflow-upload-grid > label:first-child');
    if (!ivaSection) return;
    let host = ivaSection.querySelector('.iva-details-slot');
    if (!host) { host = document.createElement('div'); host.className = 'iva-details-slot'; ivaSection.appendChild(host); }
    let box = host.querySelector('.iva-read-results');
    if (!box) { box = document.createElement('div'); box.className = 'iva-read-results'; host.appendChild(box); }
    const money = value => value == null ? 'No encontrado' : `USD ${Number(value).toFixed(2)}`;
    const names = { 401: 'Ventas locales gravadas', 402: 'Ventas tarifa cero', 403: 'Exportaciones de bienes', 404: 'Exportaciones de servicios', 405: 'Ventas no objeto de IVA', 406: 'Ventas exentas de IVA', 409: 'Total ventas', 419: 'Total ventas gravadas', 421: 'IVA generado', 429: 'Total ventas', 480: 'Transferencias gravadas', 481: 'Transferencias gravadas a credito', 482: 'IVA generado del mes', 484: 'Impuesto a liquidar', 499: 'Total IVA', 500: 'Adquisiciones con credito tributario', 501: 'Adquisiciones tarifa diferente de cero', 502: 'Adquisiciones tarifa cero', 503: 'Importaciones gravadas', 504: 'Adquisiciones no objeto de IVA', 505: 'Adquisiciones exentas de IVA', 509: 'Total adquisiciones y pagos', 519: 'Total adquisiciones y pagos', 520: 'IVA pagado en adquisiciones', 529: 'Total IVA adquisiciones', 553: 'Credito tributario', 554: 'IVA a pagar' };
    const declaration = parsedIvaDeclaration || existingDeclaration;
    const rawDetails = declaration?.ivaDetails ?? declaration?.details;
    const details = typeof rawDetails === 'string' ? (() => { try { return JSON.parse(rawDetails); } catch { return null; } })() : rawDetails;
    const storedPayload = declaration?.ivaDetailRows || declaration?.detailGroups || declaration?.detailRows;
    const storedRows = typeof storedPayload === 'string' ? (() => { try { return JSON.parse(storedPayload); } catch { return []; } })() : storedPayload;
    const groups = Array.isArray(storedRows) && storedRows[0]?.fields ? storedRows : [];
    const entries = !groups.length && Array.isArray(storedRows) ? storedRows.filter(item => Number(item.value) > 0).map(item => ({ label: item.label || names[item.code] || 'Casillero del formulario', fields: [{ code: item.code, value: item.value }] })) : [];
    const formatRow = item => `<tr><td><b>${item.code}</b> · ${item.label || names[item.code] || 'Casillero del formulario'}</td><td>${money(item.value)}</td></tr>`;
    const visibleGroups = (groups.length ? groups : entries).filter(group => group.fields.some(field => Number(field.value) > 0) && !/factor de proporcionalidad/i.test(group.label));
    const hasSalesTotal = visibleGroups.some(group => group.fields.some(field => String(field.code) === '419'));
    const salesTotal = Number(declaration?.ivaCosts ?? declaration?.costs);
    // Compatibilidad con declaraciones guardadas antes de corregir el parser:
    // si el PDF ya tenía el valor 419 pero no se almacenó su fila, la mostramos
    // usando el valor de iva_costs_amount guardado en la declaración.
    if (!hasSalesTotal && Number.isFinite(salesTotal) && salesTotal > 0) {
      visibleGroups.push({ label: 'TOTAL VENTAS Y OTRAS OPERACIONES', fields: [{ code: '409', value: salesTotal }, { code: '419', value: salesTotal }] });
    }
    const formatGroup = group => `<div class="iva-form-row ${/^(TOTAL VENTAS Y OTRAS OPERACIONES|TOTAL ADQUISICIONES Y PAGOS)$/i.test(group.label.trim()) ? 'iva-total-row' : ''}"><span class="iva-form-label">${group.label}</span>${group.fields.filter(field => Number(field.value) > 0).map(field => { const key = ['419', '519'].includes(String(field.code)); return `<span class="iva-form-code ${key ? 'iva-key-code' : ''}">${field.code}</span><span class="iva-form-value ${key ? 'iva-key-value' : ''}">${money(field.value)}</span>`; }).join('')}</div>`;
    const sales = visibleGroups.filter(group => Number(group.fields[0]?.code) >= 400 && Number(group.fields[0]?.code) < 480).map(formatGroup).join('');
    const expenseGroups = visibleGroups.filter(group => Number(group.fields[0]?.code) >= 500 && Number(group.fields[0]?.code) < 600);
    const expenseTotalIndex = expenseGroups.findIndex(group => /^TOTAL ADQUISICIONES Y PAGOS$/i.test(group.label.trim()));
    const expenses = expenseGroups.slice(0, expenseTotalIndex >= 0 ? expenseTotalIndex + 1 : expenseGroups.length).map(formatGroup).join('');
    const tableHeader = title => `<div class="iva-form-header"><span class="iva-header-label">${title}</span><span class="iva-header-group">VALOR BRUTO</span><span class="iva-header-group">VALOR NETO</span><span class="iva-header-group">IMPUESTO GENERADO</span></div>`;
    const rows = `${sales ? `${tableHeader('RESUMEN DE VENTAS Y OTRAS OPERACIONES DEL PERIODO QUE DECLARA')}${sales}` : ''}${expenses ? `${tableHeader('RESUMEN DE ADQUISICIONES Y PAGOS DEL PERIODO QUE DECLARA')}${expenses}` : ''}`;
    box.innerHTML = declaration ? `<strong>Detalle extraído del PDF</strong><span>Casillero 419 · Ventas: ${money(declaration.ivaCosts ?? declaration.costs)}</span><span>Casillero 519 · Valores: ${money(declaration.ivaValues ?? declaration.values)}</span>${rows ? `<details><summary>Ver demás casilleros</summary><table><tbody>${rows}</tbody></table></details>` : '<small>El detalle estará disponible al guardar un PDF nuevo.</small>'}` : '';
    box.querySelectorAll(':scope > span').forEach(item => item.remove());
    const extractedValues = document.createElement('div');
    extractedValues.className = 'iva-extracted-values';
    extractedValues.innerHTML = `<div><small>Ventas · casillero 419</small><strong>Guardado: ${money(declaration?.ivaCosts ?? declaration?.costs)}</strong></div><div><small>Costos / adquisiciones · casillero 519</small><strong>Guardado: ${money(declaration?.ivaValues ?? declaration?.values)}</strong></div>`;
    box.querySelector('strong')?.insertAdjacentElement('afterend', extractedValues);
    const detailToggle = box.querySelector('details');
    if (detailToggle) { detailToggle.open = false; const summary = detailToggle.querySelector('summary'); if (summary) summary.textContent = 'Revisar detalle'; }
    let detailModal;
    const summary = detailToggle?.querySelector('summary');
    if (detailToggle && summary) {
      summary.addEventListener('click', event => {
        event.preventDefault();
        detailModal?.remove();
        detailModal = document.createElement('div');
        detailModal.className = 'iva-detail-modal-backdrop';
        const detailClone = detailToggle.cloneNode(true);
        detailClone.querySelector('summary')?.remove();
        const content = detailClone.innerHTML;
        detailModal.innerHTML = `<section class="iva-detail-modal" role="dialog" aria-modal="true"><button type="button" class="iva-detail-modal-close" aria-label="Cerrar">×</button><h3>Detalle de declaración de IVA</h3><div class="iva-detail-modal-content">${content}</div></section>`;
        detailModal.addEventListener('click', event => { if (event.target === detailModal || event.target.closest('.iva-detail-modal-close')) detailModal.remove(); });
        document.body.appendChild(detailModal);
      });
    }
    return () => { detailModal?.remove(); box?.remove(); };
  }, [active, existingDeclaration, parsedIvaDeclaration]);
  useEffect(() => {
    if (active !== 'declaraciones') return;
    const uploadFields = document.querySelectorAll('.workflow-upload-grid > label');
    const retentionSection = uploadFields[1];
    if (!retentionSection) return;
    const declaration = parsedRetentionDeclaration || existingDeclaration || {};
    const rawRows = declaration.retentionDetailRows ?? declaration.retentionDetailGroups ?? declaration.detailGroups ?? declaration.detailRows;
    const parsedRows = typeof rawRows === 'string' ? (() => { try { return JSON.parse(rawRows); } catch { return []; } })() : rawRows;
    const rawDetails = declaration.retentionDetails ?? declaration.details;
    const details = typeof rawDetails === 'string' ? (() => { try { return JSON.parse(rawDetails); } catch { return {}; } })() : (rawDetails || {});
    const groups = Array.isArray(parsedRows) && parsedRows[0]?.fields
      ? parsedRows.filter(row => (row.fields || []).some(field => Number(field.value) > 0 || String(field.code) === '399 + 498'))
      : [];
    const rows = !groups.length && Array.isArray(parsedRows) && parsedRows.length
      ? parsedRows.filter(row => Number(row.value) > 0)
      : Object.entries(details).filter(([, value]) => Number(value) > 0).map(([code, value]) => ({ code, value, label: 'Casillero del formulario' }));
    let box = retentionSection.querySelector('.retention-read-results');
    if (!box) {
      box = document.createElement('div');
      box.className = 'retention-read-results';
      const valueField = retentionSection.querySelector('.retention-declaration-field');
      if (valueField) retentionSection.insertBefore(box, valueField);
      else retentionSection.appendChild(box);
    }
    if (!groups.length && !rows.length) { box.innerHTML = ''; return () => box?.remove(); }
    const money = value => `USD ${Number(value).toFixed(2)}`;
    box.innerHTML = `<button type="button" class="retention-detail-button">Revisar detalle</button>`;
    const button = box.querySelector('button');
    const modal = document.createElement('div');
    modal.className = 'iva-detail-modal-backdrop';
    const pair = (field, fallback = '') => field ? `<span class="retention-form-code">${field.code}</span><span class="retention-form-value">${field.value == null ? '' : money(field.value)}</span>` : `<span></span><span>${fallback}</span>`;
    const tableRows = groups.length
      ? groups.map(row => { const fields = (row.fields || []).filter(field => Number(field.value) > 0 || String(field.code) === '399 + 498'); const retainedOnly = fields.some(field => ['501', '902', '999'].includes(String(field.code))); const total = fields.some(field => ['499', '501', '902', '999'].includes(String(field.code))); const left = retainedOnly ? null : fields[0]; const right = retainedOnly ? fields[0] : fields[1]; return `<div class="retention-form-row ${total ? 'retention-total-row' : ''}"><span class="retention-form-label">${row.label || 'Casillero del formulario'}</span>${pair(left)}${pair(right)}</div>`; }).join('')
      : rows.map(row => `<div class="retention-form-row"><span class="retention-form-label">${row.label || 'Casillero del formulario'}</span>${pair(row)}${pair()}</div>`).join('');
    button?.addEventListener('click', () => {
      modal.innerHTML = `<section class="iva-detail-modal retention-detail-modal" role="dialog" aria-modal="true"><button type="button" class="iva-detail-modal-close" aria-label="Cerrar">×</button><h3>Detalle de retenciones</h3><div class="iva-detail-modal-content"><table class="retention-detail-table"><thead><tr><th>DESCRIPCIÓN</th><th>BASE IMPONIBLE</th><th>VALOR RETENIDO</th></tr></thead><tbody>${tableRows}</tbody></table></div></section>`;
      modal.innerHTML = `<section class="iva-detail-modal retention-detail-modal" role="dialog" aria-modal="true"><button type="button" class="iva-detail-modal-close" aria-label="Cerrar">X</button><h3>Detalle de retenciones</h3><div class="iva-detail-modal-content"><div class="retention-form-table"><div class="retention-form-header"><span>DESCRIPCION</span><span>BASE IMPONIBLE</span><span>VALOR RETENIDO</span></div>${tableRows}</div></div></section>`;
      document.body.appendChild(modal);
    });
    modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('.iva-detail-modal-close')) modal.remove(); });
    return () => { modal.remove(); box?.remove(); };
  }, [active, existingDeclaration, parsedRetentionDeclaration]);
  const accept = '.pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
  const handleTimelineStepClick = stepIndex => {
    if (stepIndex === 1 && active === 'estados' && !completed.has('estados')) {
      setCompleted(value => new Set([...value, 'estados']));
      setActive('cxc');
      return;
    }
    if (stepIndex === 2 && active === 'cxc' && !completed.has('cxc')) {
      setCompleted(value => new Set([...value, 'cxc']));
      setActive('declaraciones');
      return;
    }
    if (stepIndex <= lastAvailableIndex || stepIndex === lastAvailableIndex + 1) setActive(WORKFLOW_STEPS[stepIndex][0]);
  };
  return <section className={`workflow-timeline panel ${compact ? 'compact' : ''}`}>
    {client && <div className="workflow-timeline-context"><div><p className="eyebrow">CLIENTE ACTIVO</p><strong>{client.name}</strong><span className="timeline-period-label">· {selectedYear} · {selectedMonth}</span><small>RUC / Cédula: {client.ruc}</small></div>{onClose && <button type="button" className="timeline-close-btn" onClick={onClose} aria-label="Volver a clientes"><Icon name="close" size={17}/></button>}</div>}
     {showTimeline && <div className="workflow-timeline-groups"><p className="workflow-timeline-group-label process-label">Proceso del periodo</p>{WORKFLOW_STEPS.map(([id, label], stepIndex) => <button ref={active === id ? activeStepRef : null} key={id} type="button" className={`workflow-timeline-step ${completed.has(id) ? 'completed' : ''} ${active === id ? 'current' : ''}`} disabled={stepIndex > lastAvailableIndex && stepIndex !== lastAvailableIndex + 1} onClick={() => handleTimelineStepClick(stepIndex)}><span className="workflow-timeline-dot">{completed.has(id) ? '✓' : stepIndex + 1}</span><span className="workflow-timeline-label">{label}</span></button>)}</div>}
   {showAction && <div className="workflow-timeline-action">
     <p className="eyebrow">PASO ACTIVO</p>
     <h4>{activeLabel}</h4>
     {active === 'anio' && <label>Año fiscal<select value={selectedYear} disabled={completed.has(active)} onChange={event => setSelectedYear(event.target.value)}><option>{year}</option><option>{Number(year) + 1}</option></select></label>}
     {active === 'mes' && <label>Mes<select value={selectedMonth} disabled={completed.has(active)} onChange={event => setSelectedMonth(event.target.value)}>{MONTHS.map(item => <option key={item.name}>{item.name}</option>)}</select></label>}
     {process.has(active) && <div className="workflow-upload-grid">{labels.map(([key, label]) => <label key={key}>{label}{existingDocuments[key] && <small className="workflow-saved-file">Guardado: {existingDocuments[key].originalName} · v{existingDocuments[key].version}.0</small>}<input type="file" accept={key === 'iva' || key === 'retentions' || key === 'results' ? '.pdf,.xlsx,.xls,application/pdf' : '.xlsx,.xls'} onChange={event => setFile(key, event.target.files?.[0] || null)} />{files[key] && <small className="workflow-file-name">Nuevo: {files[key].name}</small>}</label>)}</div>}
     {active === 'declaraciones' && <div className="workflow-values-grid"><label>Valor IVA ($)<input type="number" min="0" step="0.01" value={workflow?.ivaValue || existingDeclaration?.iva || ''} onChange={event => workflow?.setIvaValue?.(event.target.value)} /></label><label>Valor retenciones ($)<input type="number" min="0" step="0.01" value={workflow?.retentionValue || existingDeclaration?.retentions || ''} onChange={event => workflow?.setRetentionValue?.(event.target.value)} /></label></div>}
     <button key={hasChanges ? 'guardar-cambios' : active === 'completado' ? 'revisar-informacion' : 'continuar'} type="button" className="primary" onClick={complete}>{hasChanges ? 'Guardar cambios' : active === 'completado' ? 'Revisar información' : 'Continuar'}</button>
   </div>}
   </section>;
}

const ensureCsrfToken = async () => {
  return getCsrfToken();
};

const setBrowserPath = (path) => {
  if (window.location.pathname !== path) {
    window.history.replaceState({}, document.title, path);
  }
};

const clearLegacyAuthStorage = () => {
  try {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  } catch {
    // Si el navegador bloquea el acceso, seguimos sin interrumpir la carga.
  }
};

const Icon = ({ name, size = 20 }) => {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 1 0 7.75"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 14h.01"/></>,
    receipt: <><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2z"/><path d="M8 9h8M8 13h6"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20h-3v-.09A1.7 1.7 0 0 0 10.7 18.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.06 14.7 1.7 1.7 0 0 0 5.5 13.67H5v-3h.5a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.73 4.45V4h3v.45A1.7 1.7 0 0 0 15.76 6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03h.05v3h-.05A1.7 1.7 0 0 0 19.4 15z"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    refresh: <><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 10v7M14 10v7"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    history: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
};

const MONTHS = [
  { name: 'Enero', short: 'ENE' },
  { name: 'Febrero', short: 'FEB' },
  { name: 'Marzo', short: 'MAR' },
  { name: 'Abril', short: 'ABR' },
  { name: 'Mayo', short: 'MAY' },
  { name: 'Junio', short: 'JUN' },
  { name: 'Julio', short: 'JUL' },
  { name: 'Agosto', short: 'AGO' },
  { name: 'Septiembre', short: 'SEP' },
  { name: 'Octubre', short: 'OCT' },
  { name: 'Noviembre', short: 'NOV' },
  { name: 'Diciembre', short: 'DIC' }
];

const repairDisplayText = value => String(value || '')
  .replace(/Ã¡/g, 'á').replace(/Ã©/g, 'é').replace(/Ã­/g, 'í').replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú').replace(/Ã±/g, 'ñ')
  .replace(/retenci[\uFFFD?]n/gi, 'retención').replace(/declaraci[\uFFFD?]n/gi, 'declaración')
  .replace(/operaci[\uFFFD?]n/gi, 'operación').replace(/adquisici[\uFFFD?]n/gi, 'adquisición')
  .replace(/liquidaci[\uFFFD?]n/gi, 'liquidación').replace(/tributaci[\uFFFD?]n/gi, 'tributación')
  .replace(/compensaci[\uFFFD?]n/gi, 'compensación').replace(/informaci[\uFFFD?]n/gi, 'información')
  .replace(/relaci[\uFFFD?]n/gi, 'relación').replace(/despu[\uFFFD?]s/gi, 'después')
  .replace(/cr[\uFFFD?]dito/gi, 'crédito').replace(/pa[\uFFFD?]s/gi, 'país');

// El impuesto a la renta es opcional y no participa en el cierre mensual.
const getPeriodStatus = (documents = {}) => {
  const required = ['financial', 'accounts', 'declarations'];
  const completed = required.filter(key => Boolean(documents[key])).length;
  if (completed === required.length) return 'Completado';
  if (completed > 0) return 'En proceso';
  return 'Pendiente';
};

const nav = [
  ['Clientes', 'users'],
  ['Dashboard', 'grid'],
  ['Periodos contables', 'calendar'],
  ['Estados financieros', 'file'],
  ['CxC y CxP', 'wallet'],
  ['Declaraciones', 'receipt']
];

const modulePermissions = {
  Dashboard: 'dashboard.read', Clientes: 'client.read', 'Periodos contables': 'period.read',
  'Estados financieros': 'document.read', 'CxC y CxP': 'document.read', Declaraciones: 'declaration.manage',
  'Configuración': 'client.read'
};

function PermissionGate({ allowed, children }) {
  // Evita mostrar una vista al navegar directamente a una URL no autorizada.
  return allowed ? children : <section className="content"><div className="empty">No tienes permisos para consultar esta sección.</div></section>;
}


const modulePaths = {
  Dashboard: '/dashboard',
  Clientes: '/clientes',
  'Periodos contables': '/periodos-contables',
  'Estados financieros': '/estados-financieros',
  'CxC y CxP': '/cxc-cxp',
  Declaraciones: '/declaraciones',
  'Configuración': '/configuracion'
};

const pathToModule = Object.fromEntries(Object.entries(modulePaths).map(([name, path]) => [path, name]));

const FINANCIAL_DOCUMENTS = [
  ['balance', 'Estado de situación financiera (Balance general)', 'Activos, pasivos y patrimonio en una fecha determinada.'],
  ['results', 'Estado de resultados (Pérdidas y ganancias)', 'Ingresos, gastos y resultado del periodo.'],
  ['cashflow', 'Estado de flujos de efectivo', 'Origen y uso del efectivo durante el periodo.'],
  ['equity', 'Estado de cambios en el patrimonio', 'Movimientos del patrimonio de los socios o accionistas.'],
  ['notes', 'Notas a los estados financieros', 'Explicaciones y detalles de los cuatro estados anteriores.']
];

const PORTFOLIO_DOCUMENTS = [
  ['receivable', 'Cuentas por cobrar', 'Detalle de clientes y valores pendientes de cobro.'],
  ['payable', 'Cuentas por pagar', 'Detalle de proveedores y obligaciones pendientes de pago.']
];


function Login({ onLogin }) {
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [ssoName, setSsoName] = useState('');
  const [ssoMode, setSsoMode] = useState(false);
  const [ssoExpired, setSsoExpired] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLoginSession, setCheckingLoginSession] = useState(true);
  useEffect(() => {
    if (location.state?.sessionExpired) {
      setError('Sesión caducada. Inicia sesión nuevamente.');
      window.history.replaceState({}, document.title, '/login');
    }
  }, [location.state]);
  useEffect(() => {
    ensureCsrfToken().catch(() => {});
    api.get('/auth/me', { skipRefresh: true })
      .then(response => response.data)
      .then(data => {
        if (data?.ok && data.user) {
          onLogin(data.user);
        } else {
          setCheckingLoginSession(false);
        }
      })
      .catch(() => setCheckingLoginSession(false));

    const ssoStatus = new URLSearchParams(window.location.search).get('sso');
    if (ssoStatus === 'invalid') {
      setError('El enlace ya fue utilizado o caducó. Ingresa nuevamente tus credenciales.');
      setUsername('');
      setPassword('');
      setSsoMode(false);
      setSsoExpired(true);
      setBrowserPath('/login');
    } else {
      setBrowserPath('/login');
    }
    // El backend decide si existe una preautenticación válida.
    api.get('/auth/context')
      .then(response => response.data)
      .then(data => {
        if (data?.mode === 'password_only') {
          setSsoName(data.nombre || '');
          setSsoMode(true);
          setSsoExpired(false);
          return;
        }
        // Sin preautenticación se muestra el formulario completo.
        setSsoMode(false);
        setSsoExpired(false);
        setUsername('');
      })
      .catch(() => {
        // Si el backend no responde, se mantiene el formulario completo.
        setSsoMode(false);
        setUsername('');
      });
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    if ((!ssoMode && !username) || !password) {
      return setError(ssoMode ? 'La contraseña es obligatoria.' : 'Usuario y contrasena son obligatorios.');
    }
    setLoading(true);
    try {
      const loginData = ssoMode ? { password, ssoAttempt: true } : { username, password, ssoAttempt: false };
      const response = await api.post('/auth/login', loginData, { skipRefresh: true });
      const data = response.data;
      if (data.requiresCredentials) {
        setSsoMode(false);
        setSsoExpired(true);
        setUsername('');
        setPassword('');
      }
      // En los dos primeros errores se conserva el SSO y solo se limpia la contraseña.
      if (!data.ok && !data.requiresCredentials && ssoMode) setPassword('');
      if (!data.ok) throw new Error(data.error || 'No se pudo iniciar sesion.');
      onLogin(data.user);
    } catch (requestError) {
      const responseData = requestError?.response?.data;
      if (responseData?.requiresCredentials) {
        setSsoMode(false);
        setSsoExpired(true);
        setUsername('');
        setPassword('');
      }
      const apiError = requestError?.response?.data?.error;
      setError(apiError || (requestError instanceof Error ? requestError.message : 'Error de conexion con el servidor.'));
    } finally {
      setLoading(false);
    }
  };
  if (checkingLoginSession) return <main className="login-page"></main>;

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-card">
          <Icon name="shield" size={30}/>
          <div>
            <strong>Información siempre segura</strong>
            <small>Roles, trazabilidad y documentos protegidos.</small>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <div className="mobile-logo">
            <div className="logo-mark">C</div> Conta<span>Matic</span>
          </div>
          <h2>¡Bienvenido de nuevo!</h2>
          <p className="login-subtitle">Por favor, inicie sesión para continuar.</p>
          {ssoMode && ssoName && <p className="login-user">Usuario: <strong>{ssoName}</strong></p>}
          {!ssoMode && <label>Usuario<input type="text" autoFocus placeholder="usuario" value={username} onChange={e => setUsername(e.target.value)} /></label>}
          <label>
            Contraseña
            <div className="password">
              <input type="password" autoFocus placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
              <Icon name="lock" size={17}/>
            </div>
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary login-btn">Continuar <Icon name="arrow" size={18}/></button>
          <div className="demo">El usuario se valida desde el enlace de acceso seguro.</div>
        </form>
      </section>
    </main>
  );
}

function App() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('2026');
  const [availableYears, setAvailableYears] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [clientToDisable, setClientToDisable] = useState(null);
  const [clientList, setClientList] = useState([]);
  const [timelineClient, setTimelineClient] = useState(null);
  const [workflowCompleted, setWorkflowCompleted] = useState(new Set(['cliente']));
  const [workflowActive, setWorkflowActive] = useState('anio');
  const [workflowYear, setWorkflowYear] = useState('2026');
  const [workflowMonth, setWorkflowMonth] = useState('Enero');
  const [workflowFiles, setWorkflowFiles] = useState({});
  const [workflowIvaValue, setWorkflowIvaValue] = useState('');
  const [workflowRetentionValue, setWorkflowRetentionValue] = useState('');
  const [workflowEmployeeExpense, setWorkflowEmployeeExpense] = useState('0');
  const [workflowMessage, setWorkflowMessage] = useState('');
  const [disabledClients, setDisabledClients] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [allPeriods, setAllPeriods] = useState([]);
  const [periodRecords, setPeriodRecords] = useState([]);
  // Cliente seleccionado en el filtro global. Solo se utiliza para el rol CONTADOR.
  const [globalClientRuc, setGlobalClientRuc] = useState(() => {
    try { return sessionStorage.getItem('contamatic.globalClientRuc') || ''; } catch { return ''; }
  });
  const userName = user?.nombre || user?.name || 'Usuario';
  const userReference = user?.ID || '';
  // Indicador temporal para comprobar visualmente el rol recibido desde el backend.
  const userRole = String(user?.role || 'SIN ROL').toUpperCase();
  const isGlobalClientFilterEnabled = userRole === 'CONTADOR';
  const can = permission => Array.isArray(user?.permissions) && user.permissions.includes(permission);
  const visibleNav = (CLIENTS_ONLY_MODE ? nav.filter(([label]) => label === 'Clientes') : nav).filter(([label]) => can(modulePermissions[label]));
  const userInitials = userName.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const globalClient = isGlobalClientFilterEnabled
    ? clientList.find(client => String(client.ruc) === String(globalClientRuc))
    : null;
  useEffect(() => {
    if (!isGlobalClientFilterEnabled) {
      setGlobalClientRuc('');
      return;
    }
    try {
      if (globalClientRuc) sessionStorage.setItem('contamatic.globalClientRuc', globalClientRuc);
      else sessionStorage.removeItem('contamatic.globalClientRuc');
    } catch {
      // La selección sigue funcionando aunque el navegador bloquee sessionStorage.
    }
  }, [globalClientRuc, isGlobalClientFilterEnabled]);

  useEffect(() => {
    // Si el cliente dejó de estar disponible, se limpia el filtro para no dejar
    // a los módulos apuntando a un cliente inexistente.
    if (globalClientRuc && !clientList.some(client => String(client.ruc) === String(globalClientRuc))) {
      setGlobalClientRuc('');
    }
  }, [clientList, globalClientRuc]);

  useEffect(() => {
    if (userRole !== 'ADMIN') { setAssignableUsers([]); return; }
    api.get('/auth/assignable-users').then(({ data }) => setAssignableUsers(data.data || [])).catch(() => setAssignableUsers([]));
  }, [userRole]);

  // Carga los permisos reales del backend; no se mantienen permisos en el bundle.
  useEffect(() => {
    if (!user || Array.isArray(user.permissions)) return;
    api.get('/auth/permissions').then(({ data }) => {
      setUser(current => current ? { ...current, permissions: data.permissions || [] } : current);
    }).catch(() => setUser(current => current ? { ...current, permissions: [] } : current));
  }, [user, setUser]);

  // Cuando accessToken y refreshToken caducan, cerrar sesión completamente.
  useEffect(() => {
    const handleSessionExpired = async () => {
      try {
        await api.post('/auth/logout');
      } catch {
        // El estado local se limpia aunque el backend no responda.
      }
      setUser(null);
      navigate('/login', { replace: true, state: { sessionExpired: true } });
    };
    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, [navigate, setUser]);

  // La URL es la única fuente de verdad de la sección activa.
  const active = pathToModule[location.pathname] || 'Dashboard';

  useEffect(() => {
    clearLegacyAuthStorage();
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get('/clients').then(({ data }) => setClientList(data.data || [])).catch(() => setClientList([]));
    if (!CLIENTS_ONLY_MODE) api.get('/clients/disabled').then(({ data }) => setDisabledClients(data.data || [])).catch(() => setDisabledClients([]));
  }, [user]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        // La entrada inicial (/, normalmente desde el enlace SSO) muestra
        // primero el formulario. No se debe consultar /me hasta autenticarse.
        const initialLoginEntry = window.location.pathname === '/' || window.location.pathname === '/login';
        if (initialLoginEntry) {
          setCheckingSession(false);
          return;
        }

        const meResponse = await api.get('/auth/me');
        const data = meResponse.data;
        if (data?.ok && data.user) {
          setUser(data.user);
          // Conserva la ruta solicitada al abrir un enlace directo. Antes se
          // enviaba cualquier ruta autenticada a /clientes, por lo que
          // /historial podía quedar fuera del flujo esperado.
        }
      } catch {
        navigate('/login', { replace: true });
      } finally {
        setCheckingSession(false);
      }
    };

    loadSession();
  }, []);

  // Permite recargar o abrir directamente el enlace del cronograma.
  useEffect(() => {
    const match = location.pathname.match(/^\/clientes\/cronograma\/([^/]+)$/);
    if (!match || !clientList.length) return;
    const clientId = decodeURIComponent(match[1]);
    const client = clientList.find(item => String(item.id) === String(clientId));
    if (!client) {
      navigate('/clientes', { replace: true });
      return;
    }
    if (!timelineClient || String(timelineClient.id) !== String(client.id)) {
      void handleOpenTimeline(client);
    }
  }, [location.pathname, clientList]);

  // Revalidar al volver con Atrás/Adelante o desde la caché del navegador.
  useEffect(() => {
    const revalidateSession = (event) => {
      // En una recarga normal ya se ejecuta loadSession; pageshow solo debe
      // revalidar cuando el navegador restaura la página desde BFCache.
      if (!event.persisted) return;
      if (window.location.pathname === '/login' || window.location.pathname === '/') return;
      api.get('/auth/me')
        .then(response => {
          const data = response.data;
          if (!data?.ok || !data.user) throw new Error('session-expired');
          setUser(data.user);
        })
        .catch(() => {
          setUser(null);
          navigate('/login', { replace: true });
        });
    };

    window.addEventListener('pageshow', revalidateSession);
    return () => window.removeEventListener('pageshow', revalidateSession);
  }, []);

  useEffect(() => {
    if (CLIENTS_ONLY_MODE || !user || !clientList.length) return;
    api.get('/periods', { params: { year } })
      .then(({ data }) => {
        const nextPeriods = data.data || [];
        setPeriods(nextPeriods);
        setAvailableYears(current => Array.from(new Set([...current, ...nextPeriods.map(period => String(period.year))])).sort((a, b) => Number(b) - Number(a)));
      })
      .catch(() => setPeriods([]));
  }, [year, clientList]);

  useEffect(() => {
    if (CLIENTS_ONLY_MODE || !user || !clientList.length) return;
    api.get('/periods')
      .then(({ data }) => {
        const nextPeriods = data.data || [];
        setAllPeriods(nextPeriods);
        setAvailableYears(current => Array.from(new Set([...current, ...nextPeriods.map(period => String(period.year))])).sort((a, b) => Number(b) - Number(a)));
      })
      .catch(() => setAllPeriods([]));
  }, [user, clientList]);

  const clientsWithDynamicProgress = useMemo(() => {
    return clientList.map(c => {
      const clientPeriods = periods.filter(p => p.clientRuc === c.ruc && p.year === String(year));
      const total = clientPeriods.length || 12;
      const completed = clientPeriods.filter(p => p.status === 'Completado').length;
      const pct = Math.round((completed / total) * 100);
      let status = 'En proceso';
      let tone = 'blue';
      if (pct === 100) { status = 'Completado'; tone = 'green'; }
      else if (pct >= 80) { status = 'Al día'; tone = 'green'; }
      else if (pct < 50) { status = 'Pendiente'; tone = 'orange'; }

      return {
        ...c,
        progress: pct,
        status,
        tone,
        tasks: `${completed} de ${total}`
      };
    });
  }, [clientList, periods, year]);

  // Cuando hay filtro, todos los módulos reciben únicamente el cliente elegido.
  const clientsForModules = globalClient
    ? clientsWithDynamicProgress.filter(client => String(client.ruc) === String(globalClient.ruc))
    : clientsWithDynamicProgress;

  const generalPeriodTotals = useMemo(() => {
    // El resumen respeta el año y, si existe, el cliente del filtro global.
    const scopedPeriods = allPeriods.filter(period =>
      String(period.year) === String(year) &&
      (!globalClient || String(period.clientRuc) === String(globalClient.ruc))
    );
    const completed = scopedPeriods.filter(period => period.status === 'Completado').length;
    const total = scopedPeriods.length;
    return { completed, total, pending: Math.max(total - completed, 0), compliance: total ? Math.round((completed / total) * 100) : 0 };
  }, [allPeriods, year, globalClient]);

  const filtered = useMemo(() => {
    return clientsWithDynamicProgress.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) || c.ruc.includes(search)
    );
  }, [search, clientsWithDynamicProgress]);
  const filteredForModules = useMemo(() => clientsForModules.filter(client =>
    client.name.toLowerCase().includes(search.toLowerCase()) || client.ruc.includes(search)
  ), [search, clientsForModules]);

  const handleOpenCreateModal = () => {
    setEditingClient(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (client) => {
    setEditingClient(client);
    setShowModal(true);
  };
  const handleOpenTimeline = async (client, targetYear = year, targetMonth = null) => {
    setTimelineClient(client);
    navigate(`/clientes/cronograma/${encodeURIComponent(client.id)}`);
    setWorkflowCompleted(new Set());
    setWorkflowActive('estados');
    try {
      const { data } = await api.get('/periods', { params: { clientId: client.id, year: targetYear } });
      const clientPeriods = data.data || [];
      setPeriods(current => [...current.filter(item => String(item.clientRuc) !== String(client.ruc) || String(item.year) !== String(targetYear)), ...clientPeriods]);
      const period = targetMonth ? clientPeriods.find(item => String(item.month) === String(targetMonth)) || clientPeriods[0] : clientPeriods[0];
      if (period) {
        const completed = new Set(['cliente', 'anio', 'mes']);
        if (period.documents?.financial || period.financialDocuments) completed.add('estados');
        if (period.documents?.accounts || period.accountDocuments) completed.add('cxc');
        if (period.documents?.declarations || period.declarationDocuments) completed.add('declaraciones');
        // Si el usuario avanzó a un paso posterior sin cargar estados financieros,
        // el avance posterior confirma que este paso ya fue recorrido.
        if (completed.has('declaraciones')) { completed.add('estados'); completed.add('cxc'); }
        else if (completed.has('cxc')) completed.add('estados');
        if (period.status === 'Completado') {
          completed.add('renta');
          completed.add('completado');
        }
        setWorkflowYear(String(period.year));
        setWorkflowMonth(period.month);
        setWorkflowCompleted(completed);
        const next = WORKFLOW_STEPS.find(([id]) => !completed.has(id));
        if (next) setWorkflowActive(next[0]);
      }
    } catch {
      // El cronograma puede abrirse aunque todavía no exista un año aperturado.
    }
  };
  const createPeriodForClient = async (client, selectedYear, selectedMonth, onError) => {
    const monthNumber = MONTHS.findIndex(item => item.name === selectedMonth) + 1;
    try {
      await api.post('/periods/single', { clientId: client.id, year: Number(selectedYear), month: monthNumber });
      const { data } = await api.get('/periods');
      setPeriods(data.data || []);
      await handleOpenTimeline(client, selectedYear, selectedMonth);
      return true;
    } catch (error) {
      onError?.(error?.response?.data?.error || 'No se pudo crear el periodo.');
      return false;
    }
  };
  const handleCloseTimeline = () => {
    setTimelineClient(null);
    navigate('/clientes', { replace: true });
  };

  const deleteClient = async (client) => {
    try {
      await api.delete(`/clients/${client.id}`);
      const disabledClient = {
        ...client,
        disabledAt: new Date().toISOString(),
        disabledBy: user?.ID || user?.codigo || null
      };
      setClientList(current => current.filter(item => item.id !== client.id));
      setDisabledClients(current => [disabledClient, ...current.filter(item => item.id !== client.id)]);
      setPeriods(current => current.filter(period => period.clientRuc !== client.ruc));
      setPeriodRecords(current => current.filter(record => record.clientRuc !== client.ruc));
      setClientToDisable(null);
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo deshabilitar el cliente.');
    }
  };

  const saveClient = async (clientData) => {
    if (!editingClient) {
      const { data } = await api.post('/clients', clientData);
      const newClient = { ...data.data, progress: 0, status: 'Pendiente', tone: 'orange', tasks: '0 de 12' };
      setClientList(current => [newClient, ...current]);
      setShowModal(false);
      setEditingClient(null);
      return;
    }
    if (editingClient) {
      const { data } = await api.put(`/clients/${editingClient.id}`, clientData);
      const updatedClient = data.data;
      setClientList(current => current.map(c => c.id === editingClient.id ? { ...c, ...updatedClient } : c));
      setPeriods(current => current.map(p => p.clientRuc === editingClient.ruc ? { ...p, clientName: clientData.name } : p));
    }
    setShowModal(false);
    setEditingClient(null);
  };

  const handleUpdatePeriodStatus = async (periodId, newStatus) => {
    try {
      const { data } = await api.patch(`/periods/${periodId}`, { status: newStatus });
      setPeriods(current => current.map(p => p.id === periodId ? data.data : p));
    } catch {
      // El estado visual se conserva si el servidor rechaza la actualización.
    }
  };

  const handleCreateFiscalYear = async (targetYear, clientId, frequency) => {
    try {
      if (!clientId) return alert('Selecciona un cliente válido.');
      const { data } = await api.post('/periods/years', { year: Number(targetYear), clientId, frequency: 'Mensual' });
      setPeriods(data.data || []);
      setAvailableYears(current => Array.from(new Set([String(targetYear), ...current])).sort((a, b) => b - a));
      setYear(String(targetYear));
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo aperturar el año fiscal.');
      throw error;
    }
  };

  const refreshPeriodsForYear = async targetYear => {
    const { data } = await api.get('/periods', { params: { year: String(targetYear) } });
    const nextPeriods = data.data || [];
    setPeriods(current => [
      ...current.filter(period => String(period.year) !== String(targetYear)),
      ...nextPeriods
    ]);
    const allResponse = await api.get('/periods');
    setAllPeriods(allResponse.data.data || []);
  };

  const persistWorkflowStep = async (stepId, files, selectedYear, selectedMonth, financialManual = {}, portfolioManual = {}) => {
    let period = periods.find(item => String(item.clientRuc) === String(timelineClient?.ruc) && String(item.year) === String(selectedYear) && String(item.month) === String(selectedMonth));
    try {
      if (!period) {
        const monthNumber = MONTHS.findIndex(item => item.name === selectedMonth) + 1;
        await api.post('/periods/single', { year: Number(selectedYear), month: monthNumber, clientId: timelineClient.id }).catch(error => { if (error?.response?.status !== 409) throw error; });
        const response = await api.get('/periods', { params: { year: String(selectedYear), clientId: timelineClient.id } });
        const createdPeriods = response.data.data || [];
        setPeriods(current => [...current.filter(item => String(item.year) !== String(selectedYear) || String(item.clientRuc) !== String(timelineClient.ruc)), ...createdPeriods]);
        period = createdPeriods.find(item => String(item.month) === String(selectedMonth));
      }
      if (!period) throw new Error('No existe el periodo seleccionado.');
      if (stepId === 'completado') {
        const response = await api.patch(`/periods/${period.id}`, { status: 'Completado' });
        setPeriods(current => current.map(item => String(item.id) === String(period.id) ? response.data.data : item));
        return true;
      }
      if (stepId === 'estados' || stepId === 'cxc') {
        const types = stepId === 'estados' ? ['balance', 'results', 'equity', 'cashflow', 'notes'] : ['receivable', 'payable'];
        for (const type of types) {
          if (!files[type]) continue;
          const formData = new FormData();
          formData.append('files', files[type]);
          if (stepId === 'cxc') {
            const portfolioForm = new FormData();
            portfolioForm.append('file', files[type]);
            portfolioForm.append('accountType', type === 'receivable' ? 'CXC' : 'CXP');
            if (portfolioManual[type]) portfolioForm.append('manualValues', JSON.stringify(portfolioManual[type]));
            await api.post(`/periods/${period.id}/portfolio/import`, portfolioForm);
          } else {
            formData.append('group', 'Financial Statements');
            formData.append('types', type);
            if (financialManual[type]) formData.append('manualValues', JSON.stringify(financialManual[type]));
            await api.post(`/periods/${period.id}/documents`, formData);
          }
        }
        if (stepId === 'cxc') await api.patch(`/periods/${period.id}/steps/portfolio`);
      }
      if (stepId === 'declaraciones') {
        if (workflowIvaValue === '') return alert('Registra el valor de IVA.');
        const formData = new FormData();
        formData.append('iva', workflowIvaValue); formData.append('retentions', workflowRetentionValue || '0');
        if (files.iva) formData.append('ivaFile', files.iva);
        if (files.retentions) formData.append('retentionFile', files.retentions);
        await api.post(`/periods/${period.id}/declaration`, formData);
      }
      return true;
    } catch (error) {
      setWorkflowMessage(error?.response?.data?.error || error?.message || 'No se pudo guardar el paso.');
      return false;
    }
  };
  const persistWorkflowSelection = async (selectedYear, selectedMonth) => {
    const monthNumber = MONTHS.findIndex(item => item.name === selectedMonth) + 1;
    try {
      const { data } = await api.post('/periods/single', { clientId: timelineClient.id, year: Number(selectedYear), month: monthNumber });
      setPeriods(current => [...current.filter(item => String(item.id) !== String(data.data.id)), data.data]);
      return true;
    } catch (error) { alert(error?.response?.data?.error || 'No se pudo guardar el periodo mensual.'); return false; }
  };

  const restoreClient = async (client) => {
    try {
      await api.patch(`/clients/${client.id}/restore`);
      const { data } = await api.get('/clients');
      setClientList(data.data || []);
      setDisabledClients(current => current.filter(item => item.id !== client.id));
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo reactivar el cliente.');
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Aunque el backend no responda, se limpia la sesión local.
    }
    setSearch('');
    setShowModal(false);
    setEditingClient(null);
    setUser(null);
    // Reemplaza la entrada actual para no volver al dashboard con Atrás.
    navigate('/login', { replace: true });
  };

  const handleNavigation = (label) => {
    navigate(modulePaths[label] || '/dashboard');
  };

  if (checkingSession) return <main className="login-page"><div style={{ margin: '24px auto', color: '#252566', fontWeight: 700 }}>Verificando sesión...</div></main>;
  const handleLoginSuccess = async (authenticatedUser) => {
    // Confirmar la sesión usando la cookie accessToken recién creada.
    try {
      const meResponse = await api.get('/auth/me');
      setUser(meResponse.data?.user || authenticatedUser);
    } catch {
      setUser(authenticatedUser);
    }
    navigate('/clientes', { replace: true });
  };

  if (!user) return <Login onLogin={handleLoginSuccess} />;
  const timelineRoute = location.pathname.startsWith('/clientes/cronograma/');

  return (
    <RequireAuth>
    <WORKFLOW_CONTEXT.Provider value={{ completed: workflowCompleted, setCompleted: setWorkflowCompleted, active: workflowActive, setActive: setWorkflowActive, selectedYear: workflowYear, setSelectedYear: setWorkflowYear, selectedMonth: workflowMonth, setSelectedMonth: setWorkflowMonth, files: workflowFiles, setFiles: setWorkflowFiles, ivaValue: workflowIvaValue, setIvaValue: setWorkflowIvaValue, retentionValue: workflowRetentionValue, setRetentionValue: setWorkflowRetentionValue, employeeExpense: workflowEmployeeExpense, setEmployeeExpense: setWorkflowEmployeeExpense }}>
    <div className="app-shell">
      {false && <aside className="sidebar">
        <div className="brand">
          <img className="sidebar-logo" src="/logo-21.png" alt="Contamatic" />
        </div>
        <div className="workspace">OFICINA CONTABLE</div>
        <nav>
          {visibleNav.map(([label, icon]) => (
            <button key={label} className={active === label ? 'active' : ''} onClick={() => handleNavigation(label)}>
              <Icon name={icon}/>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="user-mini">
            <div className="header-user">
              <span className="header-user-name">{userName}</span>
              <div className="avatar">{userInitials}</div>
              <button type="button" className="header-logout" onClick={handleLogout} title="Cerrar sesión">↪</button>
            </div>
            <div>
              <strong>{userName}</strong>
              <small>{userReference}</small>
            </div>
            <button className="logout" onClick={handleLogout} title="Cerrar sesión">↪</button>
          </div>
        </div>
      </aside>}

      <main className="main main-fullscreen">
        <header>
          <img className="header-logo" src="/logo-21.png" alt="Contamatic" />
          <div className="crumb">
            <span>Vista general</span>
            <h1>{active} · {userRole}</h1>
          </div>
          <div className="header-actions">
            {!CLIENTS_ONLY_MODE && isGlobalClientFilterEnabled && <label className="global-client-filter">
              <span>Cliente general</span>
              <select value={globalClientRuc} onChange={event => setGlobalClientRuc(event.target.value)}>
                <option value="">Todos los clientes</option>
                {clientList.map(client => <option key={client.ruc} value={client.ruc}>{client.name} · {client.ruc}</option>)}
              </select>
              {globalClient && <button type="button" className="clear-global-client" onClick={() => setGlobalClientRuc('')} title="Quitar filtro de cliente">×</button>}
            </label>}
            <div className="header-user">
              <span className="header-user-name">{userName}</span>
              <div className="avatar">{userInitials}</div>
              <button type="button" className="header-logout" onClick={handleLogout} title="Cerrar sesión">↪</button>
            </div>
          </div>
        </header>

        {/* React Router decide qué módulo mostrar según la URL actual. */}
        <Routes>
          {/* Cada Route relaciona una dirección con un componente. */}
          {!CLIENTS_ONLY_MODE && <Route path="/dashboard" element={<PermissionGate allowed={can('dashboard.read')}><Dashboard search={search} setSearch={setSearch} clients={clientsForModules} generalTotals={generalPeriodTotals} setShowModal={handleOpenCreateModal} canCreateClient={can('client.create')} isAdmin={userRole === 'ADMIN'} year={year} availableYears={availableYears} globalClientRuc={globalClientRuc}/></PermissionGate>} />}
          <Route path="/clientes/*" element={<PermissionGate allowed={can('client.read')}><ClientsModule clients={filteredForModules} periods={periods} search={search} setSearch={setSearch} onOpenCreate={handleOpenCreateModal} onEditClient={handleOpenEditModal} onDeleteClient={setClientToDisable} isAdmin={userRole === 'ADMIN'} year={year} timelineClient={timelineClient} onOpenTimeline={handleOpenTimeline} onCloseTimeline={handleCloseTimeline} onPersistStep={persistWorkflowStep} onPersistSelection={persistWorkflowSelection} onCreatePeriodForClient={createPeriodForClient} /></PermissionGate>} />
           <Route path="/historial" element={<PermissionGate allowed={can('client.read')}><ClientHistoryPage clients={clientsForModules} year={year} onClose={handleCloseTimeline} onOpenPeriodEntry={createPeriodForClient} onOpenTimeline={handleOpenTimeline} /></PermissionGate>} />
          <Route path="/detalle-impuesto-renta" element={<PermissionGate allowed={can('client.read')}><AnnualIncomeTaxDetailPage clients={clientsForModules} year={year} onClose={handleCloseTimeline} /></PermissionGate>} />
          {!CLIENTS_ONLY_MODE && <Route path="/periodos-contables" element={<PermissionGate allowed={can('period.read')}><PeriodsModule clients={clientsForModules} periods={periods} year={year} setYear={setYear} availableYears={availableYears} onUpdateStatus={handleUpdatePeriodStatus} onCreateYear={handleCreateFiscalYear} onRefreshYear={refreshPeriodsForYear} periodRecords={periodRecords} onUpdateRecord={record => { setPeriodRecords(current => current.map(item => item.id === record.id ? record : item)); setPeriods(current => current.map(item => item.id === record.id ? record : item)); }} isAdmin={userRole === 'ADMIN'} globalClientRuc={globalClientRuc} /></PermissionGate>} />}
          {!CLIENTS_ONLY_MODE && <Route path="/configuracion" element={<PermissionGate allowed={can('client.read')}><ConfigurationModule clients={disabledClients} onRestore={restoreClient} canAudit={can('audit.read')} userRole={userRole} /></PermissionGate>} />}
          {!CLIENTS_ONLY_MODE && <Route path="/estados-financieros" element={<PermissionGate allowed={can('document.read')}><FinancialStatementsModule clients={clientsForModules} year={year} isAdmin={userRole === 'ADMIN'} globalClientRuc={globalClientRuc} /></PermissionGate>} />}
          {!CLIENTS_ONLY_MODE && <Route path="/cxc-cxp" element={<PermissionGate allowed={can('document.read')}><FinancialStatementsModule clients={clientsForModules} year={year} documentGroup="Portfolio" moduleTitle="Cuentas por Cobrar y Pagar" clientActionLabel="Ver cartera" moduleRoute="/cxc-cxp" isAdmin={userRole === 'ADMIN'} globalClientRuc={globalClientRuc} /></PermissionGate>} />}
          {!CLIENTS_ONLY_MODE && <Route path="/declaraciones" element={<PermissionGate allowed={can('declaration.manage')}><DeclarationsPage clients={clientsForModules} year={year} isAdmin={userRole === 'ADMIN'} globalClientRuc={globalClientRuc} /></PermissionGate>} />}
          {/* Cualquier URL desconocida vuelve al dashboard. */}
          <Route path="*" element={<Navigate to="/clientes" replace />} />
        </Routes>
      </main>

      {showModal && (
        <ClientModal 
          onClose={() => { setShowModal(false); setEditingClient(null); }} 
          onSave={saveClient}
          clientToEdit={editingClient}
          clients={clientList}
          isAdmin={userRole === 'ADMIN'}
          assignableUsers={assignableUsers}
        />
      )}
      {clientToDisable && (
        <DisableClientModal
          client={clientToDisable}
          onClose={() => setClientToDisable(null)}
          onConfirm={() => deleteClient(clientToDisable)}
        />
      )}
      {workflowMessage && (
        <div className="workflow-message-backdrop" role="presentation" onMouseDown={() => setWorkflowMessage('')}>
          <section className="workflow-message-modal" role="alertdialog" aria-modal="true" aria-labelledby="workflow-message-title" onMouseDown={event => event.stopPropagation()}>
            <div className="workflow-message-icon">!</div>
            <div className="workflow-message-content">
              <h3 id="workflow-message-title">Documento no válido</h3>
              <p>{workflowMessage}</p>
            </div>
            <button type="button" className="workflow-message-button" onClick={() => setWorkflowMessage('')}>Aceptar</button>
          </section>
        </div>
      )}
    </div>
    </WORKFLOW_CONTEXT.Provider>
    </RequireAuth>
  );
}

function Dashboard({ search, setSearch, clients, generalTotals = { completed: 0, total: 0, pending: 0, compliance: 0 }, setShowModal, canCreateClient = false, isAdmin = false, year, availableYears = [], globalClientRuc = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedAssignedUser, setSelectedAssignedUser] = useState('');
  const assignedUsers = useMemo(() => Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort(), [clients]);
  const selectedUserClients = useMemo(() => selectedAssignedUser ? clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedAssignedUser) : [], [clients, selectedAssignedUser]);
  const [selectedClientDashboard, setSelectedClientDashboard] = useState(null);
  const [clientDashboard, setClientDashboard] = useState(null);
  const [loadingClientDashboard, setLoadingClientDashboard] = useState(false);
  const [dashboardYear, setDashboardYear] = useState('');
  const [readAlerts, setReadAlerts] = useState(new Set());
  const [incomeTaxPeriodicity, setIncomeTaxPeriodicity] = useState('Anual');
  const clientDashboardRef = useRef(null);
  const totalCompleted = generalTotals.completed;
  const totalPeriodsCount = generalTotals.total;
  const compliancePct = generalTotals.compliance;
  const authenticatedName = user?.nombre || user?.name || user?.username || 'Usuario';

  // El detalle del dashboard debe iniciar con el año global seleccionado.
  useEffect(() => {
    if (!dashboardYear && year) setDashboardYear(String(year));
  }, [year, dashboardYear]);

  useEffect(() => {
    if (!selectedClientDashboard?.id || !dashboardYear) return;
    api.get(`/clients/${selectedClientDashboard.id}/income-tax/${dashboardYear}`)
      .then(({ data }) => setIncomeTaxPeriodicity(data.data?.configuration?.periodicity || 'Anual'))
      .catch(() => setIncomeTaxPeriodicity('Anual'));
  }, [selectedClientDashboard?.id, dashboardYear]);

  useEffect(() => {
    if (!selectedClientDashboard) return;
    const timer = window.setTimeout(() => clientDashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return () => window.clearTimeout(timer);
  }, [selectedClientDashboard]);

  const displayClientDashboard = useMemo(() => {
    if (!clientDashboard || incomeTaxPeriodicity !== 'Anual') return clientDashboard;
    const months = (clientDashboard.months || []).map(month => {
      const indicators = Object.fromEntries(Object.entries(month.indicators).filter(([key]) => key !== 'incomeTax'));
      const applicable = Object.values(indicators).filter(item => item.status !== 'no_aplica');
      const completed = applicable.filter(item => ['entregado', 'declarado', 'calculado'].includes(item.status)).length;
      return { ...month, compliancePercentage: applicable.length ? Math.round(completed / applicable.length * 100) : 100 };
    });
    const alerts = (clientDashboard.alerts || []).filter(alert => alert.indicator !== 'incomeTax');
    return { ...clientDashboard, months, alerts, summary: { ...clientDashboard.summary, compliancePercentage: months.length ? Math.round(months.reduce((sum, month) => sum + month.compliancePercentage, 0) / months.length) : 0, pendingAlerts: alerts.length } };
  }, [clientDashboard, incomeTaxPeriodicity]);

  const openClientDashboard = async client => {
    setSelectedClientDashboard(client);
    setClientDashboard(null);
    const selectedYear = dashboardYear || String(year);
    if (!selectedYear) return;
    setLoadingClientDashboard(true);
    try {
      const { data } = await api.get(`/dashboard/client/${client.id}`, { params: { year: selectedYear } });
       const dashboard = data.data;
        setClientDashboard(dashboard || null);
    } catch {
      setClientDashboard(null);
    } finally {
      setLoadingClientDashboard(false);
    }
  };

  useEffect(() => {
    if (selectedClientDashboard && dashboardYear) openClientDashboard(selectedClientDashboard);
  }, [dashboardYear]);

  // Abre automáticamente el cliente del filtro general cuando ya está
  // disponible en la lista recibida por el Dashboard.
  useEffect(() => {
    if (!globalClientRuc) {
      if (selectedClientDashboard) {
        setSelectedClientDashboard(null);
        setClientDashboard(null);
      }
      return;
    }
    const client = clients.find(item => String(item.ruc) === String(globalClientRuc));
    if (!client || selectedClientDashboard?.id === client.id) return;
    void openClientDashboard(client);
  }, [globalClientRuc, clients, year]);

  const indicatorLabels = { financialStatements: 'Estados Financieros', portfolio: 'CxC/CxP', iva: 'IVA', retentions: 'Retenciones', incomeTax: 'Impuesto a la Renta' };
  const alertKey = alert => `${alert.month}-${alert.indicator}`;
  const unreadAlerts = (displayClientDashboard?.alerts || []).filter(alert => !readAlerts.has(alertKey(alert)));
  const alertGroups = (displayClientDashboard?.alerts || []).reduce((groups, alert) => {
    (groups[alert.month] ||= []).push(alert);
    return groups;
  }, {});
  const clientsToDisplay = isAdmin && selectedAssignedUser ? selectedUserClients : clients;

  return (
    <div className="content">
      {false && <section className="welcome dashboard-welcome">
        <div>
          <h2>Contador, {authenticatedName} <span></span></h2>
          <p>Este es el estado de los reportes contables de tus clientes.</p>
        </div>
        <div className="dashboard-welcome-side">
          <div className="dashboard-year-pill"><span className="pulse-dot"/> Año fiscal <strong>{year}</strong></div>
        {canCreateClient && <button className="primary" onClick={() => setShowModal(true)}>
          <Icon name="plus" size={18}/> Nuevo cliente
        </button>}
        </div>
      </section>}

      {false && <section className="metrics dashboard-metrics">
        <Metric icon="users" title="Clientes activos" value={clients.length} note="+4 este año" tone="violet"/>
        <Metric icon="calendar" title="Periodos al día" value={totalCompleted} note={`${compliancePct}% del total`} tone="blue"/>
        <Metric icon="file" title="Periodos pendientes" value={totalPeriodsCount - totalCompleted} note="Requieren atención" tone="orange"/>
      </section>}

      <section className="dashboard-status-strip">
        <div className="status-strip-icon"><Icon name="check" size={18}/></div>
        <div><strong>Tu operación está en movimiento</strong><p>{totalCompleted} de {totalPeriodsCount || 0} periodos registrados están al día este año.</p></div>
        <span className="status-strip-percent">{compliancePct}%</span>
      </section>

      {isAdmin && <section className="panel clients-panel admin-users-panel">
        <div className="panel-head"><div><h3>Usuarios / Contadores</h3><p>Selecciona un usuario para consultar los clientes que tiene asignados.</p></div></div>
        <div className="table-wrap">
          <table><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead>
            <tbody>{assignedUsers.map(userName => <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length}</td><td><button type="button" className="client-dashboard-btn" onClick={() => { setSelectedAssignedUser(userName); window.setTimeout(() => document.getElementById('dashboard-assigned-clients')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>)}</tbody>
          </table>
          {!assignedUsers.length && <div className="empty">No hay usuarios con clientes asignados.</div>}
        </div>
      </section>}

      {(!isAdmin || selectedAssignedUser) && <section id="dashboard-assigned-clients" className="dashboard-grid">
        <div className="panel clients-panel">
          <div className="panel-head">
            <div>
              <h3>{isAdmin && selectedAssignedUser ? `Clientes de ${selectedAssignedUser}` : 'Clientes'}</h3>
              <p>Selecciona un cliente para consultar su dashboard detallado.</p>
            </div>
          </div>
          <div className="search">
            <Icon name="search" size={18}/>
            <input placeholder="Buscar cliente o RUC..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {clientsToDisplay.map(c => (
                  <tr key={c.ruc}>
                    <td>
                      <strong>{c.name}</strong>
                      <small>RUC {c.ruc} · {c.owner}</small>
                    </td>
                    <td><button type="button" className="client-dashboard-btn" onClick={() => openClientDashboard(c)}><Icon name="grid" size={14}/> Ver dashboard <Icon name="arrow" size={14}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!clientsToDisplay.length && <div className="empty">No se encontraron clientes.</div>}
          </div>
        </div>
      </section>}

      {selectedClientDashboard && (
        <section ref={clientDashboardRef} className="panel client-dashboard-detail">
          <div className="panel-head">
            <div>
              <h3>Dashboard de {selectedClientDashboard.name}</h3>
              {clientDashboard?.demo && <small className="demo-dashboard-badge">Datos de demostración</small>}
            </div>
            <label className="dashboard-year-field dashboard-year-top">Año fiscal<select value={dashboardYear} onChange={event => { setDashboardYear(event.target.value); setClientDashboard(null); }}><option value="">Selecciona un año</option>{availableYears.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
            {clientDashboard?.alerts?.length > 0 && <div className="dashboard-notifications"><button type="button" className="notification-bell" title="Ver alertas"><span>🔔</span>{unreadAlerts.length > 0 && <b>{unreadAlerts.length}</b>}</button><div className="notification-popover"><div className="notification-title"><strong>Alertas pendientes</strong><button type="button" onClick={() => setReadAlerts(new Set(clientDashboard.alerts.map(alertKey)))}>Marcar todas</button></div>{Object.entries(alertGroups).map(([month, alerts]) => <div className="notification-group" key={month}><em>{month}</em>{alerts.slice(0, 3).map((alert, index) => <div className={`notification-item ${readAlerts.has(alertKey(alert)) ? 'is-read' : ''}`} key={`${alert.indicator}-${index}`}><span>⚠️ {indicatorLabels[alert.indicator] || alert.indicator}</span><div className="notification-actions"><button type="button" onClick={() => navigate(`/periodos-contables?client=${selectedClientDashboard.ruc}&year=${dashboardYear}&month=${encodeURIComponent(alert.month)}`)}>Ver periodo</button><button type="button" onClick={() => setReadAlerts(current => new Set([...current, alertKey(alert)]))}>{readAlerts.has(alertKey(alert)) ? 'Leída' : 'Marcar leída'}</button></div></div>)}</div>)}</div></div>}
          </div>
          {!dashboardYear && <div className="empty">Selecciona un año para cargar el dashboard del cliente.</div>}
          {loadingClientDashboard && <div className="empty">Cargando indicadores...</div>}
          {!loadingClientDashboard && displayClientDashboard && <>
            <div className="metrics">
              <div className={`client-summary-metric ${displayClientDashboard.summary.compliancePercentage > 80 ? 'is-good' : displayClientDashboard.summary.compliancePercentage >= 40 ? 'is-warning' : 'is-danger'}`}><Metric icon="shield" title="Cumplimiento" value={`${displayClientDashboard.summary.compliancePercentage}%`} note="Promedio anual" tone="green"/></div>
              <Metric icon="calendar" title="Meses evaluados" value={displayClientDashboard.summary.totalMonths} note="Periodo fiscal" tone="blue"/>
              <Metric icon="alert" title="Pendientes" value={displayClientDashboard.summary.pendingAlerts} note="Requieren atención" tone="orange"/>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>MES</th><th>ESTADOS FINANCIEROS</th><th>CXC/CXP</th><th>IVA</th><th>RETENCIONES</th><th>RENTA</th><th>CUMPLIMIENTO</th></tr></thead>
                 <tbody>{displayClientDashboard.months.map(month => <tr key={month.periodId}>
                  <td><strong>{month.month}</strong></td>
                  <td><span className={`status-badge ${month.indicators.financialStatements.status === 'entregado' ? 'status-success' : 'status-warning'}`}>{month.indicators.financialStatements.status === 'entregado' ? <>Entregado <sup>v{month.indicators.financialStatements.version}</sup></> : 'Pendiente'}</span></td>
                  <td><span className={`status-badge ${month.indicators.portfolio.status === 'entregado' ? 'status-success' : 'status-warning'}`}>{month.indicators.portfolio.status === 'entregado' ? <>Entregado <sup>v{month.indicators.portfolio.version}</sup></> : 'Pendiente'}</span></td>
                  <td><span className={`status-badge ${month.indicators.iva.status === 'declarado' ? 'status-success' : 'status-warning'}`}>{month.indicators.iva.status === 'declarado' ? `Declarado · $${month.indicators.iva.amount.toFixed(2)}` : 'Pendiente'}</span></td>
                  <td><span className={`status-badge ${month.indicators.retentions.status === 'declarado' ? 'status-success' : 'status-warning'}`}>{month.indicators.retentions.status === 'declarado' ? `Declarado · $${month.indicators.retentions.amount.toFixed(2)}` : 'Pendiente'}</span></td>
                   <td><span className={`status-badge ${month.indicators.incomeTax.status === 'presentada' || month.indicators.incomeTax.status === 'calculado' ? 'status-success' : month.indicators.incomeTax.status === 'no_aplica' || month.indicators.incomeTax.status === 'acumulando' ? 'status-neutral' : 'status-warning'}`}>{month.indicators.incomeTax.status === 'presentada' ? 'Presentada' : month.indicators.incomeTax.status === 'calculado' ? 'Calculada' : month.indicators.incomeTax.status === 'no_aplica' ? 'No aplica' : month.indicators.incomeTax.status === 'acumulando' ? 'Acumulando' : 'Pendiente'}</span></td>
                  <td><div className={`compliance-cell ${month.compliancePercentage > 80 ? 'is-good' : month.compliancePercentage >= 40 ? 'is-warning' : 'is-danger'}`}><span className="compliance-track"><i style={{width: `${month.compliancePercentage}%`}}/></span><strong>{month.compliancePercentage}%</strong></div></td>
                </tr>)}</tbody>
              </table>
            </div>
          </>}
        </section>
      )}
    </div>
  );
}

function ClientsModule({ clients, periods = [], search, setSearch, onOpenCreate, onEditClient, onDeleteClient, isAdmin = false, year, timelineClient, onOpenTimeline, onCloseTimeline, onPersistStep, onPersistSelection, onCreatePeriodForClient }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const workflow = useContext(WORKFLOW_CONTEXT);
  const authenticatedName = user?.nombre || user?.name || user?.username || 'Usuario';
  const [selectedUser, setSelectedUser] = useState('');
  const [periodModalClient, setPeriodModalClient] = useState(null);
  const [newPeriodClient, setNewPeriodClient] = useState(null);
  const [newPeriodYear, setNewPeriodYear] = useState(String(year || '2026'));
  const [newPeriodMonth, setNewPeriodMonth] = useState('Enero');
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [periodError, setPeriodError] = useState('');
  const [periodModalPeriods, setPeriodModalPeriods] = useState([]);
  const [periodModalYear, setPeriodModalYear] = useState(String(year || '2026'));
  const [openActionsClient, setOpenActionsClient] = useState(null);
  const [clientPage, setClientPage] = useState(1);
  useEffect(() => {
    if (selectedUser) window.setTimeout(() => document.getElementById('assigned-clients-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [selectedUser]);
  useEffect(() => {
    const closeActionsMenu = event => {
      if (!event.target.closest('.client-actions-menu')) setOpenActionsClient(null);
    };
    document.addEventListener('mousedown', closeActionsMenu);
    return () => document.removeEventListener('mousedown', closeActionsMenu);
  }, []);
  const assignedUsers = Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort();
  const selectedUserClients = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedUser);
  const clientsForTable = isAdmin ? selectedUserClients : clients;
  const clientsPerPage = 10;
  const totalClientPages = Math.max(1, Math.ceil(clientsForTable.length / clientsPerPage));
  const visibleClients = clientsForTable.slice((clientPage - 1) * clientsPerPage, clientPage * clientsPerPage);
  useEffect(() => { setClientPage(1); }, [search, selectedUser]);
  useEffect(() => { setClientPage(current => Math.min(current, totalClientPages)); }, [totalClientPages]);
  const matchesClient = (period, client) => String(period.clientId) === String(client?.id)
    || String(period.clientRuc) === String(client?.ruc);
  const clientPeriods = periodModalClient ? periodModalPeriods : [];
  const openPeriodModal = async client => {
    setPeriodModalClient(client);
    setPeriodModalYear(String(year || '2026'));
    setPeriodError('');
    const cachedPeriods = periods.filter(period => matchesClient(period, client));
    setPeriodModalPeriods(cachedPeriods);
    try {
      const { data } = await api.get('/periods', { params: { clientId: client.id } });
      const loadedPeriods = (data.data || []).filter(period => matchesClient(period, client));
      setPeriodModalPeriods(loadedPeriods);
    } catch {
      // Conserva la información disponible en memoria si la consulta falla.
    }
  };
  useEffect(() => {
    const modal = document.querySelector('.period-picker-modal');
    const list = modal?.querySelector('.period-picker-list');
    if (!modal || !list) return;
    const years = Array.from(new Set(clientPeriods.map(period => String(period.year)))).sort((a, b) => Number(b) - Number(a));
    let label = modal.querySelector('.period-modal-year-filter');
    if (!label) { label = document.createElement('label'); label.className = 'history-year-filter period-modal-year-filter'; label.textContent = 'Año fiscal '; modal.insertBefore(label, list); }
    let select = label.querySelector('select');
    if (!select) { select = document.createElement('select'); select.onchange = event => setPeriodModalYear(event.target.value); label.appendChild(select); }
    select.innerHTML = '';
    years.forEach(item => { const option = document.createElement('option'); option.value = item; option.textContent = item; select.appendChild(option); });
    if (years.length && !years.includes(String(periodModalYear))) { setPeriodModalYear(years[0]); select.value = years[0]; } else select.value = periodModalYear;
    Array.from(list.querySelectorAll('.period-picker-row')).forEach(row => { row.style.display = row.textContent.trim().startsWith(`${periodModalYear} ·`) ? '' : 'none'; });
  }, [periodModalClient, clientPeriods, periodModalYear]);
  useEffect(() => {
    const list = document.querySelector('.period-picker-modal .period-picker-list');
    if (!list) return;
    Array.from(list.querySelectorAll('.period-picker-row')).forEach(row => { row.style.display = row.textContent.trim().startsWith(`${periodModalYear} ·`) ? '' : 'none'; });
  }, [periodModalYear, clientPeriods]);
  const submitNewPeriod = async event => {
    event.preventDefault();
    if (!newPeriodClient || creatingPeriod) return;
    setCreatingPeriod(true);
    const created = await onCreatePeriodForClient(newPeriodClient, newPeriodYear, newPeriodMonth, setPeriodError);
    setCreatingPeriod(false);
    if (created) setNewPeriodClient(null);
  };
  return (
    <div className="content clients-module">
      {!timelineClient && <section className="welcome dashboard-welcome">
        <div>
          <h2>Contador: {authenticatedName} <span></span></h2>
          <p>Administra la información y configuración tributaria de cada cliente.</p>
        </div>
        <div className="dashboard-welcome-side">
          <div className="dashboard-year-pill"><span className="pulse-dot"/> Año fiscal <strong>{year}</strong></div>
          <button className="primary" onClick={onOpenCreate}><Icon name="plus" size={18}/> Nuevo cliente</button>
        </div>
      </section>}
      {false && <section className="welcome">
        <div>
          <p className="eyebrow">CLIENTES</p>
          <h2>Clientes</h2>
          <p>Administra la información y configuración tributaria de cada cliente.</p>
        </div>  
        <button className="primary" onClick={onOpenCreate}>
          <Icon name="plus" size={18}/> Nuevo cliente
        </button>
      </section>}

      {!timelineClient && isAdmin && <section className="panel clients-registry">
        <div className="panel-head"><div><h3>Usuarios / Contadores</h3><p>Selecciona un usuario para consultar sus clientes asignados.</p></div></div>
        <div className="table-wrap"><table className="client-table"><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead><tbody>{assignedUsers.map(userName => { const count = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length; return <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{count}</td><td><button type="button" className="client-dashboard-btn" onClick={() => setSelectedUser(userName)}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>; })}</tbody></table>{!assignedUsers.length && <div className="empty">No hay usuarios con clientes asignados.</div>}</div>
      </section>}

      {!timelineClient && (!isAdmin || selectedUser) && <section id="assigned-clients-section" className="panel clients-registry">
        <div className="panel-head">
          <div>
            <h3>Registro de clientes</h3>
            <p>Información general, contacto y tributación</p>
          </div>
        </div>
        <div className="search">
          <Icon name="search" size={18}/>
          <input placeholder="Buscar por razón social, responsable o RUC..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="table-wrap">
          <table className="client-table">
            <thead>
              <tr>
                <th>RAZÓN SOCIAL</th>
                <th>RUC</th>
                <th>RESPONSABLE / CONTACTO</th>
                <th>CONFIGURACIÓN TRIBUTARIA</th>
                <th>ESTADO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {visibleClients.map(client => (
                <tr key={client.ruc}>
                  <td>
                    <strong>{client.name}</strong>
                    <small>{client.email || 'Sin correo registrado'}</small>
                  </td>
                  <td>{client.ruc}</td>
                  <td>
                    <strong>{client.owner}</strong>
                    <small>{client.phone || 'Sin teléfono registrado'}</small>
                  </td>
                  <td>
                    <strong>{client.taxRegime || 'Régimen general'}</strong>
                    <small>{client.accounting === 'No' ? 'No obligado a llevar contabilidad' : 'Obligado a llevar contabilidad'}</small>
                  </td>
                  <td>
                    <em className={`badge ${client.clientStatus === 'Inactivo' ? 'orange' : 'green'}`}>
                      {client.clientStatus || 'Activo'}
                    </em>
                  </td>
                  <td className="client-actions-cell">
                    <div className="client-actions-menu">
                      <button type="button" className="client-actions-trigger" aria-label={`Acciones para ${client.name}`} aria-expanded={openActionsClient === client.id} onClick={() => setOpenActionsClient(current => current === client.id ? null : client.id)}>
                        <Icon name="settings" size={17}/>
                      </button>
                      {openActionsClient === client.id && <div className="client-actions-dropdown" role="menu">
                      <button className="edit-btn" onClick={() => { setOpenActionsClient(null); onEditClient(client); }} title="Editar datos del cliente">
                        <Icon name="edit" size={14}/> Editar
                      </button>
                      <button type="button" className="client-dashboard-btn" onClick={() => { setOpenActionsClient(null); openPeriodModal(client); }}><Icon name="calendar" size={14}/>Ingresar Información </button>
                      <button type="button" className="history-btn" onClick={() => { setOpenActionsClient(null); navigate(`/historial?client=${encodeURIComponent(client.id)}&year=${year}`); }}><i className="bi bi-info-circle" aria-hidden="true"/> Revisar información</button>
                      <button type="button" className="history-btn" onClick={() => { setOpenActionsClient(null); navigate(`/detalle-impuesto-renta?client=${encodeURIComponent(client.id)}&year=${year}`); }}><i className="bi bi-bar-chart-line" aria-hidden="true"/> Detalle anual del impuesto</button>
                      <button className="delete-btn" onClick={() => { setOpenActionsClient(null); onDeleteClient(client); }} title="Deshabilitar cliente">
                        <Icon name="trash" size={14}/> Deshabilitar
                      </button>
                      </div>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
           {!clientsForTable.length && <div className="empty">No se encontraron clientes.</div>}
         </div>
         {clientsForTable.length > 0 && <div className="clients-pagination" aria-label="Paginación de clientes">
           <span>Mostrando {((clientPage - 1) * clientsPerPage) + 1}-{Math.min(clientPage * clientsPerPage, clientsForTable.length)} de {clientsForTable.length} registros</span>
           <div className="clients-pagination-actions">
             <button type="button" className="outline" onClick={() => setClientPage(current => Math.max(1, current - 1))} disabled={clientPage === 1}>Anterior</button>
             <span>Página {clientPage} de {totalClientPages}</span>
             <button type="button" className="outline" onClick={() => setClientPage(current => Math.min(totalClientPages, current + 1))} disabled={clientPage === totalClientPages}>Siguiente</button>
           </div>
         </div>}
       </section>}
      {periodModalClient && <div className="modal-backdrop" onMouseDown={() => setPeriodModalClient(null)}><section className="modal period-picker-modal" onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setPeriodModalClient(null)}><Icon name="close"/></button><p className="eyebrow">PERIODOS DEL CLIENTE</p><h2>{periodModalClient.name}</h2><p>Selecciona un periodo para continuar o crea uno nuevo.</p><div className="period-picker-list">{clientPeriods.length ? clientPeriods.map(period => <div className="period-picker-row" key={period.id}><div><strong>{period.year} · {period.month}</strong><small>{period.status}</small></div><button type="button" className="client-dashboard-btn" onClick={() => { setPeriodModalClient(null); onOpenTimeline(periodModalClient, period.year, period.month); }}>Continuar</button></div>) : <div className="empty">Este cliente todavía no tiene periodos creados.</div>}</div><div className="modal-actions"><button type="button" className="primary" onClick={() => { setNewPeriodClient(periodModalClient); setPeriodModalClient(null); setPeriodError(''); setNewPeriodYear(String(year || '2026')); setNewPeriodMonth('Enero'); }}><Icon name="plus" size={15}/> Crear periodo</button></div></section></div>}
      {newPeriodClient && <div className="modal-backdrop" onMouseDown={() => !creatingPeriod && setNewPeriodClient(null)}><form className="modal new-period-modal" onSubmit={submitNewPeriod} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setNewPeriodClient(null)}><Icon name="close"/></button><p className="eyebrow">NUEVO PERIODO</p><h2>{newPeriodClient.name}</h2><p>Selecciona el año y mes para crear el periodo.</p>{periodError && <div className="new-period-error" role="alert"><span>{periodError}</span></div>}<div className="form-grid"><label>Año fiscal<select value={newPeriodYear} onChange={event => { setNewPeriodYear(event.target.value); setPeriodError(''); }}>{Array.from({ length: 31 }, (_, index) => 2020 + index).map(item => <option key={item}>{item}</option>)}</select></label><label>Mes<select value={newPeriodMonth} onChange={event => { setNewPeriodMonth(event.target.value); setPeriodError(''); }}>{MONTHS.map(item => <option key={item.name}>{item.name}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="outline" onClick={() => setNewPeriodClient(null)}>Cancelar</button><button type="submit" className="primary" disabled={creatingPeriod}>{creatingPeriod ? 'Creando…' : 'Crear periodo'}</button></div></form></div>}
      {timelineClient && <section className="timeline-screen">
        <WorkflowTimeline client={timelineClient} year={year} showTimeline showAction onClose={onCloseTimeline} onPersistStep={onPersistStep} onPersistSelection={onPersistSelection} onCompletePeriod={() => navigate(`/historial?client=${encodeURIComponent(timelineClient.id)}&year=${encodeURIComponent(year)}`)}/>
      </section>}
    </div>
  );
}

function PeriodEntryModal({ client, year, onClose, onOpenPeriodEntry, onOpenTimeline }) {
  const [mode, setMode] = useState('picker');
  const [periods, setPeriods] = useState([]);
  const [selectedYear, setSelectedYear] = useState(String(year || '2026'));
  const [selectedMonth, setSelectedMonth] = useState('Enero');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/periods', { params: { clientId: client.id } }).then(({ data }) => setPeriods(data.data || [])).catch(() => setPeriods([])); }, [client.id]);
  const create = async event => { event.preventDefault(); if (creating) return; setCreating(true); setError(''); const created = await onOpenPeriodEntry(client, selectedYear, selectedMonth, setError); setCreating(false); if (created) onClose(); };
  const visiblePeriods = periods.filter(item => String(item.year) === String(selectedYear));
  return <div className="modal-backdrop" onMouseDown={() => !creating && onClose()}><section className="modal period-picker-modal" onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">PERIODOS DEL CLIENTE</p><h2>{client.name}</h2>{mode === 'picker' ? <><p>Selecciona un periodo para continuar o crea uno nuevo.</p><label className="history-year-filter period-modal-year-filter">Año fiscal<select value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>{Array.from(new Set([String(year || '2026'), ...periods.map(item => String(item.year))])).sort((a, b) => Number(b) - Number(a)).map(item => <option key={item}>{item}</option>)}</select></label><div className="period-picker-list">{visiblePeriods.length ? visiblePeriods.map(period => <div className="period-picker-row" key={period.id}><div><strong>{period.year} · {period.month}</strong><small>{period.status}</small></div><button type="button" className="client-dashboard-btn" onClick={() => { onClose(); onOpenTimeline(client, period.year, period.month); }}>Continuar</button></div>) : <div className="empty">Este cliente todavía no tiene periodos creados.</div>}</div><div className="modal-actions"><button type="button" className="primary" onClick={() => { setMode('create'); setError(''); }}><Icon name="plus" size={15}/> Crear periodo</button></div></> : <form onSubmit={create}><p>Selecciona el año y mes para crear el periodo.</p>{error && <div className="new-period-error" role="alert">{error}</div>}<div className="form-grid"><label>Año fiscal<select value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>{Array.from({ length: 31 }, (_, index) => 2020 + index).map(item => <option key={item}>{item}</option>)}</select></label><label>Mes<select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}>{MONTHS.map(item => <option key={item.name}>{item.name}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="outline" onClick={() => setMode('picker')}>Cancelar</button><button type="submit" className="primary" disabled={creating}>{creating ? 'Creando…' : 'Crear periodo'}</button></div></form>}</section></div>;
}

function ClientHistoryScreen({ client, year, onClose, onOpenAnnualTaxDetail, onOpenPeriodEntry, onOpenTimeline }) {
  const [periods, setPeriods] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [declarations, setDeclarations] = useState([]);
  const [accountSummary, setAccountSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(String(year));
  const [selectedHistoryMonths, setSelectedHistoryMonths] = useState([]);
  const [sentPeriodIds, setSentPeriodIds] = useState(new Set());
  const [sendingPeriodIds, setSendingPeriodIds] = useState(new Set());
  const [showPeriodEntry, setShowPeriodEntry] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/periods', { params: { clientId: client.id } }),
      api.get('/periods/documents', { params: { clientId: client.id } })
    ]).then(async ([periodResponse, documentResponse]) => {
      const loadedPeriods = periodResponse.data.data || [];
      const loadedDeclarations = await Promise.all(loadedPeriods.map(async period => {
        try { return { periodId: period.id, data: (await api.get(`/periods/${period.id}/declaration`)).data.data }; }
        catch { return { periodId: period.id, data: null }; }
      }));
      if (active) { setPeriods(loadedPeriods); setSentPeriodIds(new Set(loadedPeriods.filter(item => item.sharedAt).map(item => String(item.id)))); setDocuments(documentResponse.data.data || []); setDeclarations(loadedDeclarations); }
    }).catch(() => { if (active) { setPeriods([]); setDocuments([]); setDeclarations([]); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client.id]);
  const years = Array.from(new Set(periods.map(item => String(item.year)))).sort((a, b) => Number(b) - Number(a));
  useEffect(() => { if (years.length && !years.includes(String(selectedYear))) setSelectedYear(years[0]); }, [periods]);
  useEffect(() => {
    if (!client.id || !selectedYear) return;
    api.get(`/clients/${client.id}/portfolio/${selectedYear}/summary`)
      .then(({ data }) => setAccountSummary(data.data || []))
      .catch(() => setAccountSummary([]));
  }, [client.id, selectedYear]);
  const visiblePeriods = periods.filter(item => String(item.year) === String(selectedYear)).sort((a, b) => Number(a.monthNum) - Number(b.monthNum));
  const historyMonths = Array.from(new Set(visiblePeriods.map(item => item.month)));
  const displayedPeriods = selectedHistoryMonths.length ? visiblePeriods.filter(item => selectedHistoryMonths.includes(item.month)) : visiblePeriods;
  useEffect(() => { setSelectedHistoryMonths([]); }, [selectedYear]);
  const declarationByPeriod = new Map(declarations.map(item => [String(item.periodId), item.data]));
  const annual = displayedPeriods.map(period => declarationByPeriod.get(String(period.id))).filter(Boolean);
  const iva = annual.reduce((sum, item) => sum + Number(item.iva || 0), 0);
  const retentions = annual.reduce((sum, item) => sum + Number(item.retentions || 0), 0);
  useEffect(() => {
    const yearFilter = document.querySelector('.client-history-panel .history-year-filter');
    const table = document.querySelector('.client-history-panel .client-history-table');
    if (!yearFilter || !table) return;
    let monthFilter = yearFilter.parentElement?.querySelector('.history-month-filter');
    if (!monthFilter) {
      monthFilter = document.createElement('label');
      monthFilter.className = 'history-month-filter';
      yearFilter.parentElement?.appendChild(monthFilter);
    }
    monthFilter.innerHTML = `<span>MES</span><div class="history-month-checks"><label><input type="checkbox" data-month="Todos" ${selectedHistoryMonths.length === 0 ? 'checked' : ''}>Todos</label>${historyMonths.map(month => `<label><input type="checkbox" data-month="${month}" ${selectedHistoryMonths.includes(month) ? 'checked' : ''}>${month}</label>`).join('')}</div>`;
    monthFilter.style.display = 'none';
    monthFilter.querySelectorAll('input').forEach(input => input.addEventListener('change', event => {
      const value = event.target.dataset.month;
      if (value === 'Todos') setSelectedHistoryMonths([]);
      else setSelectedHistoryMonths(current => current.includes(value) ? current.filter(month => month !== value) : [...current, value]);
    }));
    table.querySelectorAll('tbody tr').forEach(row => {
      const monthCell = row.cells.length === 3 ? row.cells[0] : row.cells[1];
      const month = monthCell?.textContent?.trim();
      if (monthCell && month && !monthCell.querySelector('.history-row-month-check')) {
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'history-row-month-check';
        check.dataset.month = month;
        check.title = `Filtrar ${month}`;
        check.onchange = event => {
          const value = event.target.dataset.month;
          setSelectedHistoryMonths(current => event.target.checked
            ? [...new Set([...current, value])]
            : current.filter(item => item !== value));
        };
        monthCell.prepend(check);
      }
      const check = monthCell?.querySelector('.history-row-month-check');
      if (check) check.checked = selectedHistoryMonths.includes(month);
      row.style.display = '';
      row.classList.toggle('history-month-unselected', selectedHistoryMonths.length > 0 && !selectedHistoryMonths.includes(month));
    });
    return () => monthFilter?.remove();
  }, [selectedYear, selectedHistoryMonths, periods, sentPeriodIds]);
  useEffect(() => {
    const card = document.querySelector('.declaration-history-card');
    if (!card) return;
    const previous = card.querySelector('.iva-monthly-summary');
    previous?.remove();
    const monthly = displayedPeriods.map(period => ({ period, declaration: declarationByPeriod.get(String(period.id)) })).filter(item => item.declaration);
    const totalSales = monthly.reduce((sum, item) => sum + Number(item.declaration.ivaCosts ?? item.declaration.costs ?? 0), 0);
    const totalCosts = monthly.reduce((sum, item) => sum + Number(item.declaration.ivaValues ?? item.declaration.values ?? 0), 0);
    const utilityOf = declaration => Number(declaration.utility ?? (Number(declaration.ivaCosts ?? declaration.costs ?? 0) - Number(declaration.ivaValues ?? declaration.values ?? 0)));
    const totalUtility = monthly.reduce((sum, item) => sum + utilityOf(item.declaration), 0);
    const totalRetentions = monthly.reduce((sum, item) => sum + Number(item.declaration.retentions || 0), 0);
    const block = document.createElement('div');
    block.className = 'iva-monthly-summary';
    const amount = value => money(Number(value || 0));
    block.innerHTML = `${onOpenAnnualTaxDetail ? '<div class="client-history-annual-tax-action"><button type="button" class="primary client-history-tax-btn">Ver Impuesto a la Renta</button></div>' : ''}<h4>DeclaraciÃ³n de IVA</h4><div class="iva-monthly-totals"><div><small>Ventas acumuladas</small><strong>${amount(totalSales)}</strong></div><div><small>Costos y gastos acumulados</small><strong>${amount(totalCosts)}</strong></div></div><div class="iva-monthly-table"><div class="iva-monthly-row iva-monthly-head"><span>MES</span><span>VENTAS</span><span>COSTOS Y GASTOS</span></div>${monthly.map(({ period, declaration }) => `<div class="iva-monthly-row"><strong>${period.month}</strong><span>${amount(declaration.ivaCosts ?? declaration.costs)}</span><span>${amount(declaration.ivaValues ?? declaration.values)}</span></div>`).join('')}</div>`;
    block.querySelector('.client-history-tax-btn')?.addEventListener('click', onOpenAnnualTaxDetail);
    block.querySelector('h4').textContent = 'Declaración de IVA';
    const totalsBox = block.querySelector('.iva-monthly-totals');
    if (totalsBox) {
      totalsBox.insertAdjacentHTML('beforeend', `<div><small>Utilidad acumulada</small><strong>${amount(totalUtility)}</strong></div>`);
      totalsBox.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
      totalsBox.querySelectorAll('small').forEach(label => { label.style.fontSize = '11px'; label.style.fontWeight = '800'; });
      totalsBox.querySelectorAll('strong').forEach(value => { value.style.fontSize = '16px'; });
    }
    const monthlyTable = block.querySelector('.iva-monthly-table');
    if (monthlyTable) {
      const header = monthlyTable.querySelector('.iva-monthly-head');
      if (header) {
        header.innerHTML = '<span>MES</span><span>VENTAS</span><span>COSTOS Y GASTOS</span><span>UTILIDAD = VENTAS - COSTOS Y GASTOS</span>';
        header.style.fontSize = '12px';
        header.style.fontWeight = '800';
      }
      monthlyTable.querySelectorAll('.iva-monthly-row:not(.iva-monthly-head)').forEach((row, index) => {
        const declaration = monthly[index].declaration;
        row.innerHTML = `<strong>${monthly[index].period.month}</strong><span>${amount(declaration.ivaCosts ?? declaration.costs)}</span><span>${amount(declaration.ivaValues ?? declaration.values)}</span><span>${amount(utilityOf(declaration))}</span>`;
        row.querySelectorAll('span').forEach(span => { span.style.textAlign = 'right'; span.style.fontWeight = '700'; });
      });
      monthlyTable.insertAdjacentHTML('beforeend', `<div class="iva-monthly-row iva-monthly-total"><strong>TOTAL ANUAL</strong><span>${amount(totalSales)}</span><span>${amount(totalCosts)}</span><span>${amount(totalUtility)}</span></div>`);
    }
    const retentionSummary = document.createElement('div');
    retentionSummary.className = 'retention-monthly-summary';
    retentionSummary.innerHTML = `<h4>Retenciones</h4><div class="retention-monthly-totals"><div><small>Retenciones acumuladas</small><strong>${amount(totalRetentions)}</strong></div></div><div class="retention-monthly-table"><div class="iva-monthly-row iva-monthly-head"><span>MES</span><span>RETENCIONES</span></div>${monthly.map(({ period, declaration }) => `<div class="iva-monthly-row"><strong>${period.month}</strong><span>${amount(declaration.retentions)}</span></div>`).join('')}<div class="iva-monthly-row iva-monthly-total"><strong>TOTAL ANUAL</strong><span>${amount(totalRetentions)}</span></div></div>`;
    const detailList = document.createElement('div');
    detailList.className = 'iva-monthly-details';
    const retentionDetailList = document.createElement('div');
    retentionDetailList.className = 'iva-monthly-details retention-monthly-details';
    monthly.forEach(({ period, declaration }) => {
      const raw = declaration.ivaDetailRows;
      const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
      if (!Array.isArray(parsed) || !parsed.length) return;
      const details = document.createElement('details');
      details.dataset.periodId = String(period.id);
      const rows = parsed.map(row => {
        const fields = (row.fields || []).filter(field => Number(field.value) > 0);
        if (!fields.length) return '';
        return `<div class="iva-month-detail-row"><span>${row.label || 'Casillero'}</span><span>${fields.map(field => `${field.code}: ${amount(field.value)}`).join(' · ')}</span></div>`;
      }).join('');
      details.innerHTML = `<summary>Revisar detalle de ${period.month}</summary><div class="iva-month-detail-table"><div class="iva-month-detail-head"><span>DESCRIPCIÓN</span><span>CASILLEROS Y VALORES</span></div>${rows}</div>`;
      details.querySelector('.iva-month-detail-head').innerHTML = '<span>DESCRIPCIÓN</span><span>CASILLERO</span><span>VALOR</span><span>CASILLERO</span><span>VALOR</span><span>CASILLERO</span><span>VALOR</span>';
      details.querySelectorAll('.iva-month-detail-row').forEach(row => {
        const label = row.firstElementChild?.textContent || '';
        const values = row.lastElementChild?.textContent?.split(/\s*(?:·|Â·)\s*/) || [];
        row.innerHTML = `<span class="iva-month-detail-label">${label}</span>${values.flatMap(value => { const [code, ...rest] = value.split(':'); return code && rest.length ? [`<span class="iva-month-detail-code">${code.trim()}</span>`, `<span class="iva-month-detail-value">${rest.join(':').trim()}</span>`] : []; }).join('')}`;
      });
      const table = details.querySelector('.iva-month-detail-table');
      const validGroups = parsed.filter(row => (row.fields || []).some(field => Number(field.value) > 0) && !/factor de proporcionalidad/i.test(row.label || ''));
      const groupRow = row => `<div class="iva-history-form-row ${/^TOTAL (VENTAS Y OTRAS OPERACIONES|ADQUISICIONES Y PAGOS)$/i.test(row.label || '') ? 'iva-history-total-row' : ''}><span class="iva-history-label">${row.label || 'Casillero'}</span>${(row.fields || []).filter(field => Number(field.value) > 0).map(field => { const key = ['419', '519'].includes(String(field.code)); return `<span class="iva-history-code ${key ? 'iva-key-code' : ''}">${field.code}</span><span class="iva-history-value ${key ? 'iva-key-value' : ''}">${amount(field.value)}</span>`; }).join('')}</div>`;
      const section = (title, groups) => groups.length ? `<div class="iva-history-form-header"><span class="iva-history-title">${title}</span><span>VALOR BRUTO</span><span>VALOR NETO</span><span>IMPUESTO GENERADO</span></div>${groups.map(groupRow).join('')}` : '';
      const sales = validGroups.filter(row => Number(row.fields?.[0]?.code) >= 400 && Number(row.fields?.[0]?.code) < 480);
      const expenses = validGroups.filter(row => Number(row.fields?.[0]?.code) >= 500 && Number(row.fields?.[0]?.code) < 600);
      const expenseTotal = expenses.findIndex(row => /^TOTAL ADQUISICIONES Y PAGOS$/i.test(row.label || ''));
      table.className = 'iva-history-form-table';
      const retentionRaw = declaration.retentionDetailRows ?? declaration.retentionDetailGroups;
      const retentionParsed = typeof retentionRaw === 'string' ? (() => { try { return JSON.parse(retentionRaw); } catch { return []; } })() : retentionRaw;
      const retentionGroups = Array.isArray(retentionParsed) && retentionParsed[0]?.fields
        ? retentionParsed.filter(row => (row.fields || []).some(field => Number(field.value) > 0 || String(field.code) === '399 + 498'))
        : [];
      const retentionPair = field => field ? `<span class="retention-form-code">${field.code}</span><span class="retention-form-value">${field.value == null ? '' : amount(field.value)}</span>` : '<span></span><span></span>';
      const retentionRows = retentionGroups.map(row => {
        const fields = (row.fields || []).filter(field => Number(field.value) > 0 || String(field.code) === '399 + 498');
        const retainedOnly = fields.some(field => ['501', '902', '999'].includes(String(field.code)));
        const total = fields.some(field => ['499', '501', '902', '999'].includes(String(field.code)));
        return `<div class="retention-form-row ${total ? 'retention-total-row' : ''}"><span class="retention-form-label">${row.label || 'Casillero del formulario'}</span>${retentionPair(retainedOnly ? null : fields[0])}${retentionPair(retainedOnly ? fields[0] : fields[1])}</div>`;
      }).join('');
      const retentionTable = retentionRows ? `<div class="retention-history-section"><div class="retention-history-title">DETALLE DE RETENCIONES</div><div class="retention-form-table"><div class="retention-form-header"><span>DESCRIPCIÓN</span><span>BASE IMPONIBLE</span><span>VALOR RETENIDO</span></div>${retentionRows}</div></div>` : '';
      table.innerHTML = `${section('RESUMEN DE VENTAS Y OTRAS OPERACIONES DEL PERIODO QUE DECLARA', sales)}${section('RESUMEN DE ADQUISICIONES Y PAGOS DEL PERIODO QUE DECLARA', expenses.slice(0, expenseTotal >= 0 ? expenseTotal + 1 : expenses.length))}`;
      table.querySelectorAll('.iva-history-label,.retention-form-label').forEach(label => { label.textContent = repairDisplayText(label.textContent); });
      if (retentionRows) {
        const retentionDetails = document.createElement('details');
        retentionDetails.className = 'retention-monthly-detail';
        retentionDetails.dataset.periodId = String(period.id);
        retentionDetails.innerHTML = `<summary>Revisar detalle de ${period.month}</summary>${retentionTable}`;
        retentionDetails.querySelectorAll('.retention-form-label').forEach(label => { label.textContent = repairDisplayText(label.textContent); });
        retentionDetailList.appendChild(retentionDetails);
      }
      detailList.appendChild(details);
    });
    if (detailList.children.length) {
      block.appendChild(detailList);
      block.querySelectorAll('.iva-monthly-table .iva-monthly-row:not(.iva-monthly-head)').forEach((row, index) => {
        const period = monthly[index]?.period;
        const detail = period ? detailList.querySelector(`details[data-period-id="${period.id}"]`) : null;
        if (!detail) return;
        row.classList.add('iva-monthly-clickable');
        row.insertAdjacentElement('afterend', detail);
        row.addEventListener('click', () => { detail.open = !detail.open; });
      });
    }
    if (retentionDetailList.children.length) {
      retentionSummary.appendChild(retentionDetailList);
      retentionSummary.querySelectorAll('.retention-monthly-table .iva-monthly-row:not(.iva-monthly-head)').forEach((row, index) => {
        const period = monthly[index]?.period;
        const detail = period ? retentionDetailList.querySelector(`details[data-period-id="${period.id}"]`) : null;
        if (!detail) return;
        row.classList.add('iva-monthly-clickable');
        row.insertAdjacentElement('afterend', detail);
        row.addEventListener('click', () => { detail.open = !detail.open; });
      });
    }
    const retentionCard = document.createElement('section');
    retentionCard.className = 'panel retention-history-card';
    retentionCard.appendChild(retentionSummary);
    card.appendChild(block);
    card.insertAdjacentElement('afterend', retentionCard);
    return () => { block.querySelector('.client-history-tax-btn')?.removeEventListener('click', onOpenAnnualTaxDetail); block.remove(); retentionCard.remove(); };
  }, [displayedPeriods, declarations, selectedYear, onOpenAnnualTaxDetail]);
  const receivable = accountSummary.filter(item => item.accountType === 'CXC');
  const payable = accountSummary.filter(item => item.accountType === 'CXP');
  const accountTotal = items => items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const accountPending = items => items.reduce((sum, item) => sum + Number(item.pendingAmount || 0), 0);
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
  const openDocument = document => openProtectedDocument(document.periodId, document.id).catch(() => alert('No se pudo visualizar el documento.'));
  useEffect(() => {
    const card = document.querySelector('.declaration-history-card');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary history-entry-button';
    button.textContent = 'Ingresar información';
    button.onclick = () => setShowPeriodEntry(true);
    if (!card) return undefined;
    const action = card.querySelector('.client-history-annual-tax-action');
    if (action) action.prepend(button);
    else card.prepend(button);
    return () => button.remove();
  }, [declarations, displayedPeriods]);
  useEffect(() => {
    if (!showPeriodEntry) return undefined;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const modalRoot = createRoot(host);
    modalRoot.render(<PeriodEntryModal client={client} year={selectedYear} onClose={() => setShowPeriodEntry(false)} onOpenPeriodEntry={onOpenPeriodEntry} onOpenTimeline={onOpenTimeline} />);
    return () => { modalRoot.unmount(); host.remove(); };
  }, [showPeriodEntry, client, selectedYear, onOpenPeriodEntry, onOpenTimeline]);
  const askShareComment = () => new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'share-comment-overlay';
    overlay.innerHTML = `<div class="share-comment-modal" role="dialog" aria-modal="true" aria-labelledby="share-comment-title">
      <h3 id="share-comment-title">Enviar reporte por WhatsApp</h3>
      <p>Agrega un comentario para el cliente (opcional).</p>
      <textarea aria-label="Comentario para el cliente" placeholder="Escribe un comentario..."></textarea>
      <div class="share-comment-actions">
        <button type="button" data-share-cancel>Cancelar</button>
        <button type="button" data-share-confirm>Enviar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const textarea = overlay.querySelector('textarea');
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.querySelector('[data-share-cancel]')?.addEventListener('click', () => finish(null));
    overlay.querySelector('[data-share-confirm]')?.addEventListener('click', () => finish(textarea?.value.trim() || ''));
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) finish(null); });
    textarea?.focus();
  });
  const sendTestPeriod = async (periodId, button) => {
    const id = String(periodId || '');
    if (!id || sendingPeriodIds.has(id)) return;
    const comment = await askShareComment();
    if (comment === null) return;
    const whatsappWindow = window.open('', '_blank');
    setSendingPeriodIds(current => new Set([...current, id]));
    try {
      const response = await api.post(`/periods/${encodeURIComponent(id)}/share-pdf-link`, { comment });
      const token = response.data?.data?.token;
      if (!token) throw new Error('No se recibió el enlace de prueba.');
      const month = button.closest('tr')?.cells[0]?.textContent?.trim() || 'periodo';
      const link = `${window.location.origin}/api/public/share-pdf?token=${encodeURIComponent(token)}`;
      const rawPhone = String(client.phone || '').replace(/\D/g, '');
      const whatsappPhone = rawPhone ? (rawPhone.startsWith('0') ? `593${rawPhone.slice(1)}` : rawPhone) : '';
      const message = `Hola, puedes descargar el documento del periodo ${month} aquí: ${link}`;
      const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
      if (whatsappWindow) whatsappWindow.location.href = whatsappUrl;
      else window.location.assign(whatsappUrl);
      setSentPeriodIds(current => new Set([...current, id]));
      setPeriods(current => current.map(item => String(item.id) === id ? { ...item, sharedAt: new Date().toISOString() } : item));
    } catch (error) {
      whatsappWindow?.close();
      window.alert(error?.response?.data?.error || error.message || 'No se pudo generar el enlace de prueba.');
    } finally {
      setSendingPeriodIds(current => { const next = new Set(current); next.delete(id); return next; });
    }
  };
  useEffect(() => {
    const table = document.querySelector('.client-history-panel .client-history-table');
    if (!table) return;
    const head = table.querySelector('thead tr');
    if (head) head.innerHTML = '<th>MES</th><th>ESTADO</th><th>ENVÍO</th>';
    table.querySelectorAll('tbody tr').forEach((row, index) => {
      const sourcePeriod = visiblePeriods[index];
      if (sourcePeriod) {
        if (row.cells[0]) row.cells[0].textContent = sourcePeriod.year;
        if (row.cells[1]) row.cells[1].textContent = sourcePeriod.month;
        if (row.cells[2]) row.cells[2].textContent = sourcePeriod.status;
      }
      const month = row.cells[1]?.textContent?.trim() || '—';
      const status = sourcePeriod?.status || row.cells[2]?.textContent?.trim() || 'Pendiente';
      const normalizedStatus = String(status).trim().toLowerCase();
      const hasRequiredDocuments = Boolean(sourcePeriod?.documents?.financial && sourcePeriod?.documents?.accounts && sourcePeriod?.documents?.declarations);
      const isComplete = hasRequiredDocuments || (normalizedStatus !== '' && !normalizedStatus.includes('pendient') && !normalizedStatus.includes('proceso'));
      const periodId = visiblePeriods[index]?.id;
      const isSent = sentPeriodIds.has(String(periodId)) || Boolean(sourcePeriod?.sharedAt);
      const envio = isComplete ? (isSent ? 'Enviado' : 'Enviar') : '—';
      const envioClass = isSent ? 'sent' : isComplete ? 'to-send' : 'empty';
      row.innerHTML = `<td>${month}</td><td><em class="badge ${isComplete ? 'green' : 'orange'}">${status}</em></td><td class="history-send-cell">${isComplete && !isSent ? `<button type="button" class="history-send-status ${envioClass}" data-period-id="${periodId}">➤ ${envio}</button>` : `<span class="history-send-status ${envioClass}">${isSent ? '➤ Enviado' : envio}</span>`}${isSent ? '<small>sin abrir</small>' : ''}</td>`;
      if (isSent) {
        const sentButton = document.createElement('button');
        sentButton.type = 'button';
        sentButton.className = 'history-send-status sent';
        sentButton.disabled = true;
        sentButton.textContent = 'Enviado';
        row.querySelector('.history-send-cell .history-send-status')?.replaceWith(sentButton);
      }
      const monthCell = row.cells[0];
      const monthValue = sourcePeriod?.month || month;
      if (monthCell && !monthCell.querySelector('.history-row-month-check')) {
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'history-row-month-check';
        check.dataset.month = monthValue;
        check.title = `Filtrar ${monthValue}`;
        check.checked = selectedHistoryMonths.includes(monthValue);
        check.onchange = event => {
          const value = event.target.dataset.month;
          setSelectedHistoryMonths(current => event.target.checked
            ? [...new Set([...current, value])]
            : current.filter(item => item !== value));
        };
        monthCell.prepend(check);
      }
      const previewButton = document.createElement('button');
      previewButton.type = 'button';
      previewButton.className = 'history-send-status preview';
      previewButton.textContent = 'Ver PDF';
      previewButton.dataset.previewPeriodId = String(periodId || '');
      row.querySelector('.history-send-cell')?.prepend(previewButton);
      previewButton.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); void previewPeriodPdf(periodId); });
      row.querySelector('[data-period-id]')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); void sendTestPeriod(periodId, event.currentTarget); });
    });
    const wrap = table.closest('.table-wrap');
    wrap?.querySelector('.history-periods-legend')?.remove();
    wrap?.insertAdjacentHTML('beforeend', '<div class="history-periods-legend"><span>◷ Pendiente de enviar</span><span>➤ Enviado, sin abrir</span><span>ↄ Abierto por el cliente</span></div>');
  }, [visiblePeriods, selectedYear, sentPeriodIds]);
  useEffect(() => {
    const table = document.querySelector('.client-history-panel .client-history-table');
    if (!table) return undefined;
    const handleSend = async event => {
      const button = event.target.closest?.('[data-period-id]');
      if (!button || !table.contains(button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const periodId = String(button.dataset.periodId || '');
      if (!periodId || sendingPeriodIds.has(periodId)) return;
      const comment = await askShareComment();
      if (comment === null) return;
      const whatsappWindow = window.open('', '_blank');
      setSendingPeriodIds(current => new Set([...current, periodId]));
      try {
        const response = await api.post(`/periods/${encodeURIComponent(periodId)}/share-pdf-link`, { comment });
        const token = response.data?.data?.token;
        if (!token) throw new Error('No se recibió el enlace de prueba.');
        const month = button.closest('tr')?.cells[0]?.textContent?.trim() || 'periodo';
        const link = `${window.location.origin}/api/public/share-pdf?token=${encodeURIComponent(token)}`;
        const rawPhone = String(client.phone || '').replace(/\D/g, '');
        const whatsappPhone = rawPhone ? (rawPhone.startsWith('0') ? `593${rawPhone.slice(1)}` : rawPhone) : '';
        const message = `Hola, puedes descargar el documento del periodo ${month} aquí: ${link}`;
        const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
        if (whatsappWindow) whatsappWindow.location.href = whatsappUrl;
        else window.location.assign(whatsappUrl);
         setSentPeriodIds(current => new Set([...current, periodId]));
         setPeriods(current => current.map(item => String(item.id) === periodId ? { ...item, sharedAt: new Date().toISOString() } : item));
      } catch (error) {
        whatsappWindow?.close();
        window.alert(error?.response?.data?.error || error.message || 'No se pudo generar el enlace de prueba.');
      } finally {
        setSendingPeriodIds(current => { const next = new Set(current); next.delete(periodId); return next; });
      }
    };
    table.addEventListener('click', handleSend, true);
    return () => table.removeEventListener('click', handleSend, true);
  }, [client.phone, sendingPeriodIds]);
  const previewPeriodPdf = async periodId => {
    try {
      const response = await api.post(`/periods/${encodeURIComponent(String(periodId))}/preview-pdf-link`);
      const token = response.data?.data?.token;
      if (!token) throw new Error('No se pudo generar la vista previa.');
      const link = `${window.location.origin}/api/public/share-pdf?token=${encodeURIComponent(token)}`;
      window.open(link, '_blank', 'noopener,noreferrer');
    } catch (error) {
      window.alert(error?.response?.data?.error || error.message || 'No se pudo visualizar el PDF.');
    }
  };
  useEffect(() => {
    const table = document.querySelector('.client-history-panel .client-history-table');
    if (!table) return undefined;
    table.querySelectorAll('tbody tr').forEach((row, index) => {
      const monthCell = row.cells[0];
      const month = visiblePeriods[index]?.month || monthCell?.textContent?.trim();
      if (!monthCell || !month || monthCell.querySelector('.history-row-month-check')) return;
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'history-row-month-check';
      check.dataset.month = month;
      check.title = `Filtrar ${month}`;
      check.checked = selectedHistoryMonths.includes(month);
      check.onchange = event => {
        const value = event.target.dataset.month;
        setSelectedHistoryMonths(current => event.target.checked
          ? [...new Set([...current, value])]
          : current.filter(item => item !== value));
      };
      monthCell.prepend(check);
    });
  }, [visiblePeriods, selectedHistoryMonths, sentPeriodIds]);
  return <div className="client-history-screen"><div className="client-history-topbar"><div><p className="eyebrow">HISTORIAL DEL CLIENTE</p><h2>{client.name}</h2><p>Consulta periodos, documentos y declaraciones registradas.</p></div><button type="button" className="outline" onClick={onClose}>Volver a clientes</button></div><div className="client-history-grid"><section className="panel client-history-panel"><div className="panel-head"><div><h3>Periodos registrados</h3><p>Consulta el avance de cada periodo creado para este cliente.</p></div><label className="history-year-filter">A&Ntilde;O FISCAL<select value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>{years.map(item => <option key={item}>{item}</option>)}</select></label></div>{loading ? <div className="empty">Cargando historial...</div> : <div className="table-wrap"><table className="client-history-table"><thead><tr><th>A&Ntilde;O</th><th>MES</th><th>ESTADO</th><th>DOCUMENTOS SUBIDOS</th><th>CREADO</th></tr></thead><tbody>{visiblePeriods.map(period => { const periodDocuments = documents.filter(item => String(item.periodId) === String(period.id)); return <tr key={period.id}><td><strong>{period.year}</strong></td><td>{period.month}</td><td><em className={`badge ${period.status === 'Completado' ? 'green' : 'orange'}`}>{period.status}</em></td><td><div className="history-documents">{periodDocuments.length ? periodDocuments.map(document => <button type="button" key={document.id} onClick={() => openDocument(document)}>{document.originalName} &middot; v{document.version}.0</button>) : <small>Sin documentos</small>}</div></td><td>{period.createdAt ? new Date(period.createdAt).toLocaleDateString('es-EC') : '—'}</td></tr>; })}</tbody></table>{!visiblePeriods.length && <div className="empty">No hay periodos registrados para este a&ntilde;o.</div>}</div>}</section><aside className="client-history-side"><section className="panel declaration-history-card"><div className="panel-head"><div><h3>Declaraciones mensuales</h3><p>Consulta de valores declarados por mes. Solo lectura.</p></div></div><div className="declaration-summary-total"><div><small>IVA acumulado</small><strong>{money(iva)}</strong></div><div><small>Retenciones acumuladas</small><strong>{money(retentions)}</strong></div><div><small>Total anual</small><strong>{money(iva + retentions)}</strong></div></div><div className="declaration-summary-list">{visiblePeriods.map(period => { const item = declarationByPeriod.get(String(period.id)); if (!item) return null; return <div className="declaration-summary-row" key={period.id}><span><strong>{period.month}</strong><b>{money(item.iva)}</b></span><span><small>Retenciones</small><b>{money(item.retentions)}</b></span><span><small>Total</small><b>{money(Number(item.iva) + Number(item.retentions))}</b></span></div>; })}{!annual.length && <div className="empty">No hay declaraciones registradas.</div>}</div></section><section className="panel accounts-history-card"><div className="panel-head"><div><h3>Cuentas</h3><p>Documentos de CxC y CxP registrados por mes.</p></div></div><div className="accounts-history-list">{visiblePeriods.map(period => { const accountDocuments = documents.filter(item => String(item.periodId) === String(period.id) && String(item.documentGroup || item.document_group).toLowerCase() === 'portfolio'); return <div className="accounts-history-row" key={period.id}><div><strong>{period.month}</strong><small>{accountDocuments.length ? `${accountDocuments.length} documento${accountDocuments.length === 1 ? '' : 's'}` : 'Sin documentos'}</small></div>{accountDocuments.length ? <div className="accounts-history-files">{accountDocuments.map(document => <button type="button" key={document.id} onClick={() => openDocument(document)}>{document.originalName} · v{document.version}.0</button>)}</div> : <span className="accounts-history-empty">Pendiente</span>}</div>; })}{!visiblePeriods.length && <div className="empty">No hay periodos creados para este año.</div>}</div></section></aside></div></div>;
}

function ClientHistoryPage({ clients, year, onClose, onOpenPeriodEntry, onOpenTimeline }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const clientKey = params.get('client');
  const client = clients.find(item => String(item.id) === clientKey || String(item.ruc) === clientKey);
  if (!clients.length && clientKey) return <div className="content client-history-page"><section className="panel empty">Cargando cliente...</section></div>;
  if (!client) return <div className="content"><section className="panel empty">Cliente no encontrado.</section></div>;
  const selectedYear = params.get('year') || year;
  return <div className="content client-history-page"><ClientHistoryScreen client={client} year={selectedYear} onClose={onClose} onOpenAnnualTaxDetail={() => navigate(`/detalle-impuesto-renta?client=${client.id}&year=${selectedYear}`)} onOpenPeriodEntry={onOpenPeriodEntry} onOpenTimeline={onOpenTimeline} /></div>;
}

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error de renderizado en ContaMatic:', error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="login-page"><section className="login-panel" role="alert"><h2>No se pudo cargar esta sección</h2><p>{this.state.error.message || 'Ocurrió un error inesperado.'}</p><button type="button" className="primary" onClick={() => window.location.reload()}>Recargar</button></section></main>;
  }
}

function AnnualIncomeTaxDetailPage({ clients, year, onClose }) {
  const routerNavigate = useNavigate();
  const navigate = path => path === '/clientes' ? onClose?.() : routerNavigate(path);
  const query = new URLSearchParams(useLocation().search);
  const clientId = query.get('client');
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
  const [selectedYear, setSelectedYear] = useState(query.get('year') || String(year));
  const [availableFiscalYears, setAvailableFiscalYears] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const client = clients.find(item => String(item.id) === String(clientId));
  useEffect(() => {
    if (!detail) return;
    const table = document.querySelector('.annual-detail-table');
    if (!table) return;
    const headers = ['MES', 'VENTAS DEL MES', 'COSTOS BASE DEL MES', 'GASTO EMPLEADOS', 'UTILIDAD DEL MES', 'RETENCIONES PARA IMPUESTO', 'IMPUESTO POR PAGAR', 'BASE ACUMULADA', 'TARIFA / REGLA APLICADA', 'IMPUESTO CAUSADO'];
    const taxRetentionTotal = detail.months.reduce((sum, item) => sum + Number(item.incomeTaxRetention || 0), 0);
    const amountCell = (value, className = '') => `<td class="${className}${Number(value) < 0 ? ' annual-detail-negative' : ''}">${money(value)}</td>`;
    const head = table.querySelector('thead tr');
    if (head) head.innerHTML = headers.map(label => `<th>${label}</th>`).join('');
    const summary = table.closest('.annual-detail-panel')?.querySelector('.annual-detail-summary');
    if (summary && !summary.querySelector('.annual-detail-sales-card')) {
      summary.insertAdjacentHTML('afterbegin', `<div class="annual-detail-sales-card"><small>Ventas anuales</small><strong>${money(detail.annual.sales)}</strong></div><div class="annual-detail-costs-card"><small>Costos y gastos anuales</small><strong>${money(detail.annual.costs)}</strong></div><div class="annual-detail-utility-card"><small>Utilidad Operativa</small><strong>${money(detail.annual.utility)}</strong></div>`);
    }
    const retentionCard = [...(summary?.children || [])].find(card => card.querySelector('small')?.textContent === 'Retenciones anuales');
    if (retentionCard) {
      retentionCard.querySelector('small').textContent = 'Retenciones para impuesto';
      retentionCard.querySelector('strong').textContent = money(taxRetentionTotal);
    }
    table.querySelectorAll('tbody tr').forEach((row, index) => {
      const item = detail.months[index];
      if (!item) return;
      row.innerHTML = `<td><strong>${item.name}</strong></td>${amountCell(item.sales)}${amountCell(Number(item.costs || 0) - Number(item.employeeExpense || 0))}${amountCell(item.employeeExpense)}${amountCell(item.utility)}${amountCell(item.incomeTaxRetention)}${amountCell(item.taxAfterRetentions)}${amountCell(item.accumulatedBase)}<td><span title="${item.rate}">${item.rate}</span></td>${amountCell(item.tax, 'annual-detail-tax-value')}`;
      row.dataset.periodId = String(item.periodId || '');
      const employeeCell = row.cells[3];
      if (employeeCell && item.periodId) {
        employeeCell.classList.add('annual-detail-employee-cell');
        employeeCell.title = 'Doble clic para ingresar o editar';
        employeeCell.addEventListener('dblclick', () => {
          if (employeeCell.querySelector('input')) return;
          employeeCell.innerHTML = `<input class="annual-detail-employee-input" type="number" min="0" step="0.01" placeholder="0.00" value="${Number(item.employeeExpense || 0) || ''}"><button type="button" class="annual-detail-save-btn" hidden>Guardar</button>`;
          const input = employeeCell.querySelector('input');
          const saveButton = employeeCell.querySelector('button');
          saveButton.hidden = input.value.trim() === '';
          input.focus();
          input.select();
           input.addEventListener('input', () => { saveButton.hidden = input.value.trim() === ''; });
           input.addEventListener('blur', () => { if (!saveButton.hidden && !saveButton.disabled) saveButton.click(); });
           saveButton.addEventListener('click', async () => {
            const value = Number(input.value);
            if (!Number.isFinite(value) || value < 0) return;
            saveButton.disabled = true;
            try {
              await api.patch(`/periods/${item.periodId}/declaration/employee-expense`, { employeeExpense: value });
              const response = await api.get(`/clients/${clientId}/annual-tax-detail/${selectedYear}`);
              setDetail(response.data.data || null);
            } catch (error) {
              alert(error?.response?.data?.error || 'No se pudo guardar el gasto de empleados.');
              saveButton.disabled = false;
            }
          });
        });
      }
      const retentionCell = null;
      if (retentionCell && item.periodId) {
        retentionCell.classList.add('annual-detail-retention-cell');
        retentionCell.title = 'Doble clic para ingresar o editar';
        retentionCell.addEventListener('dblclick', () => {
          if (retentionCell.querySelector('input')) return;
          retentionCell.innerHTML = `<input class="annual-detail-employee-input" type="number" min="0" step="0.01" placeholder="0.00" value="${Number(item.retentions || 0) || ''}"><button type="button" class="annual-detail-save-btn" hidden>Guardar</button>`;
          const input = retentionCell.querySelector('input');
          const saveButton = retentionCell.querySelector('button');
          saveButton.hidden = input.value.trim() === '';
          input.focus();
          input.select();
           input.addEventListener('input', () => { saveButton.hidden = input.value.trim() === ''; });
           input.addEventListener('blur', () => { if (!saveButton.hidden && !saveButton.disabled) saveButton.click(); });
           saveButton.addEventListener('click', async () => {
            const value = Number(input.value);
            if (!Number.isFinite(value) || value < 0) return;
            saveButton.disabled = true;
            try {
              await api.patch(`/periods/${item.periodId}/declaration/retentions`, { retentions: value });
              const response = await api.get(`/clients/${clientId}/annual-tax-detail/${selectedYear}`);
              setDetail(response.data.data || null);
            } catch (error) {
              alert(error?.response?.data?.error || 'No se pudieron guardar las retenciones.');
              saveButton.disabled = false;
            }
          });
        });
      }
      const taxRetentionCell = row.cells[5];
      if (taxRetentionCell && item.periodId) {
        taxRetentionCell.classList.add('annual-detail-tax-retention-cell');
        taxRetentionCell.title = 'Retención usada para calcular impuesto. Doble clic para editar';
        taxRetentionCell.addEventListener('dblclick', () => {
          if (taxRetentionCell.querySelector('input')) return;
          taxRetentionCell.innerHTML = `<input class="annual-detail-employee-input" type="number" min="0" step="0.01" placeholder="0.00" value="${Number(item.incomeTaxRetention || 0) || ''}"><button type="button" class="annual-detail-save-btn" hidden>Guardar</button>`;
          const input = taxRetentionCell.querySelector('input');
          const saveButton = taxRetentionCell.querySelector('button');
          saveButton.hidden = input.value.trim() === '';
          input.focus();
          input.select();
           input.addEventListener('input', () => { saveButton.hidden = input.value.trim() === ''; });
           input.addEventListener('blur', () => { if (!saveButton.hidden && !saveButton.disabled) saveButton.click(); });
           saveButton.addEventListener('click', async () => {
            const value = Number(input.value);
            if (!Number.isFinite(value) || value < 0) return;
            saveButton.disabled = true;
            try {
              await api.patch(`/periods/${item.periodId}/declaration/income-tax-retention`, { incomeTaxRetention: value });
              const response = await api.get(`/clients/${clientId}/annual-tax-detail/${selectedYear}`);
              setDetail(response.data.data || null);
            } catch (error) {
              alert(error?.response?.data?.error || 'No se pudo guardar la retención para impuesto.');
              saveButton.disabled = false;
            }
          });
        });
      }
      if (Number(item.utility) < 0) row.classList.add('annual-detail-loss-row');
      if ([item.sales, item.costs, item.utility, item.iva, item.retentions].every(value => Number(value || 0) === 0)) row.classList.add('annual-detail-empty-row');
    });
    table.querySelector('.annual-detail-total-row')?.remove();
    const totalRow = document.createElement('tr');
    totalRow.className = 'annual-detail-total-row';
    totalRow.innerHTML = `<td><strong>TOTAL ANUAL</strong></td>${amountCell(detail.annual.sales)}${amountCell(Number(detail.annual.costs || 0) - Number(detail.annual.employeeExpense || 0))}${amountCell(detail.annual.employeeExpense)}${amountCell(detail.annual.utility)}${amountCell(taxRetentionTotal)}${amountCell(detail.annual.taxPayable)}${amountCell(detail.annual.base)}<td></td>${amountCell(detail.annual.tax, 'annual-detail-tax-value')}`;
    table.querySelector('tbody')?.appendChild(totalRow);
    table.querySelector('.annual-detail-payable-row')?.remove();
    const payableRow = document.createElement('tr');
    payableRow.className = 'annual-detail-payable-row';
    payableRow.innerHTML = `<td colspan="6"><strong>IMPUESTO POR PAGAR (IMPUESTO CAUSADO - RETENCIONES PARA IMPUESTO)</strong></td><td><strong>${money(detail.annual.taxPayable)}</strong></td><td colspan="3"></td>`;
    table.querySelector('tbody')?.appendChild(payableRow);
    table.closest('.annual-detail-panel')?.querySelectorAll('.annual-detail-summary strong').forEach(value => {
      if (Number(value.textContent.replace(/[^0-9.-]/g, '')) < 0) value.classList.add('annual-detail-negative');
    });
  }, [detail]);
  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api.get(`/clients/${clientId}/annual-tax-detail/${selectedYear}`)
      .then(({ data }) => setDetail(data.data || null))
      .catch(error => alert(error?.response?.data?.error || 'No se pudo cargar el detalle anual.'))
      .finally(() => setLoading(false));
  }, [clientId, selectedYear]);
  useEffect(() => {
    if (!clientId) return;
    api.get('/periods/years', { params: { clientId } }).then(({ data }) => {
      const years = (data.data || []).map(value => String(value)).filter((value, index, list) => list.indexOf(value) === index);
      setAvailableFiscalYears(years);
      if (years.length && !years.includes(String(selectedYear))) setSelectedYear(years[0]);
    }).catch(() => setAvailableFiscalYears([]));
  }, [clientId]);
  useEffect(() => {
    const select = document.querySelector('.annual-income-tax-detail-page .history-year-filter select');
    if (!select) return;
    select.innerHTML = availableFiscalYears.length
      ? availableFiscalYears.map(value => `<option value="${value}">${value}</option>`).join('')
      : '<option value="" disabled>No hay años ingresados</option>';
    select.value = String(selectedYear);
  }, [availableFiscalYears, selectedYear]);
  const download = async type => {
    try {
      const response = await api.get(`/clients/${clientId}/annual-tax-detail/${selectedYear}/${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `detalle-impuesto-renta-${selectedYear}.${type === 'excel' ? 'xlsx' : 'pdf'}`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { alert(error?.response?.data?.error || `No se pudo exportar a ${type}.`); }
  };
  useEffect(() => {
    const topbar = document.querySelector('.annual-income-tax-detail-page .client-history-topbar');
    const backButton = topbar?.querySelector('button.outline');
    if (!topbar || !backButton || topbar.querySelector('.annual-detail-review-btn')) return undefined;
    const navigation = document.createElement('div');
    navigation.className = 'annual-detail-navigation';
    const reviewButton = document.createElement('button');
    reviewButton.type = 'button';
    reviewButton.className = 'outline annual-detail-review-btn';
    reviewButton.textContent = 'Revisar información';
    reviewButton.onclick = () => navigate(`/historial?client=${encodeURIComponent(client.id)}&year=${selectedYear}`);
    backButton.parentNode?.insertBefore(navigation, backButton);
    navigation.append(reviewButton, backButton);
    return () => {
      if (navigation.parentNode) {
        navigation.parentNode.insertBefore(backButton, navigation);
        navigation.remove();
      }
      topbar.querySelector('.annual-detail-navigation')?.remove();
    };
  }, [client?.id, selectedYear]);
  useEffect(() => {
    const panelTitle = document.querySelector('.annual-income-tax-detail-page .annual-detail-panel .panel-head h3');
    const panelDescription = document.querySelector('.annual-income-tax-detail-page .annual-detail-panel .panel-head p');
    if (panelTitle && client?.name) panelTitle.textContent = client.name;
    if (panelDescription) panelDescription.textContent = 'Detalle mensual: base acumulada, regla tributaria e impuesto causado por cada mes.';
  }, [client?.name]);
  if (!clientId || !client) return <div className="content"><div className="empty">Cliente no encontrado.</div></div>;
  return <div className="content annual-income-tax-detail-page"><div className="client-history-topbar"><div><p className="eyebrow">IMPUESTO A LA RENTA · DETALLE ANUAL</p><h2>Detalle Anual del Impuesto a la Renta</h2><p>{client.name} · RUC / Cédula: {client.ruc}</p></div><button type="button" className="outline" onClick={() => navigate('/clientes')}>Volver a clientes</button></div><section className="panel annual-detail-panel"><div className="panel-head"><div><h3>Detalle mensual</h3><p>Base acumulada, regla tributaria e impuesto causado por cada mes.</p></div><label className="history-year-filter">AÑO FISCAL<select value={selectedYear} onChange={event => setSelectedYear(event.target.value)}><option>{year}</option><option>{Number(year) - 1}</option><option>{Number(year) + 1}</option></select></label></div><div className="annual-detail-actions"><button type="button" className="outline" onClick={() => download('excel')} disabled={!detail}><i className="bi bi-file-earmark-spreadsheet"/> Exportar Excel</button><button type="button" className="primary" onClick={() => download('pdf')} disabled={!detail}><i className="bi bi-file-earmark-pdf"/> Exportar PDF</button></div>{loading ? <div className="empty">Cargando detalle...</div> : detail && <><div className="annual-detail-summary"><div><small>Retenciones anuales</small><strong>{money(detail.annual.retentions)}</strong></div><div><small>Base anual acumulada</small><strong>{money(detail.annual.base)}</strong></div><div className="annual-detail-payable-card"><small>Impuesto por pagar</small><strong>{money(detail.annual.taxPayable)}</strong><em>{detail.annual.status}</em></div></div><div className="table-wrap"><table className="annual-detail-table"><thead><tr><th>MES</th><th>IVA DECLARADO</th><th>RETENCIONES</th><th>BASE ACUMULADA</th><th>TARIFA / REGLA APLICADA</th><th>IMPUESTO CAUSADO</th></tr></thead><tbody>{detail.months.map(row => <tr key={row.month}><td><strong>{row.name}</strong></td><td>{money(row.iva)}</td><td>{money(row.retentions)}</td><td>{money(row.accumulatedBase)}</td><td><span title={row.rate}>{row.rate}</span></td><td className="annual-detail-tax-value">{money(row.tax)}</td></tr>)}</tbody></table></div></>}</section></div>;
}

function PeriodsModule({ clients, periods, year, setYear, availableYears, onUpdateStatus, onCreateYear, onRefreshYear, periodRecords, onUpdateRecord, isAdmin = false, globalClientRuc = '' }) {
  const routerNavigate = useNavigate();
  // Marca las navegaciones originadas en el ojo del modal para que la sección
  // destino pueda ofrecer un retorno al mismo periodo.
  const navigate = (path, options) => {
    const fromPeriodModal = typeof path === 'string' && (
      path.startsWith('/estados-financieros?') ||
      path.startsWith('/cxc-cxp?') ||
      path.startsWith('/declaraciones?readonly=1')
    );
    return routerNavigate(fromPeriodModal ? `${path}&return=period-modal` : path, options);
  };
  const [selectedUser, setSelectedUser] = useState('');
  useEffect(() => { if (selectedUser) window.setTimeout(() => document.getElementById('assigned-clients-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }, [selectedUser]);
  const assignedUsers = Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort();
  const selectedUserClients = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedUser);
  const location = useLocation();
  const routeParams = new URLSearchParams(location.search);
  const requestedClient = routeParams.get('client') || '';
  const requestedYear = routeParams.get('year') || '';
  const requestedMonth = routeParams.get('month') || '';
  const [selectedClient, setSelectedClient] = useState(requestedClient || globalClientRuc);
  const [viewMode, setViewMode] = useState('matrix');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState(null);
  const [showFinancialFilesModal, setShowFinancialFilesModal] = useState(false);
  const [financialFiles, setFinancialFiles] = useState({});
  const [existingFinancialDocs, setExistingFinancialDocs] = useState({});
  const [existingPortfolioDocs, setExistingPortfolioDocs] = useState({});
  const [existingDeclaration, setExistingDeclaration] = useState(null);

  // Sincroniza la selección local con el filtro global del contador.
  useEffect(() => {
    if (globalClientRuc) setSelectedClient(globalClientRuc);
    else if (!requestedClient) setSelectedClient('');
  }, [globalClientRuc]);

  useEffect(() => {
    if (!selectedClient && clients.length && (!isAdmin || selectedUser)) setSelectedClient((isAdmin ? selectedUserClients : clients)[0]?.ruc || '');
  }, [clients, selectedClient, selectedUser, selectedUserClients]);
  useEffect(() => {
    if (requestedYear && String(year) !== requestedYear) setYear(requestedYear);
    if (requestedClient && clients.some(client => String(client.ruc) === requestedClient)) {
      setSelectedClient(requestedClient);
      window.setTimeout(() => periodsHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
  }, [requestedClient, requestedYear, clients]);
  const [showPortfolioFilesModal, setShowPortfolioFilesModal] = useState(false);
  const [portfolioFiles, setPortfolioFiles] = useState({});
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxSetupYear, setTaxSetupYear] = useState('');
  const [pendingApertureYear, setPendingApertureYear] = useState('');
  const [incomeTaxSummary, setIncomeTaxSummary] = useState({ periodicity: 'Anual', rate: 0, base: { iva: 0, retentions: 0 } });
  const [annualTaxStatus, setAnnualTaxStatus] = useState('acumulando');
  const [annualTaxDueDate, setAnnualTaxDueDate] = useState('');
  const [clientYears, setClientYears] = useState([]);
  const [apertureFrequency, setApertureFrequency] = useState('Mensual');
  const [apertureYear, setApertureYear] = useState(String(new Date().getFullYear()));
      const [showApertureModal, setShowApertureModal] = useState(false);
      const maxYear = clientYears.length ? Math.max(...clientYears.map(Number)) + 1 : 2100;
  const periodsHistoryRef = useRef(null);
  useEffect(() => {
    if (!requestedMonth || !selectedClient || !year) return;
    const match = [...periodRecords, ...periods].find(period => String(period.clientRuc) === String(selectedClient) && String(period.year) === String(year) && String(period.month).toLowerCase() === requestedMonth.toLowerCase());
    if (match) setSelectedPeriodId(match.id);
  }, [requestedMonth, selectedClient, year, periodRecords, periods]);
  const selectClientAndScroll = clientRuc => {
    setSelectedClient(clientRuc);
    setTimeout(() => periodsHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  const selectedRecord = periodRecords.find(item => item.id === selectedPeriodId) || periods.find(item => item.id === selectedPeriodId);
  const shareSelectedPeriod = async period => {
    if (!period?.id) return;
    try {
      await api.post(`/periods/${period.id}/share`);
      alert('Documentación compartida y registrada en auditoría.');
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo compartir la documentación.');
    }
  };

  // Abre automáticamente el cliente del filtro general solo cuando ya está
  // disponible en la lista recibida por el Dashboard.
  const selectedClientData = clients.find(client => client.ruc === selectedClient);
  useEffect(() => {
    if (!selectedClientData?.id || !year) return;
    api.get(`/clients/${selectedClientData.id}/income-tax/${year}`)
      .then(({ data }) => setIncomeTaxSummary({
        periodicity: data.data?.configuration?.periodicity || 'Anual',
        rate: Number(data.data?.configuration?.rate || 0),
        base: data.data?.base || { iva: 0, retentions: 0 }
      }))
      .catch(() => setIncomeTaxSummary({ periodicity: 'Anual', base: { iva: 0, retentions: 0 } }));
  }, [selectedClientData?.id, year]);
  useEffect(() => {
    if (!selectedClientData?.id || !year) return;
    api.get(`/clients/${selectedClientData.id}/annual-tax/${year}`)
      .then(({ data }) => {
        setAnnualTaxStatus(data.data?.declaration?.status || 'acumulando');
        setAnnualTaxDueDate(data.data?.declaration?.dueDate || '');
      })
      .catch(() => { setAnnualTaxStatus('acumulando'); setAnnualTaxDueDate(''); });
  }, [selectedClientData?.id, year, showTaxModal]);
  const savePeriodFiles = async (files, group, documents) => {
    if (!selectedRecord) return;
    const selected = documents.map(([key]) => files[key]).filter(Boolean);
    if (!selected.length) return alert('Selecciona al menos un archivo.');
    const formData = new FormData();
    selected.forEach(file => formData.append('files', file));
    formData.append('group', group);
    formData.append('types', documents.filter(([key]) => files[key]).map(([key]) => key).join(','));
    try {
      await api.post(`/periods/${selectedRecord.id}/documents`, formData);
      const documentKey = group === 'Financial Statements' ? 'financial' : group === 'Portfolio' ? 'accounts' : null;
      if (documentKey) {
        const documents = { financial: false, accounts: false, declarations: false, tax: false, ...(selectedRecord.documents || {}), [documentKey]: true };
        const nextStatus = getPeriodStatus(documents);
        onUpdateRecord({ ...selectedRecord, documents, status: nextStatus });
        onUpdateStatus(selectedRecord.id, nextStatus);
      }
      setSelectedPeriodId(null);
      alert('Archivos guardados correctamente.');
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudieron guardar los archivos.');
    }
  };
  const saveDeclaration = async ({ iva, retentions, ivaCosts, ivaValues, employeeExpense, ivaFile, retentionFile }) => {
    if (!selectedRecord) return;
    const formData = new FormData();
    formData.append('iva', iva || '0');
    formData.append('retentions', retentions || '0');
    if (ivaCosts !== '' && ivaCosts != null) formData.append('ivaCosts', ivaCosts);
    if (ivaValues !== '' && ivaValues != null) formData.append('ivaValues', ivaValues);
    formData.append('employeeExpense', employeeExpense || '0');
    if (ivaFile) formData.append('ivaFile', ivaFile);
    if (retentionFile) formData.append('retentionFile', retentionFile);
    try {
      await api.post(`/periods/${selectedRecord.id}/declaration`, formData);
      // Actualiza los indicadores y el estado del periodo con la información recién guardada.
      await onRefreshYear?.(year);
      // Refresca la base acumulada del Impuesto a la Renta sin cambiar de pantalla.
      if (selectedClientData?.id && year) {
        const { data: taxData } = await api.get(`/clients/${selectedClientData.id}/income-tax/${year}`);
        setIncomeTaxSummary({
          periodicity: taxData.data?.configuration?.periodicity || 'Anual',
          rate: Number(taxData.data?.configuration?.rate || 0),
          base: taxData.data?.base || { iva: 0, retentions: 0 }
        });
      }
      const documents = { financial: false, accounts: false, declarations: true, tax: false, ...(selectedRecord.documents || {}) };
      const nextStatus = getPeriodStatus(documents);
      onUpdateRecord({ ...selectedRecord, documents, status: nextStatus });
      onUpdateStatus(selectedRecord.id, nextStatus);
      setShowDeclarationModal(false);
      setSelectedPeriodId(null);
      alert('Declaración guardada correctamente.');
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo guardar la declaración.');
    }
  };
  useEffect(() => {
    if ((!showFinancialFilesModal && !showPortfolioFilesModal) || !selectedRecord) return;
    api.get(`/periods/${selectedRecord.id}/documents`).then(({ data }) => {
      const existing = {};
      (data.data || []).filter(doc => doc.documentGroup === 'Financial Statements').forEach(doc => {
        const current = existing[doc.documentType];
        if (!current || Number(doc.version) > Number(current.version)) existing[doc.documentType] = doc;
      });
      setExistingFinancialDocs(existing);
      const portfolio = {};
      (data.data || []).filter(doc => doc.documentGroup === 'Portfolio').forEach(doc => {
        const current = portfolio[doc.documentType];
        if (!current || Number(doc.version) > Number(current.version)) portfolio[doc.documentType] = doc;
      });
      setExistingPortfolioDocs(portfolio);
    }).catch(() => { setExistingFinancialDocs({}); setExistingPortfolioDocs({}); });
  }, [showFinancialFilesModal, showPortfolioFilesModal, selectedRecord]);
  useEffect(() => {
    if (!showDeclarationModal || !selectedRecord) return;
    api.get(`/periods/${selectedRecord.id}/declaration`).then(({ data }) => setExistingDeclaration(data.data || null)).catch(() => setExistingDeclaration(null));
  }, [showDeclarationModal, selectedRecord]);
  const updateDocument = key => { if (!selectedRecord || selectedRecord.status === 'Completado') return; const documents = { financial: false, accounts: false, declarations: false, tax: false, ...(selectedRecord.documents || {}), [key]: !(selectedRecord.documents || {})[key] }; const nextStatus = getPeriodStatus(documents); onUpdateRecord({ ...selectedRecord, documents, status: nextStatus }); onUpdateStatus(selectedRecord.id, nextStatus); };

  const yearPeriods = useMemo(() => {
    return periods.filter(p => p.year === String(year));
  }, [periods, year]);

  const filteredPeriods = useMemo(() => {
    return yearPeriods.filter(p => {
      const matchClient = selectedClient === 'ALL' || p.clientRuc === selectedClient;
      const matchSearch = p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.month.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.clientRuc.includes(searchTerm);
      return matchClient && matchSearch;
    });
  }, [yearPeriods, selectedClient, searchTerm]);

  const cycleStatus = (period) => {
    const order = ['Pendiente', 'En proceso', 'Completado'];
    const nextIdx = (order.indexOf(period.status) + 1) % order.length;
    onUpdateStatus(period.id, order[nextIdx]);
  };

  const yearsAvailable = clientYears.length ? clientYears : [String(new Date().getFullYear())];
  const nextYear = String(parseInt(year, 10) + 1);
  const selectedClientHasPeriods = yearPeriods.some(period => period.clientRuc === selectedClient);
  const targetYearToOpen = selectedClientHasPeriods ? nextYear : String(year);
  const visibleClients = isAdmin ? selectedUserClients : clients;
  const clientOptions = visibleClients.filter(client => `${client.name} ${client.ruc} ${client.owner}`.toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
    if (!selectedClient) { setClientYears([]); return; }
    const client = clients.find(item => item.ruc === selectedClient);
    if (!client?.id) return;
    api.get('/periods/years', { params: { clientId: client.id } }).then(({ data }) => {
      const years = data.data || [];
      setClientYears(years);
      setYear(years.length ? String(years[0]) : String(new Date().getFullYear()));
    }).catch(() => {});
  }, [selectedClient]);

  // Sincroniza inmediatamente los periodos recién creados con el estado del módulo.
  useEffect(() => {
    const latestYear = clientYears[0];
    if (!latestYear || !onRefreshYear) return;
    onRefreshYear(latestYear).catch(() => {});
  }, [clientYears]);

  return (
    <div className="content periods-module">
      <section className="welcome">
        <div>
          <p className="eyebrow">PERIODOS CONTABLES</p>
          <h2>Control de Periodos Mensuales</h2>
        </div>
        {false && <div className="period-year-actions">
          <select 
            className="year-select-dropdown" 
            value={year} 
            onChange={(e) => setYear(e.target.value)}
          >
            {yearsAvailable.map(y => (
              <option key={y} value={y}>Año fiscal {y}</option>
            ))}
          </select>
          
          {!yearsAvailable.includes(nextYear) && <button 
            className="primary outline-btn" 
            title="Inicializar periodos para el siguiente año contable"
            onClick={async () => {
              const nextY = nextYear;
              await onCreateYear(nextY);
              alert(`Se ha activado e inicializado automáticamente el año fiscal ${nextY}.`);
            }}
          >
            <Icon name="refresh" size={16}/> Aperturar Año {nextYear}
          </button>}
        </div>}
      </section>

      <div className="search period-client-search">
        <Icon name="search" size={18}/>
        <input placeholder="Buscar por cliente, mes o RUC..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
      </div>

      {isAdmin && <section className="panel clients-registry"><div className="panel-head"><div><h3>Usuarios / Contadores</h3><p>Selecciona un usuario para consultar sus periodos.</p></div></div><div className="table-wrap"><table className="client-table"><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead><tbody>{assignedUsers.map(userName => { const count = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length; return <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{count}</td><td><button type="button" className="client-dashboard-btn" onClick={() => { setSelectedUser(userName); setSelectedClient(''); }}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>; })}</tbody></table></div></section>}

      {(!isAdmin || selectedUser) && <section id="assigned-clients-section" className="panel period-client-selector">
        <div className="panel-head">
          <div><h3>Clientes</h3><p>Selecciona un cliente para acceder a sus periodos contables.</p></div>
        </div>
        <div className="period-client-list">
              {clientOptions.map(client => <div key={client.ruc} className={`period-client-row ${selectedClient === client.ruc ? 'selected' : ''}`}><div><strong>{client.name}</strong><small>RUC/Cédula {client.ruc} · {client.owner}</small></div><em className="badge green">{client.clientStatus || 'Activo'}</em><button type="button" className="edit-btn" onClick={() => selectClientAndScroll(client.ruc)}>Ver periodos</button></div>)}
          {!clientOptions.length && <div className="empty">No se encontraron clientes.</div>}
        </div>
      </section>}

      {selectedClient && <section ref={periodsHistoryRef} className="panel periods-main-panel">
        <div className="panel-head periods-head">
          <div>
            <h3>Historial del Año Fiscal{clientYears.length ? ` ${year}` : ''}</h3>
            <p>Consulta los periodos creados para este cliente y año.</p>
          </div>
          <div className="period-history-actions"><div className="period-year-actions">
            <select className="year-select-dropdown" value={clientYears.length ? year : ''} onChange={(e) => setYear(e.target.value)}>{clientYears.length ? yearsAvailable.map(y => <option key={y} value={y}>Año fiscal {y}</option>) : <option value="">Selecciona un año</option>}</select>
            <button className="primary outline-btn" onClick={() => { setApertureYear(selectedClientHasPeriods ? nextYear : String(year)); setShowApertureModal(true); }}><Icon name="plus" size={16}/> Crear periodos</button>
          </div><div className="view-toggle">
            <button 
              className={viewMode === 'matrix' ? 'active' : ''} 
              onClick={() => setViewMode('matrix')}
            >
              Matriz
            </button>
          </div></div>
        </div>

        {viewMode === 'matrix' ? (
          <div className="matrix-wrapper">
            {selectedClient ? clients
              .filter(c => c.ruc === selectedClient)
              .filter(c => yearPeriods.some(period => period.clientRuc === c.ruc))
              .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.ruc.includes(searchTerm))
              .map(client => {
                const clientPeriods = yearPeriods.filter(p => p.clientRuc === client.ruc);
                const periodLabels = MONTHS.map((month, index) => ({ ...month, monthNum: index + 1 }));
                const completed = clientPeriods.filter(p => p.status === 'Completado').length;
                const totalPeriods = periodLabels.length;
                const pct = Math.round((completed / totalPeriods) * 100);

                return (
                  <div key={client.ruc} className="client-matrix-card">
                    <div className="card-client-info">
                      <div>
                        <strong>{client.name}</strong>
                        <small>RUC: {client.ruc} · {client.owner}</small>
                      </div>
                      <div className="client-stat-badge">
                        <span className="client-stat-label">Cumplimiento</span>
                        <span className="pct-num">{pct}%</span>
                        <small>{completed}/{totalPeriods} meses completados</small>
                      </div>
                    </div>

                    <div className="panel income-tax-year-card">
                      <div className="panel-head">
                        <div><h3>Impuesto a la Renta · {year}</h3><p>Periodicidad: {incomeTaxSummary.periodicity}</p></div>
                         <span className={`status-badge ${annualTaxStatus === 'presentada' ? 'status-success' : annualTaxStatus === 'calculada' ? 'status-warning' : 'status-neutral'}`}>{annualTaxStatus === 'presentada' ? 'Presentada' : annualTaxStatus === 'calculada' ? 'Calculada' : 'Acumulando'}</span>
                       </div>
                       {annualTaxStatus === 'calculada' && <div className="annual-deadline-alert"><strong>⚠ Formulario 101 pendiente</strong><span>Fecha límite: {annualTaxDueDate || 'abril del año siguiente'}</span></div>}
                       {annualTaxStatus === 'presentada' && <div className="annual-presented-notice"><strong>✓ Formulario 101 presentado</strong><span>La obligación anual está registrada.</span></div>}
                       <div className="income-tax-year-summary">
                        <div><small>Base acumulada actual</small><strong>${(Number(incomeTaxSummary.base?.iva || 0) + Number(incomeTaxSummary.base?.retentions || 0)).toFixed(2)}</strong></div>
                         <button type="button" className="primary income-tax-view-btn" onClick={() => { setTaxSetupYear(String(year)); setSelectedPeriodId(null); setShowTaxModal(true); }}>Ver Impuestos</button>
                      </div>
                    </div>

                    <div className="months-grid">
                      {periodLabels.map((m) => {
                        const period = clientPeriods.find(p => p.monthNum === m.monthNum);
                        const status = period ? period.status : 'Pendiente';
                        const toneClass = status === 'Completado' ? 'green' : status === 'En proceso' ? 'blue' : 'orange';

                        return (
                          <div 
                            key={m.short} 
                            className={`month-pill ${toneClass}`} 
                            title={`${m.name} ${year}: ${status} (Haz clic para alternar estado)`}
                            onClick={() => { setSelectedPeriodId(period?.id); if (period) setSelectedPeriodId(period.id); }}
                          >
                            <span className="m-name">{m.short}</span>
                            <span className="m-status">{status}</span>
                            <span className="m-icon">{status === 'Completado' ? '✓' : status === 'En proceso' ? '◷' : '−'}</span>
                            {period && <button
                              type="button"
                              className="month-upload-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedPeriodId(period.id);
                              }}
                            >
                              <Icon name="upload" size={13} /> Subir archivos
                            </button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }) : <div className="empty">Selecciona un cliente para consultar sus periodos contables.</div>}

            {selectedClient && !yearPeriods.some(period => period.clientRuc === selectedClient) && <div className="empty">Este cliente aún no tiene periodos creados.</div>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="periods-table">
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>AÑO FISCAL</th>
                  <th>MES</th>
                  <th>ESTADO DE PERIODO</th>
                  <th>ÚLTIMA ACTUALIZACIÓN</th>
                  <th>CAMBIAR ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeriods.map(period => (
                  <tr key={period.id}>
                    <td>
                      <strong>{period.clientName}</strong>
                      <small>RUC {period.clientRuc}</small>
                    </td>
                    <td><b>{period.year}</b></td>
                    <td><strong>{period.month}</strong></td>
                    <td>
                      <em className={`badge ${period.status === 'Completado' ? 'green' : period.status === 'En proceso' ? 'blue' : 'orange'}`}>
                        {period.status}
                      </em>
                    </td>
                    <td><small>{period.updatedAt}</small></td>
                    <td>
                      <select 
                        className="table-status-select"
                        value={period.status}
                        onChange={(e) => onUpdateStatus(period.id, e.target.value)}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="En proceso">En proceso</option>
                        <option value="Completado">Completado</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredPeriods.length && <div className="empty">No se encontraron periodos con los filtros seleccionados.</div>}
          </div>
        )}
      </section>}
      {selectedRecord && <div className="modal-backdrop" onMouseDown={() => setSelectedPeriodId(null)}><section className="panel period-checklist period-detail-modal" onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setSelectedPeriodId(null)}><Icon name="close"/></button><div className="panel-head"><div><h3>{selectedRecord.month} {selectedRecord.year}</h3><p>{selectedRecord.clientName}</p></div><em className={`badge ${selectedRecord.status === 'Completado' ? 'green' : selectedRecord.status === 'En proceso' ? 'blue' : 'orange'}`}>{selectedRecord.status}</em></div><div className="checklist-grid">{[['financial','Estados financieros'],['accounts','Cartera'],['declarations','Declaraciones'],['tax','Impuesto a la renta']].map(([key,label]) => <div key={key} className={`checklist-item ${(selectedRecord.documents || {})[key] ? 'checked' : ''} ${key === 'tax' && incomeTaxSummary.periodicity === 'Anual' ? 'tax-informative' : ''}`}><span>{(selectedRecord.documents || {})[key] ? '✓' : key === 'tax' ? '·' : '×'}</span><div><strong>{label}</strong><small>{(selectedRecord.documents || {})[key] ? 'Cargado y confirmado' : key === 'tax' && incomeTaxSummary.periodicity === 'Anual' ? 'Acumulando · periodicidad anual — ver resumen del año' : key === 'tax' ? 'Pendiente' : 'Sin cargar'}</small></div>{key === 'financial' && (selectedRecord.documents || {})[key] && <button type="button" className="row-upload-btn" onClick={() => navigate(`/estados-financieros?client=${selectedRecord.clientRuc}&year=${selectedRecord.year}&month=${encodeURIComponent(selectedRecord.month)}`)}><Icon name="eye" size={14}/></button>}{key === 'financial' && <button type="button" className="row-upload-btn" onClick={() => setShowFinancialFilesModal(true)}><Icon name="upload" size={14}/> Agregar archivos</button>}{key === 'accounts' && (selectedRecord.documents || {})[key] && <button type="button" className="row-upload-btn" onClick={() => navigate(`/cxc-cxp?client=${selectedRecord.clientRuc}&year=${selectedRecord.year}&month=${encodeURIComponent(selectedRecord.month)}`)}><Icon name="eye" size={14}/></button>}{key === 'accounts' && <button type="button" className="row-upload-btn" onClick={() => setShowPortfolioFilesModal(true)}><Icon name="upload" size={14}/> Agregar archivos</button>}{key === 'declarations' && (selectedRecord.documents || {})[key] && <button type="button" className="row-upload-btn" title="Ver declaración" onClick={() => navigate(`/declaraciones?readonly=1&client=${selectedRecord.clientRuc}&year=${selectedRecord.year}&month=${encodeURIComponent(selectedRecord.month)}`)}><Icon name="eye" size={14}/></button>}{key === 'declarations' && <button type="button" className="row-upload-btn" onClick={() => setShowDeclarationModal(true)}><Icon name="upload" size={14}/> Agregar declaración</button>}{key === 'tax' && incomeTaxSummary.periodicity !== 'Anual' && <button type="button" className="row-upload-btn" onClick={() => setShowTaxModal(true)}><Icon name="upload" size={16}/> Agregar impuesto</button>}</div>)}</div></section></div>}
      {showFinancialFilesModal && selectedRecord && <FinancialFilesModal documents={FINANCIAL_DOCUMENTS} files={financialFiles} existing={existingFinancialDocs} onClose={() => setShowFinancialFilesModal(false)} onSave={files => savePeriodFiles(files, 'Financial Statements', FINANCIAL_DOCUMENTS)} />}
      {showPortfolioFilesModal && selectedRecord && <FinancialFilesModal documents={PORTFOLIO_DOCUMENTS} files={portfolioFiles} existing={existingPortfolioDocs} onClose={() => setShowPortfolioFilesModal(false)} onSave={files => savePeriodFiles(files, 'Portfolio', PORTFOLIO_DOCUMENTS)} />}
      {showDeclarationModal && selectedRecord && <DeclarationPeriodModal periodId={selectedRecord.id} existing={existingDeclaration} onClose={() => setShowDeclarationModal(false)} onSave={saveDeclaration} />}
      {showTaxModal && (selectedRecord || selectedClientData) && (pendingApertureYear ? <IncomeTaxPeriodModal periodId={selectedRecord?.id} clientId={selectedRecord?.clientId || selectedClientData?.id} year={selectedRecord?.year || taxSetupYear || year} readOnly={false} onClose={() => { setShowTaxModal(false); setPendingApertureYear(''); }} onSave={async config => { try { const clientId = selectedRecord?.clientId || selectedClientData?.id; const taxYear = selectedRecord?.year || taxSetupYear || year; await api.put(`/clients/${clientId}/income-tax/${taxYear}`, { ...config, createPeriods: true, apertureYear: pendingApertureYear }); setClientYears(current => Array.from(new Set([...current, pendingApertureYear])).sort((a, b) => Number(b) - Number(a))); setYear(pendingApertureYear); setPendingApertureYear(''); setShowTaxModal(false); alert('Configuración guardada correctamente.'); } catch (error) { alert(error?.response?.data?.error || 'No se pudo guardar la configuración.'); } }} /> : <AnnualTaxSummaryModal clientId={selectedRecord?.clientId || selectedClientData?.id} year={selectedRecord?.year || year} initialBase={incomeTaxSummary.base} initialRate={incomeTaxSummary.rate} onClose={() => setShowTaxModal(false)} />)}
      {showApertureModal && <div className="modal-backdrop" onMouseDown={() => setShowApertureModal(false)}><form className="modal aperture-modal" onSubmit={async event => { event.preventDefault(); const selectedYear = Number(apertureYear); const hasExistingYears = clientYears.length > 0; const latestYear = hasExistingYears ? Math.max(...clientYears.map(Number)) : null; const maxYear = hasExistingYears ? latestYear + 1 : 2100; if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > maxYear || (hasExistingYears && selectedYear !== maxYear)) return alert(hasExistingYears ? `Solo puedes aperturar el año siguiente: ${maxYear}.` : 'Ingresa un año fiscal válido.'); if (clientYears.includes(String(selectedYear))) return alert(`El año ${selectedYear} ya tiene periodos creados para este cliente.`); setPendingApertureYear(String(selectedYear)); setTaxSetupYear(String(selectedYear)); setShowApertureModal(false); setShowTaxModal(true); }} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowApertureModal(false)}><Icon name="close" /></button><p className="eyebrow">NUEVO AÑO FISCAL</p><h2>Crear periodos</h2><p>Selecciona el año fiscal. Se crearán automáticamente los 12 meses después de guardar la configuración tributaria.</p><div className="aperture-fields"><label>Año fiscal<input type="number" min="2000" max={maxYear} value={apertureYear} onChange={event => setApertureYear(event.target.value)} /></label></div><div className="modal-actions"><button type="button" className="outline" onClick={() => setShowApertureModal(false)}>Cancelar</button><button type="submit" className="primary"><Icon name="check" size={16}/> Continuar configuración</button></div></form></div>}
    </div>
  );
}

/* ==========================================================================
   MÓDULO 3: ESTADOS FINANCIEROS
   ========================================================================== */
function FinancialStatementsModule({ clients, year, documentGroup = 'Financial Statements', moduleTitle = 'Estados Financieros', clientActionLabel = 'Ver estados', moduleRoute = '/estados-financieros', isAdmin = false, globalClientRuc = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeParams = new URLSearchParams(location.search);
  const returnToPeriod = routeParams.get('return') === 'period-modal';
  const documentCatalog = documentGroup === 'Portfolio' ? PORTFOLIO_DOCUMENTS : FINANCIAL_DOCUMENTS;
  const [selectedUser, setSelectedUser] = useState('');
  useEffect(() => { if (selectedUser) window.setTimeout(() => document.getElementById('assigned-clients-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }, [selectedUser]);
  const assignedUsers = Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort();
  const selectedUserClients = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedUser);
  const visibleClients = isAdmin ? selectedUserClients : clients;
  const [statements, setStatements] = useState([]);
  const [loadingStatements, setLoadingStatements] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(routeParams.get('client') || globalClientRuc || '');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState(routeParams.get('month') || 'ALL');
  const [clientYears, setClientYears] = useState([]);
  const selectedClientInfo = clients.find(client => String(client.ruc) === String(selectedClient));
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [historyRecord, setHistoryRecord] = useState(null);
  const [targetClientRuc, setTargetClientRuc] = useState(null);
  const [showFinancialFilesModal, setShowFinancialFilesModal] = useState(false);
  const [financialFiles, setFinancialFiles] = useState({});
  const financialResultsRef = useRef(null);
  // El filtro global obliga a este módulo a consultar únicamente ese cliente.
  useEffect(() => {
    if (globalClientRuc) setSelectedClient(globalClientRuc);
    else if (!routeParams.get('client')) setSelectedClient('');
  }, [globalClientRuc]);
  const selectFinancialClientAndScroll = clientRuc => {
    setSelectedClient(clientRuc);
    setSelectedYear('ALL');
    setSelectedMonth('ALL');
    setTimeout(() => financialResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  useEffect(() => {
    const client = clients.find(item => String(item.ruc) === String(selectedClient));
    if (!client?.id) { setClientYears([]); return; }
    api.get('/periods/years', { params: { clientId: client.id } })
      .then(({ data }) => setClientYears(data.data || []))
      .catch(() => setClientYears([]));
  }, [selectedClient, clients]);

  useEffect(() => {
    let cancelled = false;
    const client = clients.find(item => String(item.ruc) === String(selectedClient));
    if (!client?.id) { setStatements([]); setLoadingStatements(false); return () => { cancelled = true; }; }
    setLoadingStatements(true);
    Promise.all([
      api.get('/periods', { params: { clientId: client.id } }),
      api.get('/periods/documents', { params: { clientId: client.id } })
    ]).then(async ([periodsResponse, documentsResponse]) => {
      const periods = periodsResponse.data.data || [];
      const documentsByPeriod = new Map();
      (documentsResponse.data.data || []).forEach(doc => {
        const list = documentsByPeriod.get(String(doc.periodId)) || [];
        list.push(doc);
        documentsByPeriod.set(String(doc.periodId), list);
      });
      const loadedResults = await Promise.allSettled(periods.map(async period => {
        const docs = (documentsByPeriod.get(String(period.id)) || []).map(doc => ({ ...doc, documentGroup: doc.documentGroup ?? doc.document_group, documentType: doc.documentType ?? doc.document_type })).filter(doc => documentGroup === 'Portfolio' ? ['receivable', 'payable'].includes(doc.documentType) : FINANCIAL_DOCUMENTS.some(([key]) => key === doc.documentType));
        const versionGroups = new Map();
        docs.forEach(doc => {
          const group = versionGroups.get(doc.version) || { version: `v${doc.version}.0`, files: [], uploadedAt: doc.uploadedAt };
          const typeLabel = documentCatalog.find(([key]) => key === doc.documentType)?.[1] || doc.documentType;
          group.files.push({ id: doc.id, type: typeLabel, name: doc.originalName, size: doc.fileSize ? `${(Number(doc.fileSize) / 1048576).toFixed(2)} MB` : '' });
          if (new Date(doc.uploadedAt) > new Date(group.uploadedAt)) group.uploadedAt = doc.uploadedAt;
          versionGroups.set(doc.version, group);
        });
        const versions = [...versionGroups.values()].sort((a, b) => Number(b.version.slice(1, -2)) - Number(a.version.slice(1, -2))).map(group => ({
          ...group, fileName: `${group.files.length} ${moduleTitle.toLowerCase()}`, fileSize: '',
          uploadedAt: new Date(group.uploadedAt).toLocaleString('es-ES'), uploadedBy: 'Usuario', notes: ''
        }));
        const byType = new Map();
        docs.forEach(doc => {
          const list = byType.get(doc.documentType) || [];
          list.push(doc);
          byType.set(doc.documentType, list);
        });
        return [...byType.entries()].map(([type, typeDocs]) => {
          const typeVersions = typeDocs.sort((a, b) => Number(b.version) - Number(a.version)).map(doc => ({
            version: `v${doc.version}.0`, fileName: doc.originalName,
            fileSize: doc.fileSize ? `${(Number(doc.fileSize) / 1048576).toFixed(2)} MB` : '',
            uploadedAt: new Date(doc.uploadedAt).toLocaleString('es-ES'), uploadedBy: doc.uploadedBy || 'Usuario', notes: '',
            files: [{ id: doc.id, type: FINANCIAL_DOCUMENTS.find(([key]) => key === type)?.[1] || type, name: doc.originalName, size: doc.fileSize ? `${(Number(doc.fileSize) / 1048576).toFixed(2)} MB` : '' }]
          }));
          const latestDocument = typeDocs[0];
          const deliveryStatus = { Pending: 'Pendiente', Sent: 'Enviado', Delivered: 'Entregado' }[latestDocument?.deliveryStatus] || latestDocument?.deliveryStatus || 'Pendiente';
          return { id: `fs-${period.id}-${type}`, periodId: period.id, documentGroup, documentType: type, documentLabel: documentCatalog.find(([key]) => key === type)?.[1] || type, clientRuc: period.clientRuc, clientName: period.clientName, year: period.year, month: period.month, monthNum: period.monthNum, deliveryStatus, versions: typeVersions };
        });
      }));
      const loaded = loadedResults.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (!cancelled) setStatements(loaded.flat().filter(Boolean));
    }).catch(() => { if (!cancelled) setStatements([]); })
      .finally(() => { if (!cancelled) setLoadingStatements(false); });
    return () => { cancelled = true; };
  }, [clients, selectedClient, documentGroup]);

  const filteredStatements = useMemo(() => {
    return statements.filter(item => {
      const matchClient = String(item.clientRuc) === String(selectedClient);
      const matchGroup = item.documentGroup === documentGroup;
      const matchYear = selectedYear === 'ALL' || String(item.year) === String(selectedYear);
      const matchStatus = statusFilter === 'ALL' || item.deliveryStatus === statusFilter;
      const matchMonth = selectedMonth === 'ALL' || item.month === selectedMonth;
      return matchClient && matchGroup && matchYear && matchStatus && matchMonth;
    });
  }, [statements, selectedYear, selectedMonth, selectedClient, statusFilter, documentGroup]);

  const financialMonths = useMemo(() => Array.from(new Set(statements.filter(item => String(item.clientRuc) === String(selectedClient)).map(item => item.month))), [statements, selectedClient]);

  const handleDeliveryStatusChange = async (id, newStatus) => {
    const item = statements.find(statement => statement.id === id);
    const documentId = item?.versions?.[0]?.files?.[0]?.id;
    if (!documentId) return;
    try {
      await api.patch(`/periods/${item.periodId}/documents/${documentId}/delivery-status`, { status: newStatus });
      setStatements(prev => prev.map(s => s.id === id ? { ...s, deliveryStatus: newStatus } : s));
    } catch (error) {
      alert(error?.response?.data?.error || 'No se pudo actualizar el estado de entrega.');
    }
  };

  const previewDocument = async item => {
    const file = item.versions[0]?.files?.[0];
    if (!file?.id) return alert('No hay un archivo visualizable.');
    try {
      const response = await api.get(`/periods/${item.periodId}/documents/${file.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      alert('No se pudo visualizar el documento.');
    }
  };

  const handleSaveUpload = (newUploadData) => {
    const persistUpload = async () => {
      try {
        const client = clients.find(item => String(item.ruc) === String(newUploadData.clientRuc));
        const { data } = await api.get('/periods', { params: { clientId: client.id, year: String(year) } });
        const period = (data.data || []).find(item => item.month === newUploadData.month);
        if (!period) throw new Error('No existe un periodo aperturado para ese mes.');
        const payload = new FormData();
        payload.append('files', newUploadData.file);
        payload.append('group', documentGroup);
        payload.append('types', documentGroup === 'Portfolio' ? 'receivable' : 'balance');
        await api.post(`/periods/${period.id}/documents`, payload);
        setShowUploadModal(false);
        setTargetClientRuc(null);
        window.location.reload();
      } catch (error) {
        alert(error?.response?.data?.error || error?.message || 'No se pudo guardar el archivo.');
      }
    };
    void persistUpload();
    return;
    setStatements(prev => {
      const existingIdx = prev.findIndex(s => s.clientRuc === newUploadData.clientRuc && s.month === newUploadData.month && s.year === String(year));
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const nextVersionNum = `v${existing.versions.length + 1}.0`;
        const newVersionObj = {
          version: nextVersionNum,
          fileName: newUploadData.fileName,
          fileSize: newUploadData.fileSize || '1.1 MB',
          uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          uploadedBy: 'Andrea López',
          notes: newUploadData.notes || 'Nueva actualización de estado financiero.'
        };
        const updated = [...prev];
        updated[existingIdx] = {
          ...existing,
          versions: [newVersionObj, ...existing.versions]
        };
        return updated;
      } else {
        const newRecord = {
          id: `fs-${Date.now()}`,
          clientRuc: newUploadData.clientRuc,
          clientName: newUploadData.clientName,
          year: String(year),
          month: newUploadData.month,
          monthNum: MONTHS.findIndex(m => m.name === newUploadData.month) + 1,
          deliveryStatus: 'Pendiente',
          versions: [
            {
              version: 'v1.0',
              fileName: newUploadData.fileName,
              fileSize: newUploadData.fileSize || '1.2 MB',
              uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
              uploadedBy: 'Andrea López',
              notes: newUploadData.notes || 'Carga inicial del estado financiero.'
            }
          ]
        };
        return [newRecord, ...prev];
      }
    });
    setShowUploadModal(false);
    setTargetClientRuc(null);
  };

  return (
    <div className="content financial-statements-module">
      <section className="welcome">
        <div>
          <p className="eyebrow">{moduleTitle.toUpperCase()}</p>
          <h2>{moduleTitle}</h2>
          <p>Carga de archivos Excel, control de versiones y estado de entrega al cliente.</p>
        </div>
      </section>

      {isAdmin && <section className="panel clients-registry"><div className="panel-head"><div><h3>Usuarios / Contadores</h3><p>Selecciona un usuario para consultar sus archivos.</p></div></div><div className="table-wrap"><table className="client-table"><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead><tbody>{assignedUsers.map(userName => { const count = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length; return <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{count}</td><td><button type="button" className="client-dashboard-btn" onClick={() => { setSelectedUser(userName); setSelectedClient(''); }}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>; })}</tbody></table></div></section>}

      {(!isAdmin || selectedUser) && <section id="assigned-clients-section" className="panel period-client-selector">
        <div className="panel-head"><div><h3>Clientes</h3><p>Selecciona un cliente para consultar sus estados financieros.</p></div></div>
        <div className="search period-client-search"><Icon name="search" size={18}/><input placeholder="Buscar cliente por nombre o RUC..." value={clientSearch} onChange={e => setClientSearch(e.target.value)}/></div>
        <div className="period-client-list">
          {visibleClients.filter(client => `${client.name} ${client.ruc}`.toLowerCase().includes(clientSearch.toLowerCase())).map(client => <div key={client.ruc} className={`period-client-row ${String(selectedClient) === String(client.ruc) ? 'selected' : ''}`}>
            <div><strong>{client.name}</strong><small>RUC/Cédula {client.ruc} · {client.owner || ''}</small></div>
            <em className="badge green">{client.clientStatus || 'Activo'}</em>
            <button type="button" className="edit-btn" onClick={() => selectFinancialClientAndScroll(client.ruc)}>{clientActionLabel}</button>
          </div>)}
          {!visibleClients.filter(client => `${client.name} ${client.ruc}`.toLowerCase().includes(clientSearch.toLowerCase())).length && <div className="empty">No se encontraron clientes.</div>}
        </div>
      </section>}

      {selectedClient && <section ref={financialResultsRef} className="panel">
        <div className="panel-head">
          <div>
            <h3>Reportes de {moduleTitle} del cliente seleccionado</h3>
            {selectedClientInfo && <strong className="selected-module-client">{selectedClientInfo.name} · RUC/Cédula {selectedClientInfo.ruc}</strong>}
            <p>Monitoreo de entregables, historial de versiones y estado de notificación.</p>
          </div>
          {returnToPeriod && <button type="button" className="return-period-btn" onClick={() => navigate(`/periodos-contables?client=${selectedClient}&year=${selectedYear === 'ALL' ? year : selectedYear}&month=${encodeURIComponent(selectedMonth === 'ALL' ? routeParams.get('month') || '' : selectedMonth)}&openPeriod=1`)}><Icon name="arrow" size={15}/> Regresar al periodo</button>}
        </div>

        <div className="fs-filter-bar">
          <div className="filter-selects">
             <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
               <option value="ALL">Todos los años</option>
               {clientYears.map(item => <option key={item} value={item}>Año fiscal {item}</option>)}
             </select>
             <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              <option value="ALL">Todos los meses</option>
              {financialMonths.map(month => <option key={month} value={month}>{month}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">Todos los estados de envío</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Enviado">Enviado</option>
              <option value="Entregado">Entregado</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>PERIODO</th>
                <th>ARCHIVO EXCEL ACTUAL</th>
                <th>VERSIONADO</th>
                <th>FECHA Y USUARIO DE CARGA</th>
                <th>ESTADO DE ENVÍO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {loadingStatements ? (
                <tr><td colSpan="7" className="empty">Cargando estados financieros...</td></tr>
              ) : filteredStatements.map((item, index) => {
                const latestVersion = item.versions[0];
                const statusTone = item.deliveryStatus === 'Entregado' ? 'green' : item.deliveryStatus === 'Enviado' ? 'blue' : 'orange';
                const previousItem = filteredStatements[index - 1];
                const showMonthHeader = selectedMonth === 'ALL' && (!previousItem || previousItem.month !== item.month || String(previousItem.year) !== String(item.year));

                return (
                  <Fragment key={item.id}>
                  {showMonthHeader && <tr className="month-group-row"><td colSpan="7"><strong>{item.month} {item.year}</strong></td></tr>}
                  <tr>
                    <td>
                      <strong>{item.clientName}</strong>
                      <small>RUC {item.clientRuc}</small>
                    </td>
                    <td>
                      <strong>{item.month}</strong>
                      <small>{item.year}</small>
                    </td>
                    <td>
                      <div className="excel-file-badge">
                        <Icon name="file" size={20}/>
                        <div>
                        <strong>{item.documentLabel || latestVersion.fileName}</strong>
                          <small>{latestVersion.fileSize}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button 
                        className="version-pill" 
                        onClick={() => setHistoryRecord(item)}
                        title="Ver historial de versiones"
                      >
                        <span>{latestVersion.version}</span>
                        <span className="v-count">({item.versions.length} ver.)</span>
                      </button>
                    </td>
                    <td>
                      <strong>{latestVersion.uploadedBy}</strong>
                      <small>{latestVersion.uploadedAt}</small>
                    </td>
                    <td>
                      <span className={`delivery-status-select ${statusTone}`} aria-label={`Estado de envío: ${item.deliveryStatus}`}>
                        {item.deliveryStatus}
                      </span>
                      <button type="button" className="icon-action-btn" title="Cambiar estado de entrega" onClick={() => handleDeliveryStatusChange(item.id, item.deliveryStatus === 'Pendiente' ? 'Enviado' : item.deliveryStatus === 'Enviado' ? 'Entregado' : 'Pendiente')}>↻</button>
                    </td>
                    <td>
                      <div className="action-buttons-wrap">
                        <button className="icon-action-btn" title="Visualizar documento" onClick={() => previewDocument(item)}>
                          <Icon name="file" size={15}/>
                        </button>
                        <button 
                          className="icon-action-btn" 
                          title="Ver historial de versiones"
                          onClick={() => setHistoryRecord(item)}
                        >
                          <Icon name="history" size={15}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!loadingStatements && !filteredStatements.length && <div className="empty">No se encontraron estados financieros registrados para este periodo.</div>}
        </div>
      </section>}

      {showUploadModal && (
        <UploadExcelModal 
          moduleTitle="Estados Financieros"
          clients={clients} 
          defaultRuc={targetClientRuc}
          onClose={() => { setShowUploadModal(false); setTargetClientRuc(null); }} 
          onSave={handleSaveUpload}
        />
      )}

      {historyRecord && (
        <VersionHistoryModal 
          record={historyRecord} 
          onClose={() => setHistoryRecord(null)}
        />
      )}
      {showFinancialFilesModal && <FinancialFilesModal documents={FINANCIAL_DOCUMENTS} files={financialFiles} onClose={() => setShowFinancialFilesModal(false)} onSave={files => { setFinancialFiles(files); setShowFinancialFilesModal(false); }} />}
    </div>
  );
}

function AdminAssignedUsers({ clients, title = 'Usuarios / Contadores', description = 'Selecciona un usuario para consultar sus clientes.', onSelect }) {
  const users = Array.from(new Set(clients.map(client => client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`))).sort();
  return <section className="panel clients-registry"><div className="panel-head"><div><h3>{title}</h3><p>{description}</p></div></div><div className="table-wrap"><table className="client-table"><thead><tr><th>USUARIO</th><th>CLIENTES ASIGNADOS</th><th>ACCIÓN</th></tr></thead><tbody>{users.map(userName => { const count = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === userName).length; return <tr key={userName}><td><strong>{userName}</strong><small>Usuario del sistema</small></td><td>{count}</td><td><button type="button" className="client-dashboard-btn" onClick={() => { onSelect(userName); window.setTimeout(() => document.getElementById('assigned-clients-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }}>Ver clientes <Icon name="arrow" size={14}/></button></td></tr>; })}</tbody></table>{!users.length && <div className="empty">No hay usuarios con clientes asignados.</div>}</div></section>;
}

function DeclarationsPage({ clients, year, isAdmin = false, globalClientRuc = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const readOnly = params.get('readonly') === '1';
  const [selectedUser, setSelectedUser] = useState('');
  const selectedClients = clients.filter(client => (client.assignedUser || `Usuario ${client.userCode || 'sin asignar'}`) === selectedUser);
  if (!readOnly && isAdmin) return <div className="content declarations-module"><AdminAssignedUsers clients={clients} title="Usuarios / Contadores" description="Selecciona un usuario para consultar sus declaraciones." onSelect={setSelectedUser} />{selectedUser && <div id="assigned-clients-section"><DeclarationsBrowser clients={selectedClients} year={year} /></div>}</div>;
  if (!readOnly) return <DeclarationsBrowser clients={clients} year={year} globalClientRuc={globalClientRuc} />;
  const returnToPeriod = params.get('return') === 'period-modal';
  return <div className="declaration-return-wrapper">{returnToPeriod && <button type="button" className="return-period-btn return-period-floating" onClick={() => navigate(`/periodos-contables?client=${params.get('client') || ''}&year=${params.get('year') || year}&month=${encodeURIComponent(params.get('month') || '')}&openPeriod=1`)}><Icon name="arrow" size={15}/> Regresar al periodo</button>}<DeclarationReadonlyCards clients={clients} year={params.get('year') || String(year)} clientRuc={params.get('client') || ''} month={params.get('month') || ''} /></div>;
}

function DeclarationsBrowser({ clients, year, globalClientRuc = '' }) {
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(globalClientRuc);
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [clientYears, setClientYears] = useState([]);
  const declarationResultsRef = useRef(null);
  // Mantiene el cliente del filtro global al cambiar de sección o actualizarlo.
  useEffect(() => {
    if (globalClientRuc) setSelectedClient(globalClientRuc);
    else setSelectedClient('');
  }, [globalClientRuc]);
  useEffect(() => { if (!selectedClient) return; const timer = window.setTimeout(() => declarationResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); return () => window.clearTimeout(timer); }, [selectedClient]);
  const filtered = clients.filter(client => `${client.name} ${client.ruc}`.toLowerCase().includes(search.toLowerCase()));
  const open = client => { setSelectedClient(client.ruc); setSelectedYear('ALL'); setSelectedMonth(''); };
  useEffect(() => { const client = clients.find(item => item.ruc === selectedClient); if (!client?.id) { setClientYears([]); return; } api.get('/periods/years', { params: { clientId: client.id } }).then(({ data }) => setClientYears(data.data || [])).catch(() => setClientYears([])); }, [selectedClient, clients]);
  return <div className="content declarations-module declarations-readonly"><section className="welcome"><div><h2>Declaraciones mensuales</h2><p>Selecciona un cliente para consultar sus valores y documentos PDF.</p></div></section><section className="panel declarations-client-panel"><div className="panel-head"><div><h3>Clientes</h3><p>Busca y selecciona el cliente que deseas consultar.</p></div></div><div className="client-search-field"><Icon name="search" size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cliente por nombre o RUC..." /></div><div className="declarations-client-list">{filtered.map(client => <div className={`declarations-client-row ${selectedClient === client.ruc ? 'selected' : ''}`} key={client.ruc}><div><strong>{client.name}</strong><small>RUC/Cédula {client.ruc} · {client.owner || 'Cliente activo'}</small></div><span className="client-status">Activo</span><button type="button" className="outline-btn" onClick={() => open(client)}>Ver declaraciones</button></div>)}{!filtered.length && <div className="empty">No se encontraron clientes.</div>}</div></section>{selectedClient && <><section ref={declarationResultsRef} className="declaration-filters panel"><div><small>CLIENTE SELECCIONADO</small><strong>{clients.find(item => item.ruc === selectedClient)?.name}</strong></div><select value={selectedYear} onChange={event => setSelectedYear(event.target.value)}><option value="ALL">Todos los años</option>{clientYears.map(item => <option key={item} value={item}>{`Año fiscal ${item}`}</option>)}</select><select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}><option value="">Todos los meses</option>{MONTHS.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></section><DeclarationReadonlyCards clients={clients} year={selectedYear} clientRuc={selectedClient} month={selectedMonth} /></>}</div>;
}

function DeclarationReadonlyCards({ clients, year, clientRuc, month }) {
  const [rows, setRows] = useState([]);
  const client = clients.find(item => item.ruc === clientRuc);
  useEffect(() => {
    api.get('/periods', { params: { ...(year !== 'ALL' ? { year } : {}), ...(client?.id ? { clientId: client.id } : {}) } }).then(async ({ data }) => {
      const periods = (data.data || []).filter(item => !month || item.month === month);
      const result = await Promise.all(periods.map(async period => ({ period, declaration: (await api.get(`/periods/${period.id}/declaration`)).data.data })));
      setRows(result.filter(item => item.declaration));
    }).catch(() => setRows([]));
  }, [client?.id, year, month]);
  const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
  const openPdf = async (periodId, documentId) => {
    if (!documentId) return;
    try {
      const response = await api.get(`/periods/${periodId}/documents/${documentId}/download`, { responseType: 'blob' });
      window.open(URL.createObjectURL(response.data), '_blank', 'noopener,noreferrer');
    } catch { alert('No se pudo visualizar el archivo.'); }
  };
  return <div className="content declarations-module declarations-readonly"><section className="welcome"><div><p className="eyebrow">MÓDULO 5 · {year} · SOLO LECTURA</p><h2>Declaraciones mensuales</h2><p>Consulta las declaraciones y visualiza los PDFs cargados.</p></div></section><section className="declaration-context"><div><small>CLIENTE</small><strong>{clientRuc ? client?.name || clientRuc : 'Todos los clientes'}</strong></div><div><small>AÑO FISCAL</small><strong>{year}</strong></div><div><small>MES</small><strong>{month || 'Todos los meses'}</strong></div><span className="readonly-pill"><Icon name="eye" size={14}/> Solo lectura</span></section><section className="declaration-cards">{rows.map(({ period, declaration }) => <article className="declaration-card" key={period.id}><div className="declaration-card-head"><div><span className="declaration-month">{period.month}</span><h3>{period.clientName}</h3><small>RUC {period.clientRuc} · Año fiscal {period.year}</small></div><span className="readonly-pill"><Icon name="eye" size={13}/> Consulta</span></div><div className="declaration-values"><div><small>IVA declarado</small><strong>{money(declaration.iva)}</strong></div><div><small>Retenciones</small><strong>{money(declaration.retentions)}</strong></div><div className="declaration-total-card"><small>Total mensual</small><strong>{money(Number(declaration.iva) + Number(declaration.retentions))}</strong></div></div><div className="declaration-files"><div><Icon name="file" size={16}/><span><small>PDF de IVA</small><strong>{declaration.ivaFile || 'No cargado'}</strong></span>{declaration.ivaDocumentId && <button type="button" className="row-upload-btn" title="Visualizar PDF" onClick={() => openPdf(period.id, declaration.ivaDocumentId)}><Icon name="eye" size={14}/></button>}</div><div><Icon name="file" size={16}/><span><small>PDF de retenciones</small><strong>{declaration.retentionFile || 'No cargado'}</strong></span>{declaration.retentionDocumentId && <button type="button" className="row-upload-btn" title="Visualizar PDF" onClick={() => openPdf(period.id, declaration.retentionDocumentId)}><Icon name="eye" size={14}/></button>}</div></div></article>)}{!rows.length && <div className="empty">No hay declaraciones registradas.</div>}</section></div>;
}

function DeclarationReadonlyList({ clients, year, clientRuc, month }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const client = clients.find(item => item.ruc === clientRuc);
    api.get('/periods', { params: { year, ...(client?.id ? { clientId: client.id } : {}) } }).then(async ({ data }) => {
      const periods = (data.data || []).filter(item => !month || item.month === month);
      const result = await Promise.all(periods.map(async period => ({ period, declaration: (await api.get(`/periods/${period.id}/declaration`)).data.data })));
      setRows(result.filter(item => item.declaration));
    }).catch(() => setRows([]));
  }, [clients, year, clientRuc, month]);
  const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
  return <div className="content declarations-module"><section className="welcome"><div><p className="eyebrow">MÓDULO 5 · {year} · SOLO LECTURA</p><h2>Declaraciones mensuales</h2><p>Consulta los valores y documentos registrados. La carga y edición se realiza desde períodos contables.</p></div></section><section className="panel"><div className="panel-head"><div><h3>Histórico de declaraciones</h3><p>{clientRuc ? `Cliente: ${clients.find(item => item.ruc === clientRuc)?.name || clientRuc}` : 'Todos los clientes'}</p></div></div><div className="table-wrap"><table><thead><tr><th>CLIENTE / PERÍODO</th><th>IVA</th><th>RETENCIONES</th><th>TOTAL</th><th>DOCUMENTOS</th></tr></thead><tbody>{rows.map(({ period, declaration }) => <tr key={period.id}><td><strong>{period.clientName}</strong><small>{period.month} {period.year}</small></td><td>{money(declaration.iva)}</td><td>{money(declaration.retentions)}</td><td><strong>{money(Number(declaration.iva) + Number(declaration.retentions))}</strong></td><td><small>{[declaration.ivaFile, declaration.retentionFile].filter(Boolean).join(' · ') || 'Sin documentos'}</small></td></tr>)}</tbody></table>{!rows.length && <div className="empty">No hay declaraciones registradas.</div>}</div></section></div>;
}

function DeclarationReadonlyModule({ clients, year, clientRuc, selectedYear, month }) {
  const [declaration, setDeclaration] = useState(null);
  const client = clients.find(item => item.ruc === clientRuc);
  useEffect(() => {
    if (!client?.id) return;
    api.get('/periods', { params: { clientId: client.id, year: selectedYear } }).then(async ({ data }) => {
      const period = (data.data || []).find(item => item.month === month);
      if (period) setDeclaration((await api.get(`/periods/${period.id}/declaration`)).data.data);
    }).catch(() => setDeclaration(null));
  }, [client?.id, selectedYear, month]);
  const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
  return <div className="content declarations-module"><section className="welcome"><div><p className="eyebrow">DECLARACIONES · SOLO LECTURA</p><h2>Declaración mensual</h2><p>{client?.name || 'Cliente'} · {month} {selectedYear}</p></div></section><section className="panel"><div className="panel-head"><div><h3>Detalle de declaración</h3><p>Los documentos y valores se muestran únicamente para consulta.</p></div></div>{declaration ? <div className="form-grid"><label>Valor IVA ($)<input value={money(declaration.iva)} readOnly /></label><label>Valor retenciones ($)<input value={money(declaration.retentions)} readOnly /></label><label className="full-width">PDF de IVA<input value={declaration.ivaFile || 'No cargado'} readOnly /></label><label className="full-width">PDF de retenciones<input value={declaration.retentionFile || 'No cargado'} readOnly /></label><div className="declaration-total"><span>Total mensual</span><strong>{money(Number(declaration.iva) + Number(declaration.retentions))}</strong></div></div> : <div className="empty">No se encontró una declaración registrada para este período.</div>}</section></div>;
}


/* ==========================================================================
   COMPONENTES COMPARTIDOS: MODALES
   ========================================================================== */
function UploadExcelModal({ moduleTitle = "Documento", clients, defaultRuc, onClose, onSave }) {
  const [selectedRuc, setSelectedRuc] = useState(defaultRuc || (clients[0] ? clients[0].ruc : ''));
  const [month, setMonth] = useState('Julio');
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!selectedRuc) return setError('Selecciona un cliente.');
    if (!file) return setError('Por favor adjunta un archivo Excel (.xlsx, .xls).');

    const clientObj = clients.find(c => c.ruc === selectedRuc);
    onSave({
      clientRuc: selectedRuc,
      clientName: clientObj ? clientObj.name : 'Cliente Seleccionado',
      month,
      file,
      fileName: file.name,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      notes
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <p className="eyebrow">{moduleTitle.toUpperCase()}</p>
        <h2>Cargar {moduleTitle === "Estados Financieros" ? "Estado Financiero" : "Reporte"} Excel</h2>
        <p>Adjunta el archivo correspondiente y registra los detalles de la versión.</p>

        <div className="form-grid">
          <label>Cliente *
            <select value={selectedRuc} onChange={e => setSelectedRuc(e.target.value)}>
              {clients.map(c => (
                <option key={c.ruc} value={c.ruc}>{c.name} ({c.ruc})</option>
              ))}
            </select>
          </label>

          <label>Mes correspondiente *
            <select value={month} onChange={e => setMonth(e.target.value)}>
              {MONTHS.map(m => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </label>

          <div className="full-width">
            <label>Archivo Excel (.xlsx, .xls) *</label>
            <div className="file-dropzone">
              <Icon name="file" size={32}/>
              <p>Arrastra tu archivo Excel aquí o <strong>haz clic para examinar</strong></p>
              <small>Formatos permitidos: .xlsx, .xls (Máximo 15MB)</small>
              <input type="file" accept=".xlsx, .xls" onChange={handleFileChange}/>
              {file && (
                <div className="file-selected-badge">
                  Archivo seleccionado: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>
          </div>

          <div className="full-width">
            <label>Notas / Comentarios de la versión
              <input 
                placeholder="Ej. Carga de información actualizada..." 
                value={notes} 
                onChange={e => setNotes(e.target.value)}
              />
            </label>
          </div>
        </div>

        {(error || (dirty && validationError)) && <div className="form-error">{error || validationError}</div>}

        <div className="modal-actions">
          <button type="button" className="outline" onClick={onClose}>Cancelar</button>
          <button className="primary"><Icon name="upload" size={16}/> Subir versión</button>
        </div>
      </form>
    </div>
  );
}

function VersionHistoryModal({ record, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <p className="eyebrow">HISTORIAL DE VERSIONADO</p>
        <h2>{record.clientName}</h2>
        <p>Historial de entregables para el periodo <strong>{record.month} {record.year}</strong>.</p>

        <div className="versions-timeline">
          {record.versions.map((ver, idx) => (
            <div key={ver.version} className={`version-item ${idx === 0 ? 'active-version' : ''}`}>
              <div className="version-header">
                <span className="version-badge">
                  {ver.version} {idx === 0 && <small>(Actual)</small>}
                </span>
                <span className="version-date">Cargado el {ver.uploadedAt} por <strong>{ver.uploadedBy}</strong></span>
              </div>

              <div className="version-file-box">
                <Icon name="file" size={22}/>
                <div>
                  <strong>{ver.fileName}</strong>
                  {ver.files ? ver.files.map(file => <small key={`${ver.version}-${file.type}`}><strong>{file.type}</strong>: {file.name} {file.size && `(${file.size})`}</small>) : <small>Tamaño: {ver.fileSize}</small>}
                </div>
                <button className="icon-action-btn" title="Descargar esta versión" onClick={() => {
                  const file = ver.files?.[0];
                  if (!file?.id) return alert('Esta versión no tiene un archivo descargable.');
                  api.get(`/periods/${record.periodId}/documents/${file.id}/download`, { responseType: 'blob' }).then(response => {
                    const url = URL.createObjectURL(response.data);
                    const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
                    URL.revokeObjectURL(url);
                  }).catch(error => alert(error?.response?.data?.error || 'No se pudo descargar el archivo.'));
                }}>
                  <Icon name="arrow" size={15}/>
                </button>
              </div>

              {ver.notes && (
                <div className="version-notes">
                  <strong>Observación:</strong> {ver.notes}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button className="primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, title, value, note, tone }) {
  return (
    <div className="metric">
      <div className={`metric-icon ${tone}`}><Icon name={icon}/></div>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <small className={tone === 'orange' ? 'warning' : ''}>
          {tone === 'orange' ? '● ' : '↗ '}{note}
        </small>
      </div>
    </div>
  );
}


function ConfigurationModule({ clients, onRestore, canAudit = false, userRole }) {
  const [activeSection, setActiveSection] = useState('');
  return <div className="content configuration-module">
    <section className="configuration-menu-card">
      <div className="configuration-menu-head">
        <h2>Configuración</h2>
        <p>Administra clientes deshabilitados y consulta la trazabilidad del sistema.</p>
      </div>
      <button type="button" className={`configuration-menu-row ${activeSection === 'disabled' ? 'active' : ''}`} onClick={() => setActiveSection('disabled')}>
        <span className="configuration-menu-icon"><Icon name="users" size={17}/></span>
        <span className="configuration-menu-copy"><strong>Usuarios deshabilitados</strong><small>Clientes ocultos, conservados para mantener su historial.</small></span>
        <Icon name="arrow" size={16}/>
      </button>
      {canAudit && <button type="button" className={`configuration-menu-row ${activeSection === 'audit' ? 'active' : ''}`} onClick={() => setActiveSection('audit')}>
        <span className="configuration-menu-icon"><Icon name="history" size={17}/></span>
        <span className="configuration-menu-copy"><strong>Trazabilidad del sistema</strong><small>Historial de cambios del sistema.</small></span>
        <Icon name="arrow" size={16}/>
      </button>}
    </section>
    {activeSection === 'disabled' && <div className="configuration-detail"><DisabledClientsModule clients={clients} onRestore={onRestore} /></div>}
    {activeSection === 'audit' && canAudit && <div className="configuration-detail"><AuditHistoryPanel userRole={userRole} /></div>}
  </div>;
}

function AuditHistoryPanel({ userRole }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/audit')
      .then(({ data }) => { if (active) setEvents(data.data || []); })
      .catch(() => { if (active) setError('No se pudo cargar el historial de cambios.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => events.reduce((result, event) => {
    const key = event.userName || `Usuario ${event.userId || ''}`;
    (result[key] ||= []).push(event);
    return result;
  }, {}), [events]);
  const actionLabels = { 'client.created': 'Cliente creado', 'client.updated': 'Cliente actualizado', 'client.disabled': 'Cliente deshabilitado', 'client.restored': 'Cliente reactivado', 'document.uploaded': 'Documento cargado', 'document.delivery_status_changed': 'Estado de documento actualizado', 'period.status_changed': 'Estado de periodo actualizado', 'period.shared': 'Periodo compartido' };
  const formatDate = value => value ? new Date(value).toLocaleString('es-EC') : '—';

  return <section className="panel audit-history-panel">
    <div className="panel-head"><div><p className="eyebrow">SEGURIDAD · SOLO LECTURA</p><h3>Historial de cambios</h3><p>{userRole === 'ADMIN' ? 'Eventos agrupados por usuario del sistema.' : 'Eventos de tus clientes asignados.'}</p></div><span className="audit-readonly-badge"><Icon name="eye" size={13}/> Solo lectura</span></div>
    {loading && <div className="empty">Cargando historial...</div>}
    {error && <div className="form-error">{error}</div>}
    {!loading && !error && !events.length && <div className="empty">Aún no hay cambios registrados.</div>}
    {!loading && !error && Object.entries(groups).map(([userName, userEvents]) => <div className="audit-user-group" key={userName}><div className="audit-user-heading"><strong>{userName}</strong><span>{userEvents.length} evento{userEvents.length === 1 ? '' : 's'}</span></div><div className="table-wrap"><table className="audit-table"><thead><tr><th>FECHA</th><th>ACCIÓN</th><th>CLIENTE</th><th>DETALLE</th></tr></thead><tbody>{userEvents.map(event => <tr key={event.id}><td><small>{formatDate(event.createdAt)}</small></td><td><strong>{actionLabels[event.action] || event.action}</strong></td><td>{event.clientName ? <><strong>{event.clientName}</strong><small>RUC {event.clientRuc}</small></> : '—'}</td><td><small>{event.details?.name || event.details?.group || event.details?.type || (event.details?.after ? 'Datos modificados' : 'Actividad registrada')}</small></td></tr>)}</tbody></table></div></div>)}
  </section>;
}

function DisabledClientsModule({ clients, onRestore }) {
  return <div className="content clients-module"><section className="welcome"><div><p className="eyebrow">CONFIGURACIÓN</p><h2>Usuarios deshabilitados</h2><p>Clientes ocultos del sistema principal, conservados para mantener su historial.</p></div></section><section className="panel clients-registry"><div className="table-wrap"><table><thead><tr><th>CLIENTE</th><th>RUC / CÉDULA</th><th>DESHABILITADO EL</th><th>ACCIÓN</th></tr></thead><tbody>{clients.map(client => <tr key={client.id}><td><strong>{client.name}</strong><small>{client.email || 'Sin correo registrado'}</small></td><td>{client.ruc}</td><td><small>{client.disabledAt ? new Date(client.disabledAt).toLocaleString('es-EC') : '—'}</small></td><td><button className="edit-btn" onClick={() => onRestore(client)}>Reactivar</button></td></tr>)}</tbody></table>{!clients.length && <div className="empty">No hay clientes deshabilitados.</div>}</div></section></div>;
}

function DisableClientModal({ client, onClose, onConfirm }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={event => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <p className="eyebrow">DESHABILITAR CLIENTE</p>
        <h2>¿Deshabilitar a {client.name}?</h2>
        <p>El cliente dejará de mostrarse en el sistema principal, pero no se eliminará de la base de datos.</p>
        <div className="form-success" style={{ marginTop: '18px' }}>
          Sus periodos contables y su historial se conservarán. Para reactivarlo, ve a <strong>Configuración → Usuarios deshabilitados</strong> y pulsa <strong>Reactivar</strong>.
        </div>
        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="delete-btn" onClick={onConfirm}>Deshabilitar cliente</button>
        </div>
      </section>
    </div>
  );
}

function FinancialFilesModal({ documents, files, existing = {}, onClose, onSave }) {
  const [selectedFiles, setSelectedFiles] = useState(files || {});
  const updateFile = (key, file) => setSelectedFiles(current => ({ ...current, [key]: file }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal financial-files-modal" onSubmit={event => { event.preventDefault(); onSave(selectedFiles); }} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">ESTADOS FINANCIEROS</p><h2>Agregar archivos Excel</h2><p>Selecciona un archivo Excel para cada informe del periodo.</p><div className="financial-upload-list">{documents.map(([key, label, description]) => <label key={key} className="financial-upload-item"><strong>{label}</strong><small>{description}</small><input type="file" accept=".xlsx,.xls" onChange={event => updateFile(key, event.target.files?.[0] || null)}/>{selectedFiles[key] ? <em>{selectedFiles[key].name}</em> : existing[key] ? <em>Guardado: {existing[key].originalName} · v{existing[key].version}.0</em> : <small>Ningún archivo seleccionado</small>}</label>)}</div><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cerrar</button><button type="submit" className="primary"><Icon name="upload" size={16}/> Guardar archivos</button></div></form></div>;
}

// Modal para registrar o editar la declaración mensual del período seleccionado.
// Aquí se cargan los PDFs y se muestran los valores de IVA y retenciones.
function DeclarationPeriodModal({ periodId, existing, onClose, onSave }) {
  const [current, setCurrent] = useState(existing);
  const [iva, setIva] = useState(existing?.iva != null ? String(existing.iva) : '');
  const [retentions, setRetentions] = useState(existing?.retentions != null ? String(existing.retentions) : '');
  const [ivaCosts, setIvaCosts] = useState(existing?.ivaCosts != null ? String(existing.ivaCosts) : '');
  const [ivaValues, setIvaValues] = useState(existing?.ivaValues != null ? String(existing.ivaValues) : '');
  const [employeeExpense, setEmployeeExpense] = useState(existing?.employeeExpense != null ? String(existing.employeeExpense) : '0');
  const [ivaFile, setIvaFile] = useState(null);
  const [retentionFile, setRetentionFile] = useState(null);
  const [readingIva, setReadingIva] = useState(false);
  const [pdfMessage, setPdfMessage] = useState('');
  useEffect(() => { if (existing) { setCurrent(existing); setIva(String(existing.iva ?? '')); setRetentions(String(existing.retentions ?? '')); setIvaCosts(String(existing.ivaCosts ?? '')); setIvaValues(String(existing.ivaValues ?? '')); setEmployeeExpense(String(existing.employeeExpense ?? 0)); } }, [existing]);
  const remove = async type => { if (!window.confirm('¿Eliminar este PDF?')) return; try { const { data } = await api.delete(`/periods/${periodId}/declaration/${type}`); setCurrent(data.data); } catch { alert('No se pudo eliminar el PDF.'); } };
  // Envía temporalmente el PDF al backend para extraer el valor del formulario SRI.
  // Envía los valores y archivos al componente padre para guardarlos en el backend.
  const submit = event => { event.preventDefault(); onSave({ iva, retentions, ivaCosts, ivaValues, employeeExpense, ivaFile, retentionFile }); };
  // Cada vez que cambia ivaFile, se lee automáticamente el PDF seleccionado.
  useEffect(() => {
    if (!ivaFile) return;
    let cancelled = false;
    const readPdf = async () => {
      setReadingIva(true);
      setPdfMessage('');
      // Se construye un FormData nuevo para el archivo actual.
      const formData = new FormData();
      formData.append('file', ivaFile);
      try {
        // El backend devuelve, por ejemplo, el valor del campo 902 del formulario.
        const { data } = await api.post('/periods/declaration/parse', formData);
        if (!cancelled) {
          setIva(String(data.data.iva)); setIvaCosts(data.data.costs == null ? '' : String(data.data.costs)); setIvaValues(data.data.values == null ? '' : String(data.data.values));
          setPdfMessage(`IVA leído automáticamente del campo ${data.data.field} del formulario SRI.`);
        }
      } catch (error) {
        if (!cancelled) setPdfMessage(error?.response?.data?.error || 'No se pudo leer el valor del PDF. Puedes ingresarlo manualmente.');
      } finally { if (!cancelled) setReadingIva(false); }
    };
    readPdf();
    return () => { cancelled = true; };
  }, [ivaFile]);
  useEffect(() => {
    const grid = document.querySelector('.declaration-period-modal .form-grid');
    if (!grid || grid.querySelector('.employee-expense-field')) return;
    const field = document.createElement('label');
    field.className = 'employee-expense-field';
    field.innerHTML = 'Gasto empleados ($)<input type="number" min="0" step="0.01" />';
    const input = field.querySelector('input');
    input.value = employeeExpense;
    input.addEventListener('input', event => setEmployeeExpense(event.target.value));
    grid.insertBefore(field, grid.children[2] || null);
    return () => field.remove();
  }, [employeeExpense]);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal declaration-period-modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">DECLARACIONES</p><h2>Registrar declaración mensual</h2><p>{current ? 'Edita los valores o administra los PDFs guardados.' : 'Primero selecciona el PDF que deseas registrar.'}</p><div className="form-grid"><label>Valor IVA ($)<input type="number" min="0" step="0.01" value={iva} onChange={event => setIva(event.target.value)} placeholder="0.00"/></label><label>Valor retenciones ($)<input type="number" min="0" step="0.01" value={retentions} onChange={event => setRetentions(event.target.value)} placeholder="0.00"/></label><label className="full-width">PDF de IVA{current?.ivaFile && <div className="saved-declaration-file"><Icon name="file" size={15}/><span>{current.ivaFile}</span><button type="button" onClick={() => remove('iva')}>Eliminar</button></div>}<input type="file" accept=".pdf,application/pdf" onChange={event => setIvaFile(event.target.files?.[0] || null)}/>{ivaFile && <small className="input-hint">Nuevo: {ivaFile.name}</small>}</label><label className="full-width">PDF de retenciones{current?.retentionFile && <div className="saved-declaration-file"><Icon name="file" size={15}/><span>{current.retentionFile}</span><button type="button" onClick={() => remove('retentions')}>Eliminar</button></div>}<input type="file" accept=".pdf,application/pdf" onChange={event => setRetentionFile(event.target.files?.[0] || null)}/>{retentionFile && <small className="input-hint">Nuevo: {retentionFile.name}</small>}</label></div><div className="declaration-total"><span>Total mensual</span><strong>${((Number(iva) || 0) + (Number(retentions) || 0)).toFixed(2)}</strong></div><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cancelar</button><button type="submit" className="primary"><Icon name="check" size={16}/> Guardar cambios</button></div></form></div>;
}


function IncomeTaxPeriodModal({ clientId, year, onClose, onSave, readOnly = false }) {
  const [taxpayer, setTaxpayer] = useState('Sociedad');
  const [regime, setRegime] = useState('Régimen general');
  const [accounting, setAccounting] = useState('Sí');
  const [taxType, setTaxType] = useState('Impuesto a la renta');
  const [periodicity, setPeriodicity] = useState('Anual');
  const [rate, setRate] = useState('25');
  const [formula, setFormula] = useState('Base imponible × porcentaje');
  const [enabled, setEnabled] = useState(true);
  const [iva, setIva] = useState('0');
  const [retentions, setRetentions] = useState('0');
  useEffect(() => { const numericRate = Number(rate); if (rate !== '' && Number.isFinite(numericRate) && rate !== numericRate.toFixed(1)) setRate(numericRate.toFixed(1)); }, [rate]);
  useEffect(() => { if (!clientId || !year) return; api.get(`/clients/${clientId}/income-tax/${year}`).then(({ data }) => { const config = data.data?.configuration; const base = data.data?.base || {}; if (config) { setTaxpayer(config.taxpayer || 'Sociedad'); setRegime(config.regime || 'Régimen general'); setAccounting(config.accounting === 'Yes' ? 'Sí' : config.accounting || 'Sí'); setTaxType(config.taxType || 'Impuesto a la renta'); setPeriodicity(config.periodicity || 'Anual'); setRate(String(config.rate ?? '25')); setFormula(config.formula || 'Base imponible × porcentaje'); setEnabled(Boolean(config.enabled)); } setIva(String(base.iva || 0)); setRetentions(String(base.retentions || 0)); }).catch(() => {}); }, [clientId, year]);
  useEffect(() => {
    if (!readOnly) return undefined;
    const modal = document.querySelector('.tax-period-modal');
    if (!modal) return undefined;
    modal.querySelectorAll('input, select').forEach(field => { field.disabled = true; });
    modal.querySelector('.modal-actions .primary')?.setAttribute('hidden', 'true');
    return undefined;
  }, [readOnly]);
  const submit = event => { event.preventDefault(); if (readOnly) return; onSave({ taxpayer, regime, accounting, taxType, periodicity, rate, formula, enabled }); };
  const total = (Number(iva) || 0) + (Number(retentions) || 0);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal tax-period-modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button><p className="eyebrow">IMPUESTO A LA RENTA · CONFIGURACIÓN DEL PERÍODO</p><h2>Impuesto a la Renta</h2><p>Configura los parámetros tributarios del cliente para el año {year}.</p><div className="tax-grid"><section className="panel"><div className="panel-head"><div><h3>Parámetros tributarios</h3><p>Configurables por cliente y año fiscal.</p></div></div><div className="form-grid"><label>Tipo de contribuyente<select value={taxpayer} onChange={event => setTaxpayer(event.target.value)}><option>Persona natural</option><option>Sociedad</option><option>Empresa pública</option><option>Otro</option></select></label><label>Régimen tributario<select value={regime} onChange={event => setRegime(event.target.value)}><option>Régimen general</option><option>RIMPE - Emprendedor</option><option>RIMPE - Negocio popular</option><option>Especial</option></select></label><label>Obligado a llevar contabilidad<select value={accounting} onChange={event => setAccounting(event.target.value)}><option>Sí</option><option>No</option></select></label><label>Tipo de impuesto aplicable<select value={taxType} onChange={event => setTaxType(event.target.value)}><option>Impuesto a la renta</option><option>Impuesto único</option><option>Exento / no aplica</option></select></label><label>Periodicidad<select value={periodicity} onChange={event => setPeriodicity(event.target.value)}><option>Anual</option><option>Anticipos</option><option>Anual + anticipos</option><option>Otra</option></select></label><label>Porcentaje (%)<input type="number" min="0" step="0.01" value={rate} onChange={event => setRate(event.target.value)}/></label><label className="full-width">Fórmula de cálculo<input value={formula} onChange={event => setFormula(event.target.value)}/></label><label className="rule-toggle full-width"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/><span>{enabled ? 'Reglas activas' : 'Reglas inactivas'}</span></label></div></section><section className="panel"><div className="panel-head"><div><h3>Base anual de cálculo</h3><p>Acumulado automáticamente desde el Módulo 5.</p></div><span className="config-year">{year}</span></div><div className="form-grid"><label>IVA acumulado<input value={iva} readOnly /></label><label>Retenciones acumuladas<input value={retentions} readOnly /></label></div><div className="tax-base-card"><span>Base acumulada disponible</span><strong>${total.toFixed(2)}</strong><small>IVA + Retenciones · histórico anual</small></div></section></div><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cancelar</button><button type="submit" className="primary"><Icon name="check" size={16}/> Guardar configuración</button></div></form></div>;
}

function AnnualTaxSummaryModal({ clientId, year, initialBase = { iva: 0, retentions: 0 }, initialRate = 0, onClose }) {
  const [summary, setSummary] = useState(null);
  const [annualStatus, setAnnualStatus] = useState('acumulando');
  const [form101, setForm101] = useState(null);
  const [annualRate, setAnnualRate] = useState(Number(initialRate || 0));
  useEffect(() => { if (!clientId || !year) return; Promise.allSettled([api.get(`/clients/${clientId}/annual-tax/${year}`), api.get(`/clients/${clientId}/income-tax/${year}`)]).then(([annualResult, incomeTaxResult]) => { const annual = annualResult.status === 'fulfilled' ? annualResult.value.data.data || {} : {}; const incomeTax = incomeTaxResult.status === 'fulfilled' ? incomeTaxResult.value.data.data || {} : {}; const configuration = annual.configuration || incomeTax.configuration || {}; const base = incomeTax.base || annual.base || { iva: 0, retentions: 0 }; setAnnualRate(Number(configuration.rate || 0)); setSummary({ ...annual, configuration, base, accumulatedBase: Number(base.iva || 0) + Number(base.retentions || 0) }); }); }, [clientId, year]);
  const configuration = summary?.configuration || {};
  const declaration = summary?.declaration || {};
  const ivaAccumulated = Number(summary?.base?.iva ?? initialBase.iva ?? 0);
  const retentionsAccumulated = Number(summary?.base?.retentions ?? initialBase.retentions ?? 0);
  const base = Number(summary?.base?.total ?? summary?.accumulatedBase ?? 0);
  const calculation = summary?.calculation || {};
  const configuredRate = annualRate || Number(initialRate || 0);
  const canCloseYear = !declaration.status || declaration.status === 'acumulando';
  const calculatedTax = declaration.status === 'calculada' || declaration.status === 'presentada' || declaration.status === 'pagada'
    ? Number(declaration.calculatedTax || 0)
    : Number(calculation.tax || 0);
  useEffect(() => {
    const preview = document.querySelector('.annual-tax-preview');
    if (!preview) return;
    preview.querySelector('.tax-calculation-explanation')?.remove();
    const explanation = document.createElement('div');
    explanation.className = 'tax-calculation-explanation';
    explanation.innerHTML = `<strong>Detalle del cálculo</strong><span>Base: ${calculation.basis || 'No definida'} · ${Number(calculation.taxBase || 0).toFixed(2)}</span><span>Regla aplicada: ${calculation.rule || 'Pendiente'}</span>${calculation.warning ? `<b>⚠ ${calculation.warning}</b>` : ''}`;
    Object.assign(explanation.style, { margin: '12px 0', padding: '12px 14px', border: '1px solid #cbd5e1', borderLeft: '4px solid #2c83d8', borderRadius: '6px', background: '#f8fafc', color: '#243b5a', display: 'grid', gap: '5px', fontSize: '12px' });
    explanation.querySelector('strong').style.fontSize = '14px';
    explanation.querySelector('b')?.style.setProperty('color', '#a16207');
    preview.querySelector('.annual-tax-preview-grid')?.before(explanation);
  }, [summary, calculation.basis, calculation.rule, calculation.taxBase, calculation.warning]);
  const closeAnnualYear = async () => { if (!window.confirm('¿Estás seguro de cerrar el año? Esta acción no se puede deshacer.')) return; try { const { data } = await api.post(`/clients/${clientId}/annual-tax/${year}/close`); setSummary(current => ({ ...(current || {}), declaration: data.data })); setAnnualStatus(data.data?.status || 'calculada'); } catch (error) { alert(error?.response?.data?.error || 'No se pudo cerrar el año fiscal.'); } };
  const presentAnnualYear = async () => { if (!form101 || !declaration.id) return alert('Selecciona el Formulario 101 en PDF.'); try { const payload = new FormData(); payload.append('form101', form101); const { data } = await api.post(`/annual-tax/${declaration.id}/present`, payload); setSummary(current => ({ ...(current || {}), declaration: { ...(current?.declaration || {}), ...(data.data || {}), status: 'presentada', annualDocumentId: data.data?.annualDocumentId || true } })); setAnnualStatus('presentada'); } catch (error) { alert(error?.response?.data?.error || 'No se pudo presentar el Formulario 101.'); } };
  const openAnnualForm101 = async (download = false) => { if (!declaration.id) return; try { const response = await api.get(`/annual-tax/${declaration.id}/form101`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; if (download) { link.download = 'Formulario-101.pdf'; link.click(); } else { window.open(url, '_blank', 'noopener,noreferrer'); } window.setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (error) { alert(error?.response?.data?.error || 'No se pudo abrir el Formulario 101.'); } };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal tax-period-modal annual-summary-modal" onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><Icon name="close" /></button><p className="eyebrow">IMPUESTO A LA RENTA · RESUMEN ANUAL</p><h2>Impuesto a la Renta · {year}</h2><p>Consulta del cierre fiscal. Los parámetros de configuración son de solo lectura.</p><section className="panel"><div className="panel-head"><div><h3>Base anual de cálculo</h3><p>Acumulado desde las declaraciones mensuales.</p></div><span className="config-year">{year}</span></div><div className="form-grid"><label>IVA acumulado<input value={ivaAccumulated.toFixed(2)} readOnly /></label><label>Retenciones acumuladas<input value={retentionsAccumulated.toFixed(2)} readOnly /></label></div><div className="tax-base-card"><span>Base acumulada disponible</span><strong>${base.toFixed(2)}</strong><small>Valor actualizado del año fiscal</small></div></section><section className="panel annual-tax-preview"><div className="panel-head"><div><h3>Cierre anual · {year}</h3><p>Estado y resultado del impuesto.</p></div><span className="status-badge status-neutral">{declaration.status || annualStatus}</span></div><div className="annual-tax-preview-grid"><div><small>Impuesto estimado</small><strong>${calculatedTax.toFixed(2)}</strong></div><div className="annual-form101-cell"><small>Formulario 101</small><span>{declaration.annualDocumentId ? 'Presentado' : canCloseYear ? 'Se carga después del cierre' : 'Pendiente de presentación'}</span>{declaration.annualDocumentId && <div className="annual-form101-actions"><button type="button" className="row-upload-btn" onClick={() => openAnnualForm101(false)}>Ver PDF</button><button type="button" className="row-upload-btn" onClick={() => openAnnualForm101(true)}>Descargar</button></div>}{!canCloseYear && !declaration.annualDocumentId && <input type="file" accept=".pdf,application/pdf" onChange={event => setForm101(event.target.files?.[0] || null)}/>} {form101 && <em>{form101.name}</em>}</div><div><small>Vencimiento</small><span>{declaration.dueDate || 'Pendiente de cálculo'}</span></div></div><div className="annual-tax-actions"><button type="button" className="danger" onClick={closeAnnualYear} disabled={!canCloseYear}>Cerrar año</button>{!canCloseYear && !declaration.annualDocumentId && <button type="button" className="primary" onClick={presentAnnualYear}>Subir Formulario 101</button>}</div></section><div className="modal-actions"><button type="button" className="outline" onClick={onClose}>Cerrar</button></div></section></div>;
}

function isValidEcuadorCedula(value) {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  if (province < 1 || province > 24 || Number(value[2]) > 6) return false;
  const sum = value.slice(0, 9).split('').reduce((total, digit, index) => {
    const product = Number(digit) * (index % 2 === 0 ? 2 : 1);
    return total + (product > 9 ? product - 9 : product);
  }, 0);
  return Number(value[9]) === (sum % 10 === 0 ? 0 : 10 - (sum % 10));
}

function isValidEcuadorRuc(value) {
  if (!/^\d{13}$/.test(value)) return false;
  const typeDigit = Number(value[2]);
  if (typeDigit === 6) {
    if (!value.endsWith('0001')) return false;
    const sum = [3, 2, 7, 6, 5, 4, 3, 2].reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
    return Number(value[8]) === (11 - (sum % 11)) % 11;
  }
  if (typeDigit === 9) {
    return value.endsWith('001');
  }
  return typeDigit <= 5 && isValidEcuadorCedula(value.slice(0, 10)) && value.endsWith('001');
}

function validateClientForm(form, isAdmin, clientToEdit) {
  const idType = String(form.idType || '').trim();
  const identification = String(form.ruc || '').trim();
  if (!['ruc', 'cedula', 'passport'].includes(idType)) return 'Selecciona un tipo de identificación.';
  if (!identification) return 'La identificación es obligatoria.';
  if (idType === 'cedula' && !isValidEcuadorCedula(identification)) return 'La cédula no es válida: revisa provincia, dígitos y verificador.';
  if (idType === 'ruc' && !isValidEcuadorRuc(identification)) return 'El RUC no es válido para el tipo de contribuyente indicado.';
  if (idType === 'passport' && !/^[A-Za-z0-9]{6,12}$/.test(identification)) return 'El pasaporte debe tener entre 6 y 12 caracteres alfanuméricos.';
  const name = String(form.name || '').trim();
  if (name.length < 3 || /^\d+$/.test(name)) return 'La razón social debe tener al menos 3 caracteres y no ser solo numérica.';
  const owner = String(form.owner || '').trim();
  if (owner.length < 3 || !/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[ '\-][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$/.test(owner)) return 'El responsable debe contener únicamente letras y espacios.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email || '').trim().toLowerCase())) return 'Ingresa un correo electrónico válido.';
  if (!/^(09\d{8}|0[2-7]\d{7})$/.test(String(form.phone || '').trim())) return 'El teléfono debe ser un celular 09XXXXXXXX o un fijo válido de Ecuador.';
  if (!String(form.clientStatus || '').trim() || !String(form.taxRegime || '').trim() || !['Sí', 'No'].includes(form.accounting)) return 'Completa estado, régimen tributario y obligación contable.';
  if (isAdmin && !clientToEdit && !form.assignedUserCode) return 'Selecciona el contador responsable del cliente.';
  if (!['Persona natural', 'Sociedad'].includes(form.taxpayerType)) return 'Selecciona el tipo de contribuyente.';
  return '';
}

function validateClientField(form, field) {
  if (field === 'ruc') {
    if (!form.ruc) return '';
    if (form.idType === 'cedula' && form.ruc.length < 10) return '';
    if (form.idType === 'ruc' && form.ruc.length < 13) return '';
    if (form.idType === 'passport' && form.ruc.length < 6) return '';
    if (form.idType === 'cedula' && !isValidEcuadorCedula(form.ruc)) return 'La cédula no es válida.';
    if (form.idType === 'ruc' && !isValidEcuadorRuc(form.ruc)) return 'El RUC no es válido.';
    if (form.idType === 'passport' && !/^[A-Za-z0-9]{6,12}$/.test(form.ruc)) return 'El pasaporte no es válido.';
  }
  if (field === 'name' && String(form.name || '').trim().length >= 3 && /^\d+$/.test(String(form.name).trim())) return 'La razón social no puede ser solo numérica.';
  if (field === 'owner' && String(form.owner || '').trim().length >= 3 && !/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[ '\-][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$/.test(String(form.owner).trim())) return 'El responsable debe contener únicamente letras y espacios.';
  if (field === 'email' && String(form.email || '').includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email).trim().toLowerCase())) return 'Ingresa un correo electrónico válido.';
  if (field === 'phone' && String(form.phone || '').length >= 10 && !/^(09\d{8}|0[2-7]\d{7})$/.test(String(form.phone).trim())) return 'El teléfono no es válido.';
  if (field === 'taxpayerType' && !['Persona natural', 'Sociedad'].includes(form.taxpayerType)) return 'Selecciona el tipo de contribuyente.';
  return '';
}

function ClientModal({ onClose, onSave, clientToEdit, clients = [], isAdmin = false, assignableUsers = [] }) {
  const [form, setForm] = useState({
    idType: clientToEdit ? (clientToEdit.idType || (clientToEdit.ruc?.length === 10 ? 'cedula' : 'ruc')) : 'ruc',
    ruc: clientToEdit ? clientToEdit.ruc : '',
    name: clientToEdit ? clientToEdit.name : '',
    owner: clientToEdit ? clientToEdit.owner : '',
    email: clientToEdit ? (clientToEdit.email || '') : '',
    phone: clientToEdit ? (clientToEdit.phone || '') : '',
    taxRegime: clientToEdit ? (clientToEdit.taxRegime || 'Régimen general') : 'Régimen general',
    accounting: clientToEdit ? (clientToEdit.accounting || 'Sí') : 'Sí',
    taxpayerType: clientToEdit ? (clientToEdit.taxpayerType || 'Sociedad') : 'Sociedad',
    clientStatus: clientToEdit ? (clientToEdit.clientStatus || 'Activo') : 'Activo',
    assignedUserCode: clientToEdit ? (clientToEdit.userCode || '') : ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});
  const initialForm = useMemo(() => JSON.stringify(form), []);
  const dirty = JSON.stringify(form) !== initialForm;
  const validationError = validateClientForm(form, isAdmin, clientToEdit);
  const visibleValidationError = Object.keys(touched).map(field => validateClientField(form, field)).find(Boolean) || '';

  const update = (key, value) => { setTouched(current => ({ ...current, [key]: true })); setForm(current => ({ ...current, [key]: value })); };
  const numbersOnly = (key, value) => update(key, value.replace(/\D/g, ''));

  const submit = async (event) => {
    event.preventDefault();
    if (validationError) return setError(validationError);
    const normalized = { ...form, ruc: form.ruc.trim(), name: form.name.trim(), owner: form.owner.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim() };
    const duplicate = clients.find(item => String(item.id) !== String(clientToEdit?.id || '')
      && String(item.ruc || '').trim() === normalized.ruc);
    if (duplicate) {
      return setError('El RUC o número de identificación ya está registrado.');
    }
    setSaving(true);
    if (false && isAdmin && !clientToEdit && !form.assignedUserCode) return setError('Selecciona el contador responsable del cliente.');
    if (false && form.idType === 'cedula' && !/^\d{10}$/.test(form.ruc)) {
      return setError('La cédula debe tener exactamente 10 dígitos.');
    }
    if (false && form.idType === 'ruc' && !/^\d{10}001$/.test(form.ruc)) {
      return setError('El RUC debe tener 13 dígitos y terminar en 001.');
    }
    if (false && !/^\S+@\S+\.\S+$/.test(form.email)) {
      return setError('Ingresa un correo electrónico válido.');
    }
    try {
      await onSave(normalized);
    } catch (saveError) {
      setError(saveError?.response?.data?.error || saveError?.message || 'No se pudo guardar el cliente.');
      setSaving(false);
    }
  };
  const cancel = () => {
    if (!dirty || window.confirm('Hay cambios sin guardar. ¿Deseas cancelar y perderlos?')) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal client-modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}><Icon name="close"/></button>
        <p className="eyebrow">CLIENTES</p>
        <h2>{clientToEdit ? 'Editar cliente' : 'Nuevo cliente'}</h2>
        <p>{clientToEdit ? 'Modifica los datos generales y la configuración tributaria.' : 'Registra sus datos generales y la configuración tributaria.'}</p>

        <div className="form-grid">
          <label>Tipo de identificación *
            <select value={form.idType} onChange={e => { update('idType', e.target.value); update('ruc', ''); }} disabled={!!clientToEdit}>
              <option value="ruc">RUC</option>
              <option value="passport">Pasaporte</option>
              <option value="cedula">Cédula</option>
            </select>
          </label>
          <label>{form.idType === 'ruc' ? 'RUC *' : 'Cédula *'}
            <input inputMode={form.idType === 'passport' ? 'text' : 'numeric'} pattern={form.idType === 'passport' ? '[A-Za-z0-9]*' : '[0-9]*'} maxLength={form.idType === 'ruc' ? 13 : form.idType === 'cedula' ? 10 : 12} value={form.ruc} onChange={e => form.idType === 'passport' ? update('ruc', e.target.value.replace(/[^A-Za-z0-9]/g, '')) : numbersOnly('ruc', e.target.value)} placeholder={form.idType === 'ruc' ? 'Ej. 1799999999001' : form.idType === 'cedula' ? 'Ej. 0999999999' : 'Ej. ABC123456'} disabled={!!clientToEdit}/>
          </label>
          <label>Razón social *
            <input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Nombre legal de la empresa"/>
          </label>
          <label>Responsable *
            <input value={form.owner} onChange={e => update('owner', e.target.value)} placeholder="Nombre completo"/>
          </label>
          <label>Correo *
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="correo@empresa.com"/>
          </label>
          <label>Teléfono *
            <input inputMode="numeric" pattern="[0-9]*" maxLength="15" value={form.phone} onChange={e => numbersOnly('phone', e.target.value)} placeholder="Ej. 0991234567"/>
          </label>
          <label>Estado
            <select value={form.clientStatus} onChange={e => update('clientStatus', e.target.value)}>
              <option>Activo</option>
              <option>Inactivo</option>
            </select>
          </label>
          {isAdmin && !clientToEdit && <label>Contador asignado *
            <select value={form.assignedUserCode} onChange={e => update('assignedUserCode', e.target.value)}>
              <option value="">Selecciona un contador</option>
              {assignableUsers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>}
        </div>

        <div className="tax-section">
          <strong>Configuración tributaria</strong>
          <div className="form-grid">
            <label>Tipo de contribuyente
              <select value={form.taxpayerType} onChange={e => update('taxpayerType', e.target.value)}>
                <option>Persona natural</option>
                <option>Sociedad</option>
              </select>
            </label>
            <label>Régimen tributario
              <select value={form.taxRegime} onChange={e => update('taxRegime', e.target.value)}>
                <option>Régimen general</option>
                <option>RIMPE emprendedor</option>
                <option>RIMPE negocio popular</option>
                <option>Otro</option>
              </select>
            </label>
            <label>Obligado a llevar contabilidad
              <select value={form.accounting} onChange={e => update('accounting', e.target.value)}>
                <option>Sí</option>
                <option>No</option>
              </select>
            </label>
          </div>
        </div>

        {(error || visibleValidationError) && <div className="form-error">{error || visibleValidationError}</div>}

        <div className="modal-actions">
          <button type="button" className="outline" onClick={cancel} disabled={saving}>Cancelar</button>
          <button className="primary" disabled={saving || Boolean(validationError)}>{saving ? 'Guardando…' : clientToEdit ? 'Guardar cambios' : 'Guardar cliente'}</button>
        </div>
      </form>
    </div>
  );
}

// Vite puede reevaluar este módulo durante HMR. Reutilizar la raíz evita
// crear dos raíces sobre el mismo contenedor y previene pantallas en blanco.
const rootElement = document.getElementById('root');
const appRoot = globalThis.__contamaticRoot || (globalThis.__contamaticRoot = createRoot(rootElement));

appRoot.render(
  // BrowserRouter habilita navegación y URLs reales en React.
  <BrowserRouter>
    {/* AuthProvider comparte el usuario con toda la aplicación. */}
    <AuthProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </AuthProvider>
  </BrowserRouter>
); 
