// import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHUNKS_PATH = path.join(__dirname, "..", "rag", "chunks.json");
const OUT_PATH = path.join(__dirname, "..", "rag", "embeddings.json");

function cosineNorm(vec) {
	let sumSq = 0;
	for (const v of vec) sumSq += v * v;
	return Math.sqrt(sumSq);
}

async function main() {
	const chunksRaw = JSON.parse(fs.readFileSync(CHUNKS_PATH, "utf8"));
	const chunks = chunksRaw.chunks ?? [];

	const geminiApiKey = process.env.GEMINI_API_KEY;
	if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY in environment.");

	const ai = new GoogleGenAI({ apiKey: geminiApiKey });
	const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

	const items = [];

	const batchSize = 10;
	for (let start = 0; start < chunks.length; start += batchSize) {
		const batch = chunks.slice(start, start + batchSize);
		const texts = batch.map((c) => c.text);
		process.stdout.write(
			`Embedding batch ${Math.floor(start / batchSize) + 1} (${start + 1}-${Math.min(
				start + batchSize,
				chunks.length
			)}/${chunks.length})... `
		);

		const response = await ai.models.embedContent({
			model: embeddingModel,
			contents: texts,
			config: { taskType: "RETRIEVAL_DOCUMENT" },
		});

		const embeddings = response?.embeddings ?? [];
		if (embeddings.length !== batch.length) {
			throw new Error(
				`Embedding batch mismatch: expected ${batch.length}, got ${embeddings.length}`
			);
		}

		for (let i = 0; i < batch.length; i++) {
			const embedding = embeddings[i]?.values;
			if (!embedding) throw new Error(`No embedding returned for chunk ${batch[i].id}`);

			const norm = cosineNorm(embedding);
			items.push({
				id: batch[i].id,
				projectSlug: batch[i].projectSlug,
				project: batch[i].project,
				text: batch[i].text,
				embedding,
				norm,
				metadata: batch[i].metadata,
			});
		}
		console.log("ok");
	}

	const payload = {
		version: 1,
		embeddingModel,
		createdAt: new Date().toISOString(),
		items,
	};

	fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");

	console.log(`Wrote embeddings for ${items.length} chunks -> ${OUT_PATH}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

