
UPDATE public.poc_profiles SET aliases = array(SELECT DISTINCT unnest(aliases || ARRAY['aashi','aashi arora'])) WHERE name='Aashi Arora';
UPDATE public.poc_profiles SET aliases = array(SELECT DISTINCT unnest(aliases || ARRAY['ajaya','ajaya kaushik'])) WHERE name='Ajaya Kaushik';
UPDATE public.poc_profiles SET aliases = array(SELECT DISTINCT unnest(aliases || ARRAY['dibyendu','dibyendu sir','dibyendu choudhury'])) WHERE name='Dibyendu Choudhury';
UPDATE public.poc_profiles SET aliases = array(SELECT DISTINCT unnest(aliases || ARRAY['jasleen','jasleen kaur taluja'])) WHERE name='Jasleen Kaur Taluja';
UPDATE public.poc_profiles SET aliases = array(SELECT DISTINCT unnest(aliases || ARRAY['mansi b','mansi bhargwa'])) WHERE name='Mansi Bhargwa';
UPDATE public.poc_profiles SET aliases = array(SELECT DISTINCT unnest(aliases || ARRAY['saumya','saumya dixit','saumya singh'])) WHERE name='Saumya Singh';
UPDATE public.poc_profiles SET aliases = array(SELECT DISTINCT unnest(aliases || ARRAY['sidhartha','sidhartha gautam bal'])) WHERE name='Sidhartha Gautam Bal';
UPDATE public.poc_profiles SET aliases = array(SELECT DISTINCT unnest(aliases || ARRAY['vibhuti','vibhuti singh'])) WHERE name='Vibhuti Singh';
