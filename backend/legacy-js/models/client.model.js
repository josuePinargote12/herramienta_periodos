// Almacenamiento temporal en memoria; se pierde al reiniciar el backend.
const clients = [];
// Devuelve todos los clientes.
export const findAll = () => clients;
// Busca un cliente por su identificador.
export const findById = id => clients.find(client => client.id === id);
// Crea un cliente con id y fecha generados por el backend.
export const create = data => { const client = { id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() }; clients.push(client); return client; };
