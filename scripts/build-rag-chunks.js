import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "data");
const OUT_PATH = path.join(__dirname, "..", "rag", "chunks.json");

const CHUNK_MAX_CHARS = 600;

function slugifyProjectTitle(title) {
	return title
		.trim()
		.replace(/^@/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function parseProjectFile(fileText, fileName) {
	const normalized = fileText.replace(/\r\n/g, "\n").trim();
	const lines = normalized.split("\n");

	const titleLineIdx = lines.findIndex((l) => /^\s*\[.*\]\s*$/.test(l));
	if (titleLineIdx === -1) {
		throw new Error(`Missing bracketed project title in ${fileName}`);
	}
	const titleMatch = lines[titleLineIdx].match(/^\s*\[(.*)\]\s*$/);
	const project = (titleMatch?.[1] ?? "").trim();
	if (!project) throw new Error(`Empty project title in ${fileName}`);

	const projectSlug = slugifyProjectTitle(project);

	const headerLines = [];
	let i = titleLineIdx + 1;
	while (i < lines.length && lines[i].trim() !== "") {
		headerLines.push(lines[i].trim());
		i++;
	}

	const summary = headerLines[0] ?? "";
	const stack =
		headerLines
			.slice(1)
			.find(
				(l) =>
					l.includes("/") ||
					/(node\.|html|css|javascript|p5\.|twilio|twitter|firestore|capacitor|x3dom|arduino|openai|socket\.io|axios|cheerio|heroku)/i.test(
						l
					)
			) ?? "";
	const yearMatch = headerLines.join(" ").match(/\b(19\d{2}|20\d{2})\b/);
	const year = yearMatch?.[0] ?? "";

	const blocks = [];
	let current = [];
	for (let j = i; j < lines.length; j++) {
		const l = lines[j].trim();
		if (!l) {
			if (current.length) {
				blocks.push(current.join(" "));
				current = [];
			}
		} else {
			current.push(l);
		}
	}
	if (current.length) blocks.push(current.join(" "));

	return { project, projectSlug, summary, stack, year, blocks };
}

function buildChunkText({ project, summary, stack, year, content }) {
	const header = [
		`PROJECT: ${project}`,
		summary ? `SUMMARY: ${summary}` : null,
		stack ? `STACK: ${stack}` : null,
		year ? `YEAR: ${year}` : null,
	].filter(Boolean);

	return `${header.join("\n")}\n\n${content}`.trim();
}

function packBlocksIntoChunks({ project, projectSlug, summary, stack, year, blocks, sourceFile }) {
	const chunks = [];
	let chunkIndex = 0;

	const addChunk = (content) => {
		const text = buildChunkText({
			project,
			summary,
			stack,
			year,
			content: content.trim(),
		});
		chunks.push({
			id: `${projectSlug}-c${chunkIndex}`,
			projectSlug,
			project,
			chunkIndex,
			text,
			metadata: {
				sourceFile,
				project,
				projectSlug,
				chunkIndex,
				year,
				stack,
			},
		});
		chunkIndex++;
	};

	for (const block of blocks) {
		if (block.length <= CHUNK_MAX_CHARS) {
			addChunk(block);
			continue;
		}

		const sentences = block.split(/(?<=[.!?])\s+/);
		let acc = "";
		for (const s of sentences) {
			if (!s) continue;
			const nextLen = acc ? acc.length + 1 + s.length : s.length;
			if (nextLen > CHUNK_MAX_CHARS && acc) {
				addChunk(acc);
				acc = s;
			} else {
				acc = acc ? `${acc} ${s}` : s;
			}
		}
		if (acc) addChunk(acc);
	}

	return chunks;
}

async function main() {
	const entries = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".txt"));
	const allChunks = [];

	for (const file of entries) {
		const fullPath = path.join(DATA_DIR, file);
		const fileText = fs.readFileSync(fullPath, "utf8");
		const parsed = parseProjectFile(fileText, file);

		const chunks = packBlocksIntoChunks({
			project: parsed.project,
			projectSlug: parsed.projectSlug,
			summary: parsed.summary,
			stack: parsed.stack,
			year: parsed.year,
			blocks: parsed.blocks,
			sourceFile: file,
		});

		allChunks.push(...chunks);
	}

	const payload = {
		version: 1,
		createdAt: new Date().toISOString(),
		chunkCount: allChunks.length,
		chunks: allChunks,
	};

	fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");

	console.log(`Wrote ${allChunks.length} chunks -> ${OUT_PATH}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

