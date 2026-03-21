-- 顧客管理シート DBセットアップ

-- 患者テーブル
CREATE TABLE IF NOT EXISTS patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  furigana TEXT DEFAULT '',
  birth_date DATE,
  gender TEXT DEFAULT '男性',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  occupation TEXT DEFAULT '',
  referral_source TEXT DEFAULT '',
  chief_complaint TEXT DEFAULT '',
  medical_history TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 施術記録テーブル
CREATE TABLE IF NOT EXISTS visit_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_number INTEGER DEFAULT 1,
  symptoms TEXT DEFAULT '',
  treatment_content TEXT DEFAULT '',
  body_condition TEXT DEFAULT '',
  improvement TEXT DEFAULT '',
  atmosphere TEXT DEFAULT '普通' CHECK (atmosphere IN ('良好', '普通', 'やや悪い', '悪い')),
  next_plan TEXT DEFAULT '',
  next_appointment DATE,
  payment_amount INTEGER DEFAULT 0,
  payment_method TEXT DEFAULT '現金' CHECK (payment_method IN ('現金', 'カード', 'QR決済', '回数券', 'その他')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
CREATE INDEX IF NOT EXISTS idx_visit_records_patient ON visit_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_visit_records_date ON visit_records(visit_date);
CREATE INDEX IF NOT EXISTS idx_visit_records_next ON visit_records(next_appointment);

-- RLS有効化
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_records ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（認証ユーザーは全データアクセス可能）
CREATE POLICY "認証ユーザーは患者を操作可能" ON patients FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "認証ユーザーは施術記録を操作可能" ON visit_records FOR ALL USING (auth.role() = 'authenticated');

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
