CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY, email varchar(255) NOT NULL UNIQUE, hashed_password varchar(255) NOT NULL,
  full_name varchar(255) NOT NULL, role role_enum NOT NULL, is_active boolean NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY, name varchar(255) NOT NULL, category varchar(100) NOT NULL,
  description text, base_price numeric(10,2) NOT NULL, current_price numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url varchar(500);
CREATE INDEX IF NOT EXISTS ix_products_category ON products(category);
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, content text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5), reviewer_display_name varchar(255) NOT NULL,
  created_at timestamptz NOT NULL
);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sentiment_label varchar(20),
  ADD COLUMN IF NOT EXISTS sentiment_score double precision, ADD COLUMN IF NOT EXISTS emotion_label varchar(30),
  ADD COLUMN IF NOT EXISTS emotion_score double precision, ADD COLUMN IF NOT EXISTS fake_score double precision,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz, ADD COLUMN IF NOT EXISTS analysis_error text;
CREATE INDEX IF NOT EXISTS ix_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS ix_reviews_user_id ON reviews(user_id);
CREATE TABLE IF NOT EXISTS review_aspect_sentiments (
  id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  aspect varchar(50) NOT NULL, sentiment_label varchar(20) NOT NULL,
  sentiment_score double precision NOT NULL, evidence_text text NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_review_aspect_sentiments_review_id ON review_aspect_sentiments(review_id);
CREATE TABLE IF NOT EXISTS competitor_prices (
  id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  competitor_name varchar(255) NOT NULL, price numeric(10,2) NOT NULL, recorded_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_competitor_prices_product_id ON competitor_prices(product_id);
CREATE TABLE IF NOT EXISTS demand_history (
  id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  record_date date NOT NULL, units_sold integer NOT NULL, price_at_time numeric(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_demand_history_product_id ON demand_history(product_id);
CREATE INDEX IF NOT EXISTS ix_demand_history_record_date ON demand_history(record_date);
CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY, product_id uuid NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  stock_level integer NOT NULL, reorder_threshold integer NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alert_type varchar(50) NOT NULL, message text NOT NULL, severity varchar(20) NOT NULL,
  is_read boolean NOT NULL, created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS ix_alerts_product_id ON alerts(product_id);
CREATE TABLE IF NOT EXISTS catalogue_imports (
  version varchar(100) PRIMARY KEY
);
