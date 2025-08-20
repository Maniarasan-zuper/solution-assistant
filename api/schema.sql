CREATE DATABASE IF NOT EXISTS workflow_markup CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE workflow_markup;

CREATE TABLE IF NOT EXISTS Customer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  notes TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Event (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customerId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  CONSTRAINT fk_event_customer FOREIGN KEY (customerId) REFERENCES Customer(id) ON DELETE CASCADE,
  INDEX idx_event_customer (customerId)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Flow (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId INT NOT NULL,
  parentFlowId INT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  link TEXT,
  CONSTRAINT fk_flow_event FOREIGN KEY (eventId) REFERENCES Event(id) ON DELETE CASCADE,
  CONSTRAINT fk_flow_parent FOREIGN KEY (parentFlowId) REFERENCES Flow(id) ON DELETE CASCADE,
  INDEX idx_flow_event (eventId),
  INDEX idx_flow_parent (parentFlowId)
) ENGINE=InnoDB;
