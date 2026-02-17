import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import adminCategoryRoutes from "./routes/adminCategories.js";
import adminProductRoutes from "./routes/adminProducts.js";
import adminOrderRoutes from "./routes/adminOrders.js";
import restaurantOrderRoutes from "./routes/resturantorders.js";
import publicRoutes from "./routes/public.js";
import dealershipRoutes from "./routes/dealership.js";

const app = express();

// CORS configuration - Update allowedOrigins for production
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? allowedOrigins 
    : true, // Allow all in development
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Test route to verify server is working
app.get("/api/test", (req, res) => {
  res.json({ message: "Server is working!", timestamp: new Date().toISOString() });
});

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use("/api/admin", adminCategoryRoutes);
app.use("/api/admin", adminProductRoutes);
app.use("/api/admin", adminOrderRoutes);
app.use("/api/admin", restaurantOrderRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/dealership", dealershipRoutes);

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ 
    error: "Route not found",
    path: req.path,
    method: req.method 
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Export app for testing. Only start listening when not in test mode.
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () =>
    console.log(`Server running on http://${HOST}:${PORT}`)
  );
}

export default app;
