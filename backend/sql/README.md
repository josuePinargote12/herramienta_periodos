# Migraciones SQL oficiales

Ejecutar las migraciones en este orden sobre una base nueva:

1. `001_create_clientes.sql`
2. `002_create_accounting_periods.sql`
3. `003_create_accounting_documents.sql`
4. `004_create_annual_tax.sql`
5. `005_reconcile_accounting_schema.sql`

Los archivos de `legacy/` son copias de esquemas anteriores y no deben
ejecutarse en instalaciones nuevas. Se conservan únicamente como referencia
para bases antiguas.
