import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { uploadPaymentProof } from "../middleware/upload.js";
import Razorpay from "razorpay";
import crypto from "crypto";

const router = express.Router();

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || ""
});

// Helper function to handle image URLs for both production and local
const getImageUrl = (imagePath) => {
  if (!imagePath) return imagePath;
  // Add /backend prefix in production, keep as is in local
  return process.env.NODE_ENV === 'production' 
    ? `/backend${imagePath}` 
    : imagePath;
};

const buildPriceRange = variants => {
  if (!variants?.length) return "";
  const prices = variants
    .map(v => Number(v.price))
    .filter(p => Number.isFinite(p));

  if (!prices.length) return "";

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return min === max
    ? `Rs. ${min}`
    : `Rs. ${min} - ${max}`;
};

const mapProductsFromRows = rows => {
  const productsMap = new Map();

  rows.forEach(row => {
    if (!row.product_id) return;

    if (!productsMap.has(row.product_id)) {
      productsMap.set(row.product_id, {
        id: row.product_id,
        name: row.product_name,
        image: getImageUrl(row.product_image),
        description: row.product_description,
        categoryId: row.category_id,
        categorySlug: row.category_slug,
        categoryName: row.category_name,
        variants: [],
        images: []
      });
    }

    const product = productsMap.get(row.product_id);

    // Variants
    if (row.variant_id) {
      let variant = product.variants.find(v => v.id === row.variant_id);

      if (!variant) {
        variant = {
          id: row.variant_id,
          sku: row.variant_sku,
          price: row.variant_price,
          stock: row.variant_stock,
          attributes: []
        };
        product.variants.push(variant);
      }

      // Add attribute if it exists and not already added (deduplicate)
      if (row.attr_name && row.attr_value) {
        const attrExists = variant.attributes.some(
          a => a.name === row.attr_name && a.value === row.attr_value
        );
        if (!attrExists) {
          variant.attributes.push({
            name: row.attr_name,
            value: row.attr_value
          });
        }
      }
    }

    // Extra images
    if (row.img_id && row.img_path) {
      const already = product.images.find(img => img.id === row.img_id);
      if (!already) {
        product.images.push({
          id: row.img_id,
          image: getImageUrl(row.img_path),
          sortOrder: row.img_sort
        });
      }
    }
  });

  return Array.from(productsMap.values()).map(p => ({
    ...p,
    priceRange: buildPriceRange(p.variants)
  }));
};

router.get("/categories", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, slug, image FROM categories ORDER BY id DESC"
    );

    const categories = rows.map(cat => ({
      ...cat,
      image: getImageUrl(cat.image)
    }));

    res.json({ categories });
  } catch (err) {
    console.error("CATEGORIES FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/categories/:slug/products", async (req, res) => {
  try {
    const { slug } = req.params;

    const [[categoryRow]] = await db.query(
      "SELECT id, name, slug, image FROM categories WHERE slug = ?",
      [slug]
    );

    if (!categoryRow) {
      return res.status(404).json({ error: "Category not found" });
    }

    const category = {
      ...categoryRow,
      image: getImageUrl(categoryRow.image)
    };

    const [rows] = await db.query(
      `SELECT
         p.id as product_id,
         p.name as product_name,
         p.image as product_image,
         p.description as product_description,
         p.category_id as category_id,
         c.slug as category_slug,
         c.name as category_name,
         p.is_active as is_active,
         pv.id as variant_id,
         pv.sku as variant_sku,
         pv.price as variant_price,
         pv.stock as variant_stock,
         va.attribute_name as attr_name,
         va.attribute_value as attr_value,
         pi.id as img_id,
         pi.image as img_path,
         pi.sort_order as img_sort
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants pv ON pv.product_id = p.id
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN product_images pi ON pi.product_id = p.id
       WHERE p.category_id = ? AND p.is_active = 1
       ORDER BY p.id DESC, pv.id DESC, pi.sort_order ASC`,
      [category.id]
    );

    const products = mapProductsFromRows(rows).filter(p => p.isActive !== 0);

    res.json({ category, products });
  } catch (err) {
    console.error("CATEGORY PRODUCTS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [[productRow]] = await db.query(
      `SELECT
         p.id,
         p.category_id,
         p.name,
         p.image,
         p.description,
         p.is_active,
         c.slug as category_slug,
         c.name as category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`,
      [id]
    );

    if (!productRow) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if product is active
    if (productRow.is_active !== 1) {
      return res.status(404).json({ error: "Product not found" });
    }

    const [rows] = await db.query(
      `SELECT
         p.id as product_id,
         p.name as product_name,
         p.image as product_image,
         p.description as product_description,
         p.category_id as category_id,
         c.slug as category_slug,
         c.name as category_name,
         p.is_active as is_active,
         pv.id as variant_id,
         pv.sku as variant_sku,
         pv.price as variant_price,
         pv.stock as variant_stock,
         va.attribute_name as attr_name,
         va.attribute_value as attr_value,
         pi.id as img_id,
         pi.image as img_path,
         pi.sort_order as img_sort
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants pv ON pv.product_id = p.id
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN product_images pi ON pi.product_id = p.id
       WHERE p.id = ? AND p.is_active = 1
       ORDER BY pi.sort_order ASC`,
      [id]
    );

    const products = mapProductsFromRows(rows).filter(p => p.isActive !== 0);
    
    if (products.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const [product] = products;

    const [relatedRows] = await db.query(
      `SELECT
         p.id as product_id,
         p.name as product_name,
         p.image as product_image,
         p.description as product_description,
         p.category_id as category_id,
         c.slug as category_slug,
         c.name as category_name,
         p.is_active as is_active,
         pv.id as variant_id,
         pv.sku as variant_sku,
         pv.price as variant_price,
         pv.stock as variant_stock,
         va.attribute_name as attr_name,
         va.attribute_value as attr_value,
         pi.id as img_id,
         pi.image as img_path,
         pi.sort_order as img_sort
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants pv ON pv.product_id = p.id
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN product_images pi ON pi.product_id = p.id
       WHERE p.category_id = ? AND p.id <> ? AND p.is_active = 1
       ORDER BY p.id DESC, pi.sort_order ASC
       LIMIT 6`,
      [productRow.category_id, id]
    );

    const related = mapProductsFromRows(relatedRows).filter(p => p.isActive !== 0);

    res.json({ product, related });
  } catch (err) {
    console.error("PRODUCT FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET variants for a product (single query + group in JS)
// Endpoint: GET /api/public/products/:id/variants
router.get("/products/:id/variants", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `SELECT
         pv.id as variant_id,
         pv.sku,
         pv.price,
         pv.stock,
         va.attribute_name as attr_name,
         va.attribute_value as attr_value
       FROM product_variants pv
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       WHERE pv.product_id = ?
       ORDER BY pv.id ASC`,
      [id]
    );

    // Group rows by variant
    const variantsMap = new Map();

    for (const r of rows) {
      if (!variantsMap.has(r.variant_id)) {
        variantsMap.set(r.variant_id, {
          variant_id: r.variant_id,
          sku: r.sku,
          price: r.price,
          stock: r.stock,
          attributes: {}
        });
      }

      if (r.attr_name && r.attr_value) {
        variantsMap.get(r.variant_id).attributes[r.attr_name] = r.attr_value;
      }
    }

    const variants = Array.from(variantsMap.values());

    res.json({ variants });
  } catch (err) {
    console.error("PRODUCT VARIANTS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    
    let rows;
    
    if (!q || q.trim() === "") {
      // If no query, return all active products
      [rows] = await db.query(
        `SELECT
           p.id as product_id,
           p.name as product_name,
           p.image as product_image,
           p.description as product_description,
           p.category_id as category_id,
           c.slug as category_slug,
           c.name as category_name,
           p.is_active as is_active,
           pv.id as variant_id,
           pv.sku as variant_sku,
           pv.price as variant_price,
           pv.stock as variant_stock,
           va.attribute_name as attr_name,
           va.attribute_value as attr_value,
           pi.id as img_id,
           pi.image as img_path,
           pi.sort_order as img_sort
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_variants pv ON pv.product_id = p.id
         LEFT JOIN variant_attributes va ON va.variant_id = pv.id
         LEFT JOIN product_images pi ON pi.product_id = p.id
         WHERE p.is_active = 1
         ORDER BY p.name ASC, pv.id DESC, pi.sort_order ASC`
      );
      console.log(`Empty query: Found ${rows.length} rows from database`);
    } else {
      // If query exists, search for matching products (case-insensitive)
      const searchTerm = `%${q.trim()}%`;
      
      // First, find all product IDs that match the search criteria
      // Search in product name, description, and category name first
      const [matchingProductsByName] = await db.query(
        `SELECT DISTINCT p.id, p.name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.is_active = 1
           AND (
             LOWER(p.name) LIKE LOWER(?) 
             OR LOWER(p.description) LIKE LOWER(?)
             OR LOWER(c.name) LIKE LOWER(?)
           )`,
        [searchTerm, searchTerm, searchTerm]
      );
      
      console.log(`Products matching by name/description/category: ${matchingProductsByName.map(p => `${p.id}:${p.name}`).join(', ')}`);
      
      // Debug: Check all products with "stainless" in name
      const [allStainlessProducts] = await db.query(
        `SELECT id, name, is_active FROM products WHERE LOWER(name) LIKE '%stainless%'`
      );
      console.log(`All products with 'stainless' in name: ${allStainlessProducts.map(p => `${p.id}:${p.name} (active:${p.is_active})`).join(', ')}`);
      
      // Also search in variants and attributes
      const [matchingProductsByVariant] = await db.query(
        `SELECT DISTINCT p.id, p.name
         FROM products p
         LEFT JOIN product_variants pv ON pv.product_id = p.id
         LEFT JOIN variant_attributes va ON va.variant_id = pv.id
         WHERE p.is_active = 1
           AND (
             LOWER(pv.sku) LIKE LOWER(?)
             OR LOWER(va.attribute_value) LIKE LOWER(?)
           )`,
        [searchTerm, searchTerm]
      );
      
      console.log(`Products matching by variant/attribute: ${matchingProductsByVariant.map(p => `${p.id}:${p.name}`).join(', ')}`);
      
      // Combine and deduplicate product IDs
      const allMatchingIds = new Set();
      matchingProductsByName.forEach(p => allMatchingIds.add(p.id));
      matchingProductsByVariant.forEach(p => allMatchingIds.add(p.id));
      
      if (allMatchingIds.size === 0) {
        return res.json({ products: [] });
      }
      
      const productIds = Array.from(allMatchingIds);
      const placeholders = productIds.map(() => '?').join(',');
      
      console.log(`Found ${productIds.length} matching product IDs: ${productIds.join(', ')}`);
      
      // Now get full product data with all variants, attributes, and images
      [rows] = await db.query(
        `SELECT
           p.id as product_id,
           p.name as product_name,
           p.image as product_image,
           p.description as product_description,
           p.category_id as category_id,
           c.slug as category_slug,
           c.name as category_name,
           p.is_active as is_active,
           pv.id as variant_id,
           pv.sku as variant_sku,
           pv.price as variant_price,
           pv.stock as variant_stock,
           va.attribute_name as attr_name,
           va.attribute_value as attr_value,
           pi.id as img_id,
           pi.image as img_path,
           pi.sort_order as img_sort
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_variants pv ON pv.product_id = p.id
         LEFT JOIN variant_attributes va ON va.variant_id = pv.id
         LEFT JOIN product_images pi ON pi.product_id = p.id
         WHERE p.id IN (${placeholders})
         ORDER BY p.name ASC, pv.id DESC, pi.sort_order ASC`,
        productIds
      );
    }

    const products = mapProductsFromRows(rows).filter(p => p.isActive !== 0);
    
    console.log(`Search query: "${q || '(empty)'}", Found ${products.length} products`);
    console.log(`Product IDs: ${products.map(p => p.id).join(', ')}`);
    console.log(`Product names: ${products.map(p => p.name).join(', ')}`);
    console.log(`Total rows from DB: ${rows.length}, Unique products after mapping: ${products.length}`);

    res.json({ products });
  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Check admin status route (placed early to avoid route conflicts)
router.get("/check-admin", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.substring(7);

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Get user from database
    const [users] = await db.query(
      "SELECT id, email FROM users WHERE id = ?",
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found", isAdmin: false });
    }

    const user = users[0];

    // Check if user is admin (based on email - can be enhanced later with is_admin column)
    const adminEmails = process.env.ADMIN_EMAILS 
      ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
      : [];
    
    const isAdmin = adminEmails.includes(user.email.toLowerCase());

    res.json({
      success: true,
      isAdmin: isAdmin
    });
  } catch (err) {
    console.error("CHECK ADMIN ERROR:", err);
    res.status(500).json({ error: err.message, isAdmin: false });
  }
});

// Signup route
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    // Check if user already exists
    const [existingUsers] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const [result] = await db.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword]
    );

    // Generate token (optional - you can use a simple token or JWT)
    const token = jwt.sign(
      { userId: result.insertId, email },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    // Check if user is admin (based on email - can be enhanced later with is_admin column)
    const adminEmails = process.env.ADMIN_EMAILS 
      ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
      : [];
    
    const isAdmin = adminEmails.includes(email.toLowerCase());

    res.json({
      success: true,
      token,
      user: {
        id: result.insertId,
        name,
        email,
        isAdmin: isAdmin
      }
    });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user by email
    const [users] = await db.query(
      "SELECT id, name, email, password FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    // Check if user is admin (based on email - can be enhanced later with is_admin column)
    const adminEmails = process.env.ADMIN_EMAILS 
      ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
      : []; // Default to empty array if no admin emails configured
    
    const isAdmin = adminEmails.includes(user.email.toLowerCase());

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: isAdmin
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update password route
router.post("/update-password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.substring(7);

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters long" });
    }

    // Get user from database
    const [users] = await db.query(
      "SELECT id, password FROM users WHERE id = ?",
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await db.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedPassword, user.id]
    );

    res.json({
      success: true,
      message: "Password updated successfully"
    });
  } catch (err) {
    console.error("UPDATE PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get user orders route
router.get("/my-orders", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.substring(7);

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Get orders for the user
    const [orders] = await db.query(
      `SELECT 
        o.id,
        o.total_amount as total,
        o.status,
        o.cancellation_reason,
        o.payment_method,
        o.payment_proof,
        o.created_at,
        o.billing_data
      FROM orders o
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC`,
      [decoded.userId]
    );

    // Get order items for each order
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const [items] = await db.query(
          `SELECT 
            oi.id,
            oi.product_name as productName,
            oi.variant_sku as variantSku,
            oi.price,
            oi.quantity as qty,
            oi.image,
            oi.attributes
          FROM order_items oi
          WHERE oi.order_id = ?
          ORDER BY oi.id ASC`,
          [order.id]
        );

        // Parse attributes JSON if it exists
        const itemsWithParsedAttributes = items.map(item => ({
          ...item,
          attributes: item.attributes ? JSON.parse(item.attributes) : []
        }));

        return {
          ...order,
          items: itemsWithParsedAttributes
        };
      })
    );

    res.json({
      success: true,
      orders: ordersWithItems
    });
  } catch (err) {
    console.error("GET ORDERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create order route
router.post("/create-order", uploadPaymentProof.single("paymentProof"), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.substring(7);

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { billing, items, subtotal, shipping, gst, total, paymentMethod } = req.body;
    
    // Parse JSON fields if they are strings
    const billingData = typeof billing === 'string' ? JSON.parse(billing) : billing;
    const itemsData = typeof items === 'string' ? JSON.parse(items) : items;

    if (!itemsData || itemsData.length === 0) {
      return res.status(400).json({ error: "Order items are required" });
    }

    // Handle payment proof file upload
    let paymentProofPath = null;
    if (req.file) {
      paymentProofPath = `/uploads/Payment-proofs/${req.file.filename}`;
    } else if (paymentMethod === "bank") {
      // If bank transfer but no proof, still create order but log it
      console.warn("Bank transfer order created without payment proof");
    }

    // Create order
    const [orderResult] = await db.query(
      `INSERT INTO orders (user_id, total_amount, status, payment_method, payment_proof, billing_data, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        decoded.userId,
        total || (subtotal + shipping + (gst || 0)),
        "pending",
        paymentMethod || "bank",
        paymentProofPath,
        JSON.stringify(billingData || {})
      ]
    );

    const orderId = orderResult.insertId;

    // Insert order items
    for (const item of itemsData) {
      const safeProductName = item.productName || item.name || item.product_name || 'Unknown product';
      if (!item.productName) {
        console.warn(`Order item missing productName, using fallback '${safeProductName}'`, { item });
      }
      await db.query(
        `INSERT INTO order_items (order_id, product_name, variant_sku, price, quantity, image, attributes) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          safeProductName,
          item.variantSku || null,
          item.price,
          item.qty,
          item.image || null,
          JSON.stringify(item.attributes || [])
        ]
      );
    }

    res.json({
      success: true,
      orderId: orderId,
      message: "Order created successfully"
    });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create Razorpay order route
router.post("/create-razorpay-order", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.substring(7);

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { amount, currency = "INR" } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    // Convert amount to paise (smallest currency unit for INR)
    const amountInPaise = Math.round(amount * 100);

    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: `receipt_${Date.now()}_${decoded.userId}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error("RAZORPAY ORDER CREATION ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to create Razorpay order" });
  }
});

// Verify Razorpay payment and create order route
router.post("/verify-razorpay-payment", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.substring(7);

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, billing, items, subtotal, shipping, gst, total } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: "Payment verification details are required" });
    }

    // Verify the payment signature
    const text = `${razorpayOrderId}|${razorpayPaymentId}`;
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(text)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Parse JSON fields if they are strings
    const billingData = typeof billing === 'string' ? JSON.parse(billing) : billing;
    const itemsData = typeof items === 'string' ? JSON.parse(items) : items;

    if (!itemsData || itemsData.length === 0) {
      return res.status(400).json({ error: "Order items are required" });
    }

    // Create order in database
    const [orderResult] = await db.query(
      `INSERT INTO orders (user_id, total_amount, status, payment_method, payment_proof, billing_data, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        decoded.userId,
        total || (subtotal + shipping + (gst || 0)),
        "paid", // Set status as paid since payment is verified
        "razorpay",
        JSON.stringify({ orderId: razorpayOrderId, paymentId: razorpayPaymentId, signature: razorpaySignature }),
        JSON.stringify(billingData || {})
      ]
    );

    const orderId = orderResult.insertId;

    // Insert order items
    for (const item of itemsData) {
      const safeProductName = item.productName || item.name || item.product_name || 'Unknown product';
      if (!item.productName) {
        console.warn(`Order item missing productName, using fallback '${safeProductName}'`, { item });
      }
      await db.query(
        `INSERT INTO order_items (order_id, product_name, variant_sku, price, quantity, image, attributes) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          safeProductName,
          item.variantSku || null,
          item.price,
          item.qty,
          item.image || null,
          JSON.stringify(item.attributes || [])
        ]
      );
    }

    res.json({
      success: true,
      orderId: orderId,
      message: "Payment verified and order created successfully"
    });
  } catch (err) {
    console.error("VERIFY RAZORPAY PAYMENT ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to verify payment" });
  }
});

export default router;

