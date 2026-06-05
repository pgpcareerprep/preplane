
CREATE TABLE public.approved_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'poc' CHECK (role IN ('admin', 'moderator', 'poc')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_login_at timestamp with time zone
);

ALTER TABLE public.approved_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approved users"
ON public.approved_users
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins can manage approved users"
ON public.approved_users
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.approved_users (name, email, role) VALUES
  ('Abhinav Arora', 'abhinav.arora@mastersunion.org', 'admin'),
  ('Vidhu Goel', 'goel.vidhu@mastersunion.org', 'admin'),
  ('Gopika Kumar', 'gopika.kumar@mastersunion.org', 'admin'),
  ('Vidit Sinha', 'vidit.vishal@mastersunion.org', 'admin'),
  ('Sonali Awasthi', 'sonali.awasthi@mastersunion.org', 'admin'),
  ('Siddharth Jangir', 'siddharth.jangir@mastersunion.org', 'moderator'),
  ('Tanwir Alam Haque', 'tanwir.haque@mastersunion.org', 'moderator'),
  ('Radhika Goyal', 'radhika.goyal1@mastersunion.org', 'poc'),
  ('Santanu Goswami', 'santanu.goswami@mastersunion.org', 'poc'),
  ('Kriti Sharma', 'kriti.sharma2@mastersunion.org', 'poc'),
  ('Shubham Gupta', 'shubham.gupta1@mastersunion.org', 'poc'),
  ('Namita Bhatia', 'namita.bhatia@mastersunion.org', 'poc'),
  ('Riti Marwah', 'riti.marwah@mastersunion.org', 'poc'),
  ('Mansi Bhargwa', 'mansi.bhargava@mastersunion.org', 'poc'),
  ('Mansi Jain', 'mansi.jain@mastersunion.org', 'poc');
