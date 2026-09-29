-- ============================================================================
-- SQL Helper: Identify & Clean Up Duplicate / Anomaly Client Records
-- Run this in your Supabase SQL Editor if duplicate client records were created.
-- ============================================================================

-- STEP 1: PREVIEW DUPLICATES (Run this first to inspect)
-- This shows all client records that have duplicate names and phone numbers.
SELECT 
    TRIM("NAME") AS client_name,
    "PHONE NUMBER",
    COUNT(*) AS total_entries,
    ARRAY_AGG(id ORDER BY updated_at DESC) AS id_list,
    MIN(updated_at) AS first_created,
    MAX(updated_at) AS latest_updated
FROM public.clients
WHERE "NAME" IS NOT NULL AND "NAME" != ''
GROUP BY TRIM("NAME"), "PHONE NUMBER"
HAVING COUNT(*) > 1
ORDER BY total_entries DESC;


-- STEP 2: REMOVE DUPLICATES (Preserves the newest entry, deletes older copies)
-- Uncomment and run the query below when you are ready to delete duplicate copies:

/*
DELETE FROM public.clients
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY TRIM(LOWER("NAME")), TRIM("PHONE NUMBER") 
        ORDER BY updated_at DESC, id DESC
      ) AS rank_order
    FROM public.clients
    WHERE "NAME" IS NOT NULL AND "NAME" != ''
  ) ranked
  WHERE ranked.rank_order > 1
);
*/
