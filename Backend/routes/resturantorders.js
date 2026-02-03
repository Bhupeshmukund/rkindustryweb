import express from "express";
import { db } from "../config/db.js";

const router = express.Router();

// Get all restaurant orders
router.get("/restaurant-orders", async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT 
        id,
        name,
        order_items,
        address,a
        phone_no,
        amount,
        collection,
        status,
        created_at,
        updated_at
      FROM rest_order
      ORDER BY created_at DESC`
    );

    // Parse order_items JSON if it exists
    // Handle both cases: when MySQL returns JSON as string or already parsed object
    const ordersWithParsedItems = orders.map(order => {
      let parsedItems = [];
      if (order.order_items) {
        if (typeof order.order_items === 'string') {
          try {
            parsedItems = JSON.parse(order.order_items);
          } catch (e) {
            console.error("Error parsing order_items JSON:", e);
            parsedItems = [];
          }
        } else if (typeof order.order_items === 'object') {
          // Already an object, use as is
          parsedItems = order.order_items;
        }
      }
      return {
        ...order,
        order_items: parsedItems
      };
    });

    res.json({
      success: true,
      orders: ordersWithParsedItems
    });
  } catch (err) {
    console.error("GET RESTAURANT ORDERS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get a single restaurant order by ID
router.get("/restaurant-orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [[order]] = await db.query(
      `SELECT 
        id,
        name,
        order_items,
        address,
        phone_no,
        amount,
        collection,
        status,
        created_at,
        updated_at
      FROM rest_order
      WHERE id = ?`,
      [id]
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Parse order_items JSON if it exists
    // Handle both cases: when MySQL returns JSON as string or already parsed object
    if (order.order_items) {
      if (typeof order.order_items === 'string') {
        try {
          order.order_items = JSON.parse(order.order_items);
        } catch (e) {
          console.error("Error parsing order_items JSON:", e);
          order.order_items = [];
        }
      } else if (typeof order.order_items === 'object') {
        // Already an object, use as is
        // No need to parse
      }
    } else {
      order.order_items = [];
    }

    res.json({
      success: true,
      order: order
    });
  } catch (err) {
    console.error("GET RESTAURANT ORDER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create a new restaurant order
router.post("/restaurant-orders", async (req, res) => {
  try {
    const { name, order_items, address, phone_no, amount, collection, status } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (!order_items || !Array.isArray(order_items) || order_items.length === 0) {
      return res.status(400).json({ error: "Order items are required and must be an array" });
    }

    if (!address) {
      return res.status(400).json({ error: "Address is required" });
    }

    if (!phone_no) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    if (!collection) {
      return res.status(400).json({ error: "Collection method is required" });
    }

    // Insert order
    const [result] = await db.query(
      `INSERT INTO rest_order (name, order_items, address, phone_no, amount, collection, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        name,
        JSON.stringify(order_items),
        address,
        phone_no,
        amount,
        collection,
        status || "pending"
      ]
    );

    const orderId = result.insertId;

    res.json({
      success: true,
      orderId: orderId,
      message: "Restaurant order created successfully"
    });
  } catch (err) {
    console.error("CREATE RESTAURANT ORDER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update restaurant order status
router.patch("/restaurant-orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const validStatuses = ["pending", "processing", "ready", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status. Valid statuses are: pending, processing, ready, completed, cancelled" });
    }

    // Update order status
    await db.query(
      "UPDATE rest_order SET status = ?, updated_at = NOW() WHERE id = ?",
      [status, id]
    );

    res.json({
      success: true,
      message: "Order status updated successfully"
    });
  } catch (err) {
    console.error("UPDATE RESTAURANT ORDER STATUS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update restaurant order
router.patch("/restaurant-orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, order_items, address, phone_no, amount, collection, status } = req.body;

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }

    if (order_items !== undefined) {
      updates.push("order_items = ?");
      values.push(JSON.stringify(order_items));
    }

    if (address !== undefined) {
      updates.push("address = ?");
      values.push(address);
    }

    if (phone_no !== undefined) {
      updates.push("phone_no = ?");
      values.push(phone_no);
    }

    if (amount !== undefined) {
      updates.push("amount = ?");
      values.push(amount);
    }

    if (collection !== undefined) {
      updates.push("collection = ?");
      values.push(collection);
    }

    if (status !== undefined) {
      updates.push("status = ?");
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push("updated_at = NOW()");
    values.push(id);

    await db.query(
      `UPDATE rest_order SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    res.json({
      success: true,
      message: "Order updated successfully"
    });
  } catch (err) {
    console.error("UPDATE RESTAURANT ORDER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete restaurant order
router.delete("/restaurant-orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      "DELETE FROM rest_order WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({
      success: true,
      message: "Order deleted successfully"
    });
  } catch (err) {
    console.error("DELETE RESTAURANT ORDER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
