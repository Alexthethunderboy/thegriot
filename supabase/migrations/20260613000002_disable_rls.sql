-- Disable Row Level Security (RLS) entirely for the prototype phase
-- This allows both the Next.js API (insert) and the frontend (select) to access the data without a Service Role Key.

ALTER TABLE clusters DISABLE ROW LEVEL SECURITY;
ALTER TABLE epochs DISABLE ROW LEVEL SECURITY;
ALTER TABLE entities DISABLE ROW LEVEL SECURITY;
ALTER TABLE claims DISABLE ROW LEVEL SECURITY;
ALTER TABLE edges DISABLE ROW LEVEL SECURITY;
ALTER TABLE sources DISABLE ROW LEVEL SECURITY;
