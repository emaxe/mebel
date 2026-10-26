CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE email_tokens (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('verify', 'reset')),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

-- id генерирует клиент (newId()), поэтому ключ составной
CREATE TABLE projects (
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  id          text NOT NULL,
  name        text NOT NULL,
  type        text NOT NULL DEFAULT '',
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  share_token text UNIQUE,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX projects_sync_idx ON projects (user_id, updated_at);

CREATE TABLE project_thumbs (
  user_id    uuid NOT NULL,
  project_id text NOT NULL,
  jpeg       bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id),
  FOREIGN KEY (user_id, project_id) REFERENCES projects ON DELETE CASCADE
);

CREATE TABLE project_versions (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL,
  project_id text NOT NULL,
  version    integer NOT NULL,
  name       text NOT NULL,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, project_id) REFERENCES projects ON DELETE CASCADE
);
CREATE INDEX project_versions_idx ON project_versions (user_id, project_id, id DESC);

CREATE TABLE catalogs (
  user_id    uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  data       jsonb NOT NULL,
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
