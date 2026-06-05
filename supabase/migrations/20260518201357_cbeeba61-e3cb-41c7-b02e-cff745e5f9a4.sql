DELETE FROM public.field_mapping_registry
WHERE tab_name = 'LMP Tracker'
  AND sheet_column IN (
    'Admin Owner','Allocator','Behavioral','Composite (Primary)',
    'Composite (Secondary)','Convert Name(s)','One-to-One Mock',
    'Placement Progress','Prep Progress'
  );