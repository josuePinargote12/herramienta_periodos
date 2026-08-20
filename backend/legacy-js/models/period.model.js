// Almacenamiento temporal de períodos; todavía no utiliza una tabla de base de datos.
const periods = [];
// Filtra por año y/o cliente cuando esos parámetros existen.
export const findAll = filters => periods.filter(period => (!filters.year || period.year === filters.year) && (!filters.clientId || period.clientId === filters.clientId));
// Busca el período, combina sus datos y registra la fecha de modificación.
export const update = (id, data) => { const index = periods.findIndex(period => period.id === id); if (index < 0) return null; periods[index] = { ...periods[index], ...data, updatedAt: new Date().toISOString() }; return periods[index]; };
