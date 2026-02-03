import express from "express";
import jwt from "jsonwebtoken";
import { db } from "../config/db.js";

const router = express.Router();

// Get all orders (admin only)
router.get("/orders", async (req, res) => {
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

    // Get all orders with user information
    // Note: Notes are stored in billing_data JSON field, not a separate column
    const [orders] = await db.query(
      `SELECT 
        o.id,
        o.user_id,
        o.total_amount,
        o.status,
        o.cancellation_reason,
        o.payment_method,
        o.payment_proof,
        o.billing_data,
        o.created_at,
        u.name as user_name,
        u.email as user_email
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC`
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
    console.error("GET ALL ORDERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update order status
router.patch("/orders/:id/status", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.substring(7);

    // Verify token
    try {
      jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { id } = req.params;
    const { status, cancellation_reason } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const validStatuses = ["pending", "processing", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // If status is cancelled, cancellation_reason is required
    if (status === "cancelled" && !cancellation_reason) {
      return res.status(400).json({ error: "Cancellation reason is required when cancelling an order" });
    }

    // Update order with status and cancellation_reason (if provided)
    if (status === "cancelled") {
      await db.query(
        "UPDATE orders SET status = ?, cancellation_reason = ? WHERE id = ?",
        [status, cancellation_reason, id]
      );
    } else {
      // For non-cancelled statuses, clear the cancellation_reason
      await db.query(
        "UPDATE orders SET status = ?, cancellation_reason = NULL WHERE id = ?",
        [status, id]
      );
    }

    res.json({
      success: true,
      message: "Order status updated successfully"
    });
  } catch (err) {
    console.error("UPDATE ORDER STATUS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

