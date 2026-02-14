const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const Tesseract = require("tesseract.js");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. Initialize Gemini with a STRICT JSON Schema
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

const schema = {
  description: "Security analysis scores",
  type: SchemaType.OBJECT,
  properties: {
    digital: { type: SchemaType.NUMBER, description: "Score 0-100 based on visible personal info" },
    cyber: { type: SchemaType.NUMBER, description: "Score 0-100 based on security risks" },
    fake: { type: SchemaType.NUMBER, description: "Score 0-100 probability of fake profile" },
    feedback: { type: SchemaType.STRING, description: "3 short feedback points" },
  },
  required: ["digital", "cyber", "fake", "feedback"],
};

const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: schema,
    temperature: 1.0, // High variety
  }
});

const upload = multer({ dest: "uploads/" });

app.post("/analyze", upload.single("screenshot"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const imagePath = req.file.path;
    const imageBase64 = fs.readFileSync(imagePath).toString("base64");

    // 2. Tesseract OCR
    console.log("Reading text with Tesseract...");
    const tesseractOutput = await Tesseract.recognize(imagePath, "eng");
    const ocrText = tesseractOutput.data.text;

    // 3. Gemini Analysis
    console.log("Analyzing with Gemini...");
    const prompt = `Analyze this screenshot. OCR Text found: "${ocrText}". 
    Generate unique risk scores. IMPORTANT: Do not use the same number for all scores. 
    Be critical and varied. If it looks like a social media profile, evaluate the risks.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: imageBase64, mimeType: "image/png" } }
    ]);

    const aiData = JSON.parse(result.response.text());

    // 4. Final Response
    res.json({
      digitalFootprintScore: aiData.digital,
      cyberSecurityScore: aiData.cyber,
      fakeProfileScore: aiData.fake,
      feedback: aiData.feedback
    });

    // Cleanup
    fs.unlinkSync(imagePath);

  } catch (error) {
    console.error("ERROR:", error);
    res.status(500).json({ error: "Analysis failed" });
  }
});

app.listen(5000, () => console.log("Server running on http://localhost:5000"));