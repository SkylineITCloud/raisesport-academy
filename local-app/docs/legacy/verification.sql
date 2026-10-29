-- Run once on your RaiseSport database.

-- 1) Track whether each account's email is verified
ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0;

-- IMPORTANT: accounts created before this change would otherwise be locked out of login.
UPDATE users SET email_verified = 1;

-- 2) One active code per user (hashed, never stored in plain text)
CREATE TABLE IF NOT EXISTS email_verifications (
  user_id      INT NOT NULL PRIMARY KEY,
  code_hash    CHAR(64) NOT NULL,
  expires_at   DATETIME NOT NULL,
  attempts     TINYINT NOT NULL DEFAULT 0,
  last_sent_at DATETIME NOT NULL,
  CONSTRAINT fk_ev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
