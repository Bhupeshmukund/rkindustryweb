-- Create dealership_applications table
CREATE TABLE IF NOT EXISTS dealership_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- Step 1: Basic Details
  company_name VARCHAR(255) NOT NULL,
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  contact_person_name VARCHAR(255) NOT NULL,
  designation VARCHAR(100),
  email VARCHAR(255) NOT NULL,
  mobile_number VARCHAR(50) NOT NULL,
  
  -- Step 2: Business Qualification
  nature_of_business ENUM('Importer', 'Distributor', 'Trader', 'Manufacturer', 'Government Supplier') NOT NULL,
  years_in_business ENUM('0-2', '3-5', '5-10', '10+') NOT NULL,
  product_categories JSON,
  warehouse_facility ENUM('Yes', 'No') NOT NULL,
  brief_message TEXT,
  
  -- Additional fields
  recaptcha_token TEXT,
  status ENUM('pending', 'reviewed', 'approved', 'rejected') DEFAULT 'pending',
  admin_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
