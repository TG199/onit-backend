

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('USER', 'ADMIN')) DEFAULT 'USER',
  location TEXT,
  wallet_balance INTEGER DEFAULT 0,
  is_blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ads (
  id UUID PRIMARY KEY,
  image_url TEXT NOT NULL,
  link_url TEXT,
  target_locations TEXT[],
  status TEXT CHECK (status IN ('active', 'paused', 'expired')) DEFAULT 'paused',
  value_per_view INTEGER NOT NULL,
  max_views INTEGER,
  total_views INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ad_engagements (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  ad_id UUID REFERENCES ads(id),
  status TEXT CHECK (
    status IN ('downloaded', 'submitted', 'approved', 'rejected')
  ) DEFAULT 'downloaded',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, ad_id)
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY,
  engagement_id UUID REFERENCES ad_engagements(id),
  screenshot_url TEXT NOT NULL,
  claimed_views INTEGER NOT NULL,
  verified_views INTEGER,
  status TEXT CHECK (
    status IN ('pending', 'approved', 'rejected')
  ) DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE wallet_ledger (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  amount INTEGER NOT NULL,
  type TEXT CHECK (type IN ('credit', 'debit')),
  reason TEXT NOT NULL,
  reference_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE withdrawals (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  amount INTEGER NOT NULL,
  bank_details JSONB NOT NULL,
  status TEXT CHECK (
    status IN ('pending', 'approved', 'paid', 'rejected')
  ) DEFAULT 'pending',
  processed_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE admin_logs (
  id UUID PRIMARY KEY,
  admin_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
