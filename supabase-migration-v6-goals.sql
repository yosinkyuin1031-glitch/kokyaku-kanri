-- v6: 月間目標テーブル
CREATE TABLE IF NOT EXISTS cm_monthly_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL, -- 1-12
  revenue_goal BIGINT DEFAULT 0, -- 月間売上目標
  new_patient_goal INT DEFAULT 0, -- 月間新規目標
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, year, month)
);

-- RLS
ALTER TABLE cm_monthly_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_monthly_goals_select" ON cm_monthly_goals FOR SELECT USING (
  clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
);
CREATE POLICY "cm_monthly_goals_insert" ON cm_monthly_goals FOR INSERT WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
);
CREATE POLICY "cm_monthly_goals_update" ON cm_monthly_goals FOR UPDATE USING (
  clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
);
CREATE POLICY "cm_monthly_goals_delete" ON cm_monthly_goals FOR DELETE USING (
  clinic_id IN (SELECT clinic_id FROM clinic_members WHERE user_id = auth.uid())
);
