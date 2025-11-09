-- Migration: create activities and activity_signups tables (utf8mb4_slovak_ci)
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
/*!40101 SET NAMES utf8mb4 */;

DROP TABLE IF EXISTS activity_signups;
DROP TABLE IF EXISTS activities;

CREATE TABLE activities (
  id_activity INT(11) NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_slovak_ci NOT NULL,
  description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_slovak_ci,
  image_url TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_slovak_ci,
  capacity INT(11) NOT NULL DEFAULT 1,
  attendees_count INT(11) NOT NULL DEFAULT 0,
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL,
  user_id INT(11) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id_activity),
  KEY idx_activities_user_id (user_id),
  KEY idx_activities_created_at (created_at),
  CONSTRAINT fk_activities_user FOREIGN KEY (user_id) REFERENCES users(id_user)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_slovak_ci;

CREATE TABLE activity_signups (
  id_signup INT(11) NOT NULL AUTO_INCREMENT,
  activity_id INT(11) NOT NULL,
  user_id INT(11) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_signup),
  UNIQUE KEY uq_activity_user (activity_id, user_id),
  KEY idx_signups_activity (activity_id),
  KEY idx_signups_user (user_id),
  CONSTRAINT fk_signups_activity FOREIGN KEY (activity_id) REFERENCES activities(id_activity)
    ON DELETE CASCADE,
  CONSTRAINT fk_signups_user FOREIGN KEY (user_id) REFERENCES users(id_user)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_slovak_ci;

COMMIT;
