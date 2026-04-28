require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

db.initDB().then(() => {
  console.log("✅ Database siap");
}).catch(err => {
  console.error("DB Error:", err);
});

app.get("/api/form/:formId", async (req, res) => {
  try {
    const form = await db.getForm(req.params.formId);
    if (!form) return res.status(404).json({ error: "Form tidak ditemukan" });
    form.columns = JSON.parse(form.columns);
    res.json(form);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/form/:formId/submit", async (req, res) => {
  try {
    const form = await db.getForm(req.params.formId);
    if (!form) return res.status(404).json({ error: "Form tidak ditemukan" });
    await db.saveSubmission(req.params.formId, req.body);
    res.json({ success: true, message: "Data berhasil disimpan!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/form/:formId/submissions", async (req, res) => {
  try {
    const submissions = await db.getSubmissions(req.params.formId);
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/form/:formId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "form.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});

require("./bot");
