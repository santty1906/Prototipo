-- =============================================================================
-- Sample data — optional. Run it to have something to look at.
--   supabase db reset          (runs migrations + this file)
--   or paste into the SQL editor
-- =============================================================================

insert into public.profiles (full_name, email, phone, "position", department, education, experience_years, summary)
values
  ('Ana Ramírez',   'ana.ramirez@example.com',   '+34 600 111 222', 'Senior Frontend Engineer', 'Engineering', 'BSc Computer Science, UPM',      8,  'Design-system work and accessibility-first React. Mentors two juniors.'),
  ('Diego Fuentes', 'diego.fuentes@example.com', '+34 600 333 444', 'Data Analyst',             'Analytics',   'MSc Statistics, UB',             4,  'SQL-heavy reporting; built the current revenue dashboard.'),
  ('Marta Iglesias','marta.iglesias@example.com','+34 600 555 666', 'Product Manager',          'Product',     'MBA, IE Business School',        11, 'Ran two 0-to-1 launches. Strong at cutting scope.'),
  ('Luis Cabrera',  'luis.cabrera@example.com',  null,              'Backend Engineer',         'Engineering', 'BSc Software Engineering, UPV',   2,  'Go and Postgres. Fast learner, still needs review on schema design.'),
  ('Sofía Novoa',   'sofia.novoa@example.com',   '+34 600 777 888', 'UX Researcher',            'Design',      'MA Human-Computer Interaction',   6,  'Moderated studies and survey design; publishes clear, short readouts.')
on conflict do nothing;

with p as (select id, full_name from public.profiles)
insert into public.profile_capabilities (profile_id, code, label)
select p.id, c.code, c.label
from p
join (values
  ('Ana Ramírez',    'react',            'React'),
  ('Ana Ramírez',    'typescript',       'TypeScript'),
  ('Ana Ramírez',    'accessibility',    'Accessibility'),
  ('Ana Ramírez',    'design-systems',   'Design Systems'),
  ('Diego Fuentes',  'sql',              'SQL'),
  ('Diego Fuentes',  'python',           'Python'),
  ('Diego Fuentes',  'data-analysis',    'Data Analysis'),
  ('Marta Iglesias', 'product-strategy', 'Product Strategy'),
  ('Marta Iglesias', 'stakeholder-management', 'Stakeholder Management'),
  ('Marta Iglesias', 'data-analysis',    'Data Analysis'),
  ('Luis Cabrera',   'go',               'Go'),
  ('Luis Cabrera',   'sql',              'SQL'),
  ('Luis Cabrera',   'typescript',       'TypeScript'),
  ('Sofía Novoa',    'user-research',    'User Research'),
  ('Sofía Novoa',    'survey-design',    'Survey Design'),
  ('Sofía Novoa',    'accessibility',    'Accessibility')
) as c(full_name, code, label) on c.full_name = p.full_name
on conflict do nothing;

with p as (select id, full_name from public.profiles)
insert into public.profile_attitudes (profile_id, code, label)
select p.id, a.code, a.label
from p
join (values
  ('Ana Ramírez',    'mentoring',     'Mentoring'),
  ('Ana Ramírez',    'ownership',     'Ownership'),
  ('Diego Fuentes',  'analytical',    'Analytical'),
  ('Diego Fuentes',  'detail-oriented','Detail Oriented'),
  ('Marta Iglesias', 'leadership',    'Leadership'),
  ('Marta Iglesias', 'ownership',     'Ownership'),
  ('Marta Iglesias', 'adaptability',  'Adaptability'),
  ('Luis Cabrera',   'curiosity',     'Curiosity'),
  ('Luis Cabrera',   'collaboration', 'Collaboration'),
  ('Sofía Novoa',    'empathy',       'Empathy'),
  ('Sofía Novoa',    'collaboration', 'Collaboration'),
  ('Sofía Novoa',    'analytical',    'Analytical')
) as a(full_name, code, label) on a.full_name = p.full_name
on conflict do nothing;
