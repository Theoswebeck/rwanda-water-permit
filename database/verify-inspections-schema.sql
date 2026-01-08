-- =====================================================
-- Verify `public.inspections` has all columns required by the app.
-- Returns rows for any missing columns.
-- =====================================================

WITH expected(column_name) AS (
  VALUES
    ('inspection_template'),
    ('operator_name'),
    ('operator_id_tin'),
    ('operator_residence'),
    ('catchment_level1'),
    ('catchment_level2'),
    ('inspection_documents'),
    ('review_status'),
    ('review_notes'),
    ('reviewed_by'),
    ('reviewed_at'),
    ('activity_type'),
    ('activity_starting_date'),
    ('allowed_quantity'),
    ('allowed_unit'),
    ('authorized_abstraction_method'),
    ('actual_quantity'),
    ('actual_unit'),
    ('actual_abstraction_method'),
    ('measurement_device_type'),
    ('measurement_device_notes'),
    ('measurement_device_photo_taken'),
    ('wastewater_system_type'),
    ('wastewater_system_effectiveness'),
    ('wastewater_system_photos_taken'),
    ('wastewater_notes'),
    ('fees_payment_verified'),
    ('fees_payment_amount'),
    ('fees_payment_proof'),
    ('fees_outstanding_amount'),
    ('reports_submitted'),
    ('reports_submission_date'),
    ('reports_reference_number'),
    ('reports_proof'),
    ('water_use_conflicts'),
    ('conflict_severity'),
    ('catchment_protection_initiatives'),
    ('protection_photos_taken'),
    ('general_conclusion'),
    ('compliance_status'),
    ('authorized_surface_area_ha'),
    ('actual_surface_area_ha'),
    ('authorized_concession_boundaries'),
    ('actual_concession_boundaries'),
    ('employment_gender_breakdown'),
    ('ohs_gender_sensitive')
)
SELECT e.column_name AS missing_column
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = 'inspections'
 AND c.column_name = e.column_name
WHERE c.column_name IS NULL
ORDER BY e.column_name;


