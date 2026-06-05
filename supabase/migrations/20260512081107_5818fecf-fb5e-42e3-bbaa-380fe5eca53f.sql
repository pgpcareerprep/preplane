DELETE FROM public.poc_registry
WHERE poc_type = 'prep'
  AND name NOT IN (
    'Abhinav Arora','Vidhu Goel','Gopika Kumar','Vidit Sinha','Sonali Awasthi',
    'Siddharth Jangir','Tanwir Alam Haque',
    'Radhika Goyal','Santanu Goswami','Kriti Sharma','Shubham Gupta',
    'Namita Bhatia','Riti Marwah','Mansi Bhargwa','Mansi Jain'
  );

DELETE FROM public.poc_profiles
WHERE role_type = 'prep_poc'
  AND name NOT IN (
    'Abhinav Arora','Vidhu Goel','Gopika Kumar','Vidit Sinha','Sonali Awasthi',
    'Siddharth Jangir','Tanwir Alam Haque',
    'Radhika Goyal','Santanu Goswami','Kriti Sharma','Shubham Gupta',
    'Namita Bhatia','Riti Marwah','Mansi Bhargwa','Mansi Jain'
  );