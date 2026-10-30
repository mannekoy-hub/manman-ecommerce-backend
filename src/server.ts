import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/authRoutes.ts";
import todoRoutes from "./routes/todoRoutes.ts";
import productRoutes from "./routes/productRoutes.ts";

const app = express();
const PORT = process.env.PORT || 5010;

app.use(cors());        
app.use(express.json()); 

app.use("/auth", authRoutes);
app.use("/todos", todoRoutes);
app.use("/products", productRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});