CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  logo_url VARCHAR(500),
  brand_color VARCHAR(20),
  brand_color_dark VARCHAR(20),
  tagline VARCHAR(255),
  slug VARCHAR(120) UNIQUE,
  status VARCHAR(30) DEFAULT 'ativo',
  email VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'seller',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  seller_id UUID REFERENCES sellers(id),
  name VARCHAR(255) NOT NULL,
  cpf_cnpj VARCHAR(40),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  seller_id UUID REFERENCES sellers(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(100),
  status VARCHAR(60) DEFAULT 'new',
  value NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID REFERENCES clients(id),
  seller_id UUID REFERENCES sellers(id),
  title VARCHAR(255),
  service_type VARCHAR(120),
  status VARCHAR(60) DEFAULT 'pending',
  value NUMERIC(14,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID REFERENCES clients(id),
  seller_id UUID REFERENCES sellers(id),
  contract_id UUID REFERENCES contracts(id),
  service_type_id UUID REFERENCES service_types(id),
  vehicle_plate VARCHAR(20),
  auto_number VARCHAR(100),
  real_infractor_name VARCHAR(255),
  status VARCHAR(60) DEFAULT 'pending',
  amount NUMERIC(14,2) DEFAULT 0,
  due_date DATE,
  protocol_number VARCHAR(100),
  protocol_date DATE,
  protocol_status VARCHAR(60),
  protocol_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS multas_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  seller_id UUID REFERENCES sellers(id),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  vehicle_plate VARCHAR(20),
  status VARCHAR(40) DEFAULT 'entrada' CHECK (status IN ('entrada','possui_defensor','nao_quer_defender','negociacao','fechado','perdido')),
  value NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80),
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  type VARCHAR(80),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  seller_id UUID REFERENCES sellers(id),
  month INTEGER,
  year INTEGER,
  target_value NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(500),
  file_type VARCHAR(100),
  file_size BIGINT,
  category VARCHAR(100),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fine_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  fine_id UUID REFERENCES fines(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(500),
  file_type VARCHAR(100),
  file_size BIGINT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fine_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  fine_id UUID REFERENCES fines(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(120) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sellers_tenant ON sellers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fines_tenant ON fines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_multas_leads_tenant ON multas_leads(tenant_id);
