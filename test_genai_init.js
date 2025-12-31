const { GoogleGenAI } = require('@google/genai');
try {
  const ai = new GoogleGenAI({ apiKey: undefined });
  console.log("Success");
} catch (e) {
  console.log("Error:", e.message);
}
