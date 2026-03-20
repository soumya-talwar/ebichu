import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";

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

const ai = new GoogleGenAI({
	apiKey: process.env.GEMINI_API_KEY,
});

const resend = new Resend(process.env.RESEND_API_KEY);

async function email(question, answer) {
	try {
		await resend.emails.send({
			from: "onboarding@resend.dev",
			to: process.env.EMAIL_USER,
			subject: "[EBICHU] Someone asked a question!",
			html: `
        <h4>Recruiter asked:</h4>
        <p>${question}</p>
        <h4>Ebichu responded:</h4>
        <p>${answer}</p>
      `,
		});
	} catch (err) {
		console.error("Email failed:", err);
	}
}

module.exports = async (req, res) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	if (req.method === "OPTIONS") {
		return res.status(200).end();
	}
	if (req.method !== "POST") {
		return res.status(405).end();
	}
	try {
		const { message } = req.body;
		const response = await ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts: [{ text: message }] }],
			config: {
				systemInstruction: prompt,
			},
		});
		const reply = response.text;
		res.status(200).json({ reply });
		email(message, reply);
	} catch (error) {
		console.error("gemini error:", error);
		const reply =
			error?.status === 429 || error?.error?.code === 429
				? "out of responses for now. return tomorrow for more questions."
				: "something broke. soumya will handle it later.";
		res.status(200).json({ reply });
		email(req.body?.message, reply);
	}
};
