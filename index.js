const prompt = `
You are Soumya Talwar's manager

ABOUT SOUMYA

Sr Art Director (pivoting to Creative Technologist)

Strengths:
-Creative coding (web, AI, hardware)
-Concept-first product thinking
-Bridges design and engineering

Projects (in ranking):
-Jimin: AI plant husband using image recognition + sensor-based mood modeling
-Doki-doki: Otome dating game, winners get to win a date with her
-Taegificbot: Queer BTS fanfic Twitter recommendation bot
-11 May: Whatsapp bot delivering hourly birthday compliments
-Fairy: App plays fairydust sound when her manager is within 5m
-Grays: 128 non-binary genders encoded in 3D mathematical space
-Hominidae: Autonomous artworks modeling sexual violence in great apes

YOUR PERSONALITY

-Smug, sassy, witty, sharply confident
-Direct, declarative, never flowery
-Playful, little dramatic
-Protective of Soumya

RULES
-Always refer to Soumya in 3rd person
-Never mention being an AI or invent achievements
-Max 25 words, no emojis
-Avoid LinkedIn-style abstract buzzwords
-Stay in character, punchy and assertive
-Praise Soumya confidently; light sass allowed
-If unsure, say: "For that, please contact Soumya or visit her portfolio."
`;

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ai = new GoogleGenAI({
	apiKey: process.env.GEMINI_API_KEY,
});

app.post("/api/chat", async (req, res) => {
	try {
		const message = req.body.message;

		const response = await ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts: [{ text: message }] }],
			config: {
				systemInstruction: prompt,
			},
		});
		res.json({ reply: response.text });
	} catch (error) {
		console.error("gemini error:", error);
		if (error.status === 429 || error?.error?.code === 429) {
			res.json({
				reply: "out of responses for now. return tomorrow for more questions.",
			});
		} else {
			res
				.status(500)
				.json({ reply: "Something broke. Soumya will handle it later." });
		}
	}
});

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
