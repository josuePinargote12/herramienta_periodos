# Migraciones SQL oficiales

Ejecutar las migraciones en este orden sobre una base nueva:

1. `001_create_clientes.sql`
2. `002_create_accounting_periods.sql`
3. `003_create_accounting_documents.sql`
4. `004_create_annual_tax.sql`
5. `005_reconcile_accounting_schema.sql`
6. `006_create_permisos_contamatic.sql`
7. `007_enable_audit_history.sql`
8. `008_add_taxpayer_type_to_clients.sql`
9. `009_add_identification_type_to_clients.sql`
10. `009_add_annual_tax_calculation_inputs.sql`
11. `010_create_cxc_cxp_movements.sql`
12. `011_remove_tax_fields_from_cxc_cxp.sql`
13. `012_add_iva_declaration_details.sql`
14. `013_add_iva_detail_rows.sql`
15. `014_add_retention_declaration_details.sql`
16. `015_add_optional_portfolio_review.sql`
17. `016_add_employee_expense.sql`
18. `017_add_income_tax_retention.sql`

Los archivos de `legacy/` son copias de esquemas anteriores y no deben
ejecutarse en instalaciones nuevas. Se conservan únicamente como referencia
para bases antiguas.
