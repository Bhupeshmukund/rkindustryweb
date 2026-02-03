// Quick test script to verify backend setup
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend server is working!", timestamp: new Date().toISOString() });
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Test endpoint: http://localhost:${PORT}/api/test`);
});

