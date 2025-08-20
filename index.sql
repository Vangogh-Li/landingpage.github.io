-- 1) Create DB (one time)
CREATE DATABASE IF NOT EXISTS auth_demo
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE auth_demo;

-- 2) Create users table (idempotent)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3) Create first admin (replace <HASH_HERE> with a real PHP-generated hash)
INSERT INTO users (email, password_hash, is_admin)
VALUES ('admin@gmail.com', 'isadmin', 1)
ON DUPLICATE KEY UPDATE is_admin = VALUES(is_admin);
