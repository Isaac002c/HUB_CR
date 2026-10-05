-- Prazos operacionais não podem permanecer no fim de semana.
-- Sábado avança dois dias e domingo avança um dia, preservando o horário.
UPDATE fines
   SET due_date = due_date + CASE EXTRACT(ISODOW FROM due_date)
                              WHEN 6 THEN INTERVAL '2 days'
                              WHEN 7 THEN INTERVAL '1 day'
                            END,
       updated_at = NOW()
 WHERE due_date IS NOT NULL
   AND EXTRACT(ISODOW FROM due_date) IN (6, 7);
