/*
  Migración: declaraciones anuales del Impuesto a la Renta.
  Esta migración ya fue aplicada en la base de datos.
  No volver a ejecutar si las columnas, restricciones y tabla ya existen.
*/

/* =========================================================
   VERIFICACIÓN PREVIA
   ========================================================= */
SELECT VERSION();

/* =========================================================
   PARTE 1. Preparar documentos_contables para documentos
   anuales (Formulario 101, sin period_id)
   ========================================================= */

ALTER TABLE documentos_contables
    MODIFY COLUMN period_id BIGINT UNSIGNED NULL;

ALTER TABLE documentos_contables
    ADD COLUMN client_id CHAR(36) NULL AFTER period_id;

ALTER TABLE documentos_contables
    ADD COLUMN fiscal_year SMALLINT UNSIGNED NULL AFTER client_id;

ALTER TABLE documentos_contables
    ADD CONSTRAINT fk_documentos_contables_cliente
        FOREIGN KEY (client_id)
        REFERENCES clientes(id);

/* Un documento pertenece a un mes o a un año, nunca a ambos. */
ALTER TABLE documentos_contables
    ADD CONSTRAINT chk_documentos_scope CHECK (
        (period_id IS NOT NULL AND client_id IS NULL AND fiscal_year IS NULL)
        OR
        (period_id IS NULL AND client_id IS NOT NULL AND fiscal_year IS NOT NULL)
    );

/* =========================================================
   PARTE 2. Crear tabla declaraciones_anuales
   ========================================================= */

CREATE TABLE declaraciones_anuales (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    client_id CHAR(36) NOT NULL,
    income_tax_config_id BIGINT UNSIGNED NOT NULL,
    fiscal_year SMALLINT UNSIGNED NOT NULL,

    /* Base acumulada congelada al cerrar el año */
    accumulated_base DECIMAL(14,2) NOT NULL DEFAULT 0.00,

    /* Tarifa usada en el cálculo */
    rate DECIMAL(7,4) NOT NULL DEFAULT 0.0000,

    /* Resultado del cálculo */
    calculated_tax DECIMAL(14,2) NOT NULL DEFAULT 0.00,

    /* Ciclo de vida de la declaración anual */
    status ENUM(
        'acumulando',
        'calculada',
        'presentada',
        'pagada'
    ) NOT NULL DEFAULT 'acumulando',

    /* Fecha máxima para declarar y pagar */
    due_date DATE NULL,

    /* Fecha de presentación del Formulario 101 */
    presentation_date DATETIME NULL,

    /* Datos del pago */
    paid_amount DECIMAL(14,2) NULL,
    payment_date DATETIME NULL,

    /* Documento anual asociado */
    annual_document_id BIGINT UNSIGNED NULL,

    /* Usuario que creó o gestionó el registro */
    created_by INT(11) NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    /* Una declaración anual por cliente y año */
    UNIQUE KEY uq_declaraciones_anuales_cliente_anio (
        client_id,
        fiscal_year
    ),

    KEY idx_declaraciones_anuales_status (status),
    KEY idx_declaraciones_anuales_due_date (due_date),

    CONSTRAINT fk_declaraciones_anuales_cliente
        FOREIGN KEY (client_id)
        REFERENCES clientes(id),

    CONSTRAINT fk_declaraciones_anuales_configuracion
        FOREIGN KEY (income_tax_config_id)
        REFERENCES configuraciones_impuesto_renta(id),

    CONSTRAINT fk_declaraciones_anuales_documento
        FOREIGN KEY (annual_document_id)
        REFERENCES documentos_contables(id),

    CONSTRAINT fk_declaraciones_anuales_usuario
        FOREIGN KEY (created_by)
        REFERENCES usuarios(COD_USUEMP)
);
