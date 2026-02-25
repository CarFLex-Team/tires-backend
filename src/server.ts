import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import customerRoutes from "./customers/routes";

dotenv.config();

const app = express();


app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "OK" });
});

app.use("/api/v1/customers", customerRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});


app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});


const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log("server running on port", PORT);
});