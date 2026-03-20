import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";

const baseSystemInstruction = `
You are Soumya Talwar's manager

ABOUT SOUMYA
Sr Art Director (pivoting to Creative Technologist)

Strengths:
-Creative coding (web, AI, hardware)
-Concept-first product thinking
-Bridges design and engineering

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAG_CHUNKS_PATH = path.join(__dirname, "..", "rag", "chunks.json");
const RAG_EMBEDDINGS_PATH = path.join(__dirname, "..", "rag", "embeddings.json");

let ragIndexPromise = null;

function buildSystemInstruction(retrievedChunks) {
	const contextText =
		retrievedChunks?.length > 0
			? retrievedChunks
					.map((chunk, idx) => `[${idx + 1}] ${chunk}`)
					.join("\n")
			: "No relevant project context found.";

	return `${baseSystemInstruction}
	
	PROJECT CONTEXT (use this to answer questions about Soumya's projects):
	${contextText}

	Answer using only the retrieved project context above (do not invent details).`;
}

const ai = new GoogleGenAI({
	apiKey: process.env.GEMINI_API_KEY,
});

const resend = new Resend(process.env.RESEND_API_KEY);

async function embedQuery(text) {
	try {
		const response = await ai.models.embedContent({
			model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
			contents: text,
			config: {
				taskType: "RETRIEVAL_QUERY",
			},
		});
		return response?.embeddings?.[0]?.values ?? null;
	} catch {
		return null;
	}
}

function cosineScore(queryEmbedding, docEmbedding, queryNorm, docNorm) {
	const len = Math.min(queryEmbedding.length, docEmbedding.length);
	let dot = 0;
	for (let i = 0; i < len; i++) {
		dot += queryEmbedding[i] * docEmbedding[i];
	}
	const denom = queryNorm * docNorm;
	if (!denom) return -Infinity;
	return dot / denom;
}

function cosineNorm(vec) {
	let sumSq = 0;
	for (const v of vec) sumSq += v * v;
	return Math.sqrt(sumSq);
}

async function loadRagIndex() {
	if (ragIndexPromise) return ragIndexPromise;

	ragIndexPromise = (async () => {
		if (!fs.existsSync(RAG_CHUNKS_PATH)) {
			throw new Error(`Missing ${RAG_CHUNKS_PATH}. Run 'npm run rag:build-chunks'.`);
		}

		const chunksRaw = JSON.parse(fs.readFileSync(RAG_CHUNKS_PATH, "utf8"));
		const chunks = chunksRaw.chunks ?? [];

		if (fs.existsSync(RAG_EMBEDDINGS_PATH)) {
			const embeddingsRaw = JSON.parse(
				fs.readFileSync(RAG_EMBEDDINGS_PATH, "utf8")
			);
			const items = embeddingsRaw.items ?? [];
			const itemsById = new Map(items.map((it) => [it.id, it]));
			const indexItems = [];
			for (const c of chunks) {
				const it = itemsById.get(c.id);
				if (it?.embedding && Array.isArray(it.embedding)) {
					indexItems.push({
						id: it.id,
						projectSlug: c.projectSlug,
						text: c.text,
						embedding: it.embedding,
						norm: typeof it.norm === "number" ? it.norm : cosineNorm(it.embedding),
					});
				}
			}
			return { chunks, items: indexItems };
		}

		const embeddingModel =
			process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
		const texts = chunks.map((c) => c.text);
		const response = await ai.models.embedContent({
			model: embeddingModel,
			contents: texts,
			config: { taskType: "RETRIEVAL_DOCUMENT" },
		});

		const embeddings = response?.embeddings ?? [];
		const items = [];
		for (let i = 0; i < chunks.length; i++) {
			const embedding = embeddings?.[i]?.values;
			if (!embedding) continue;
			items.push({
				id: chunks[i].id,
				projectSlug: chunks[i].projectSlug,
				text: chunks[i].text,
				embedding,
				norm: cosineNorm(embedding),
			});
		}

		return { chunks, items };
	})();

	return ragIndexPromise;
}

async function retrieveProjectContext({ queryEmbedding, nResults = 3 }) {
	if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
		if (fs.existsSync(RAG_CHUNKS_PATH)) {
			const chunksRaw = JSON.parse(fs.readFileSync(RAG_CHUNKS_PATH, "utf8"));
			const chunks = chunksRaw.chunks ?? [];
			return chunks.slice(0, nResults).map((c) => c.text);
		}
		return [];
	}

	const { items } = await loadRagIndex();
	if (!items.length) return [];

	const queryNorm = cosineNorm(queryEmbedding);
	const scored = items
		.map((it) => ({
			text: it.text,
			score: cosineScore(queryEmbedding, it.embedding, queryNorm, it.norm),
		}))
		.sort((a, b) => b.score - a.score)
		.slice(0, Math.max(1, nResults));

	return scored.map((s) => s.text);
}

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

export default async function handler(req, res) {
	if (req.method !== "POST") {
		return res.status(405).end();
	}
	try {
		const { message } = req.body;

		const queryEmbedding = await embedQuery(message);
		const retrievedChunks = await retrieveProjectContext({ queryEmbedding, nResults: 3 });

		const systemInstruction = buildSystemInstruction(retrievedChunks);

		const response = await ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts: [{ text: message }] }],
			config: {
				systemInstruction,
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
}
