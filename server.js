require("dotenv").config();
const express = require("express");
const { Client } = require("@notionhq/client");
const { execSync, spawn } = require("child_process");
const path = require("path");

const {
	DEFAULT_PROMPT_PIPELINE_CONFIG,
	InMemoryQuestionStore,
	PromptPipeline,
} = require("./lib/reflection-prompt/pipeline");
const {
	analyzeJournalGame,
} = require("./lib/journal-analytics/gameTheory");

const OLLAMA_MODEL = "gemma3:1b";
const OLLAMA_BASE_URL = "http://localhost:11434";

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const PARENT_PAGE_ID = process.env.NOTION_PAGE_ID;

const promptPipelineConfig = {
	...DEFAULT_PROMPT_PIPELINE_CONFIG,
	generation: {
		...DEFAULT_PROMPT_PIPELINE_CONFIG.generation,
		maxAttempts: 5,
		maxWords: 18,
	},
	steps: {
		...DEFAULT_PROMPT_PIPELINE_CONFIG.steps,
		embeddingSimilarity: false,
	},
};

const questionStore = new InMemoryQuestionStore(
	promptPipelineConfig.history.limit,
);
const promptPipeline = new PromptPipeline(promptPipelineConfig, questionStore);

let databaseId = null;
let dataSourceId = null;

function richText(content) {
	return {
		rich_text: [{ text: { content: String(content || "") } }],
	};
}

function plainRichText(property) {
	return property?.rich_text?.[0]?.plain_text || "";
}

function parsePromptMeta(promptText) {
	const prompt = String(promptText || "");
	const themeMatch = prompt.match(/Theme:\s*([^|]+)/i);
	const openingMatch = prompt.match(/Start with:\s*([^|]+)/i);
	return {
		theme: themeMatch ? themeMatch[1].trim() : "",
		openingWord: openingMatch ? openingMatch[1].trim() : "",
	};
}

function looksLikePromptMeta(text) {
	return /^\s*Theme:/i.test(String(text || ""));
}

function mapNotionPageToEntry(page) {
	const props = page.properties;
	const reflectionPrompt = plainRichText(props.ReflectionPrompt);
	const reflectionQuestion =
		plainRichText(props.ReflectionQuestion) ||
		(!looksLikePromptMeta(reflectionPrompt) ? reflectionPrompt : "");

	return {
		id: page.id,
		day: props.Day?.title?.[0]?.plain_text || "",
		date: props.Date?.date?.start || "",
		feeling: plainRichText(props.Feeling),
		reflection: plainRichText(props.Reflection) || plainRichText(props.Mistake),
		reflectionPrompt,
		reflectionQuestion,
		gratefulFor: plainRichText(props.GratefulFor),
	};
}

function rememberQuestionIfNeeded(question, prompt, createdAt = null) {
	const text = String(question || "").trim();
	if (!text) return;

	const history = promptPipeline.getHistory();
	const latest = history[history.length - 1];
	if (latest && latest.text.toLowerCase() === text.toLowerCase()) return;

	const meta = parsePromptMeta(prompt);
	promptPipeline.remember({
		text,
		prompt: prompt || "",
		theme: meta.theme,
		openingWord: meta.openingWord,
		createdAt: createdAt || new Date().toISOString(),
	});
}

async function getOrCreateDatabase() {
	if (dataSourceId) return { databaseId, dataSourceId };

	const children = await notion.blocks.children.list({
		block_id: PARENT_PAGE_ID,
		page_size: 100,
	});

	for (const block of children.results) {
		if (block.type === "child_database") {
			databaseId = block.id;
		}
	}

	if (!databaseId) {
		const db = await notion.databases.create({
			parent: { type: "page_id", page_id: PARENT_PAGE_ID },
			title: [{ type: "text", text: { content: "Gratitude Entries" } }],
		});
		databaseId = db.id;
	}

	const db = await notion.databases.retrieve({ database_id: databaseId });
	dataSourceId = db.data_sources[0].id;

	const ds = await notion.dataSources.retrieve({
		data_source_id: dataSourceId,
	});
	const props = Object.keys(ds.properties);

	const updateProps = {};
	let needsUpdate = false;

	if (props.includes("Name") && !props.includes("Day")) {
		updateProps.Name = { name: "Day" };
		needsUpdate = true;
	}

	const required = {
		Date: { date: {} },
		Feeling: { rich_text: {} },
		Reflection: { rich_text: {} },
		ReflectionPrompt: { rich_text: {} },
		ReflectionQuestion: { rich_text: {} },
		GratefulFor: { rich_text: {} },
	};

	for (const [name, config] of Object.entries(required)) {
		if (!props.includes(name)) {
			updateProps[name] = config;
			needsUpdate = true;
		}
	}

	if (needsUpdate) {
		await notion.dataSources.update({
			data_source_id: dataSourceId,
			properties: updateProps,
		});
	}

	return { databaseId, dataSourceId };
}

async function hydrateQuestionHistory() {
	try {
		const { dataSourceId: dsId } = await getOrCreateDatabase();
		const response = await notion.dataSources.query({
			data_source_id: dsId,
			sorts: [{ property: "Date", direction: "descending" }],
			page_size: promptPipeline.getConfig().history.limit,
		});

		const history = response.results
			.map((page) => {
				const entry = mapNotionPageToEntry(page);
				if (!entry.reflectionQuestion) return null;
				return {
					id: page.id,
					text: entry.reflectionQuestion,
					prompt: entry.reflectionPrompt,
					...parsePromptMeta(entry.reflectionPrompt),
					createdAt: page.created_time,
				};
			})
			.filter(Boolean)
			.reverse();

		promptPipeline.setHistory(history);
		console.log(`Prompt history loaded: ${history.length} question(s).`);
	} catch (err) {
		console.error("Failed to hydrate prompt history:", err.message);
	}
}

// Ollama lifecycle management
let ollamaProcess = null;
let weStartedOllama = false;

async function isOllamaRunning() {
	try {
		const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
		return res.ok;
	} catch {
		return false;
	}
}

async function waitForOllama(retries = 20) {
	for (let i = 0; i < retries; i++) {
		if (await isOllamaRunning()) return true;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	return false;
}

async function ensureOllama() {
	if (await isOllamaRunning()) {
		console.log("Ollama already running.");
	} else {
		console.log("Starting Ollama...");
		ollamaProcess = spawn("ollama", ["serve"], {
			stdio: "ignore",
			detached: false,
		});
		ollamaProcess.on("error", (err) => {
			console.error("Failed to start Ollama:", err.message);
			console.error("Install Ollama from https://ollama.com");
		});
		weStartedOllama = true;
		if (!(await waitForOllama())) {
			console.error(
				"Ollama did not start in time. Prompts will use fallbacks.",
			);
			return;
		}
		console.log("Ollama started.");
	}

	try {
		const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
		const data = await res.json();
		const hasModel = data.models?.some((m) =>
			m.name.startsWith(OLLAMA_MODEL.split(":")[0]),
		);
		if (!hasModel) {
			console.log(`Pulling ${OLLAMA_MODEL} (first run only)...`);
			execSync(`ollama pull ${OLLAMA_MODEL}`, { stdio: "inherit" });
			console.log(`${OLLAMA_MODEL} ready.`);
		}
	} catch (err) {
		console.error("Could not verify/pull model:", err.message);
	}
}

function stopOllama() {
	if (weStartedOllama && ollamaProcess) {
		console.log("Stopping Ollama...");
		ollamaProcess.kill();
		ollamaProcess = null;
	}
}

process.on("SIGINT", () => {
	stopOllama();
	process.exit(0);
});

process.on("SIGTERM", () => {
	stopOllama();
	process.exit(0);
});

async function generateQuestionFromOllama({ theme, openingWord }) {
	const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: OLLAMA_MODEL,
			stream: false,
			options: {
				temperature: 0.9,
				num_predict: 36,
			},
			messages: [
				{
					role: "system",
					content: `Generate ONE reflective journal question.

Rules:
- Theme must be: ${theme}
- Start the question with: ${openingWord}
- Focus on past experience, identity, fear, growth, relationships, regret, or personal change.
- Keep simple language.
- Maximum 18 words.
- Avoid "grateful", "appreciate", "today", "small thing".
- Output only the question text.`,
				},
				{
					role: "user",
					content: `Theme: ${theme}. Start with ${openingWord}. Generate one unique journaling question.`,
				},
			],
		}),
	});

	if (!response.ok) {
		throw new Error(`Ollama request failed (${response.status})`);
	}

	const data = await response.json();
	return data.message?.content?.trim() || "";
}

// Generate a reflection question using anti-repetition pipeline
app.get("/api/prompt", async (req, res) => {
	try {
		const result = await promptPipeline.generate({
			generateCandidate: ({ theme, openingWord }) =>
				generateQuestionFromOllama({ theme, openingWord }),
		});

		res.json({
			prompt: result.question,
			question: result.question,
			reflectionQuestion: result.question,
			reflectionPrompt: result.prompt,
			theme: result.theme,
			openingWord: result.openingWord,
			attempts: result.attempts,
			fromFallback: result.fromFallback,
		});
	} catch (err) {
		console.error("Prompt generation failed:", err.message);
		res.json({
			prompt: "What memory still guides the person you are becoming?",
			question: "What memory still guides the person you are becoming?",
			reflectionQuestion:
				"What memory still guides the person you are becoming?",
			reflectionPrompt: "Theme: personal growth | Start with: What",
			fromFallback: true,
		});
	}
});

// Get all entries
app.get("/api/entries", async (req, res) => {
	try {
		const { dataSourceId: dsId } = await getOrCreateDatabase();
		const response = await notion.dataSources.query({
			data_source_id: dsId,
			sorts: [{ property: "Date", direction: "descending" }],
		});

		const entries = response.results.map((page) => mapNotionPageToEntry(page));
		res.json(entries);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

// Strategy-based journaling analytics
app.get("/api/analytics", async (req, res) => {
	try {
		const { dataSourceId: dsId } = await getOrCreateDatabase();
		const response = await notion.dataSources.query({
			data_source_id: dsId,
			sorts: [{ property: "Date", direction: "ascending" }],
		});

		const entries = response.results.map((page) => mapNotionPageToEntry(page));
		const analytics = analyzeJournalGame(entries);
		res.json(analytics);
	} catch (err) {
		console.error("Analytics generation failed:", err.message);
		res.status(500).json({ error: err.message });
	}
});

// Get single entry
app.get("/api/entries/:id", async (req, res) => {
	try {
		const page = await notion.pages.retrieve({ page_id: req.params.id });
		res.json(mapNotionPageToEntry(page));
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

// Create entry
app.post("/api/entries", async (req, res) => {
	try {
		const {
			feeling,
			reflection,
			reflectionPrompt,
			reflectionQuestion,
			gratefulFor,
		} = req.body;
		const { dataSourceId: dsId } = await getOrCreateDatabase();
		const date = new Date().toISOString().split("T")[0];

		const todayExisting = await notion.dataSources.query({
			data_source_id: dsId,
			filter: {
				property: "Date",
				date: { equals: date },
			},
			page_size: 1,
		});

		if (todayExisting.results.length > 0) {
			return res.status(409).json({ error: "Today's journal is done." });
		}

		const existing = await notion.dataSources.query({ data_source_id: dsId });
		const day = String(existing.results.length + 1);

		const rawPrompt = String(reflectionPrompt || "").trim();
		const questionToStore =
			String(reflectionQuestion || "").trim() ||
			(!looksLikePromptMeta(rawPrompt) ? rawPrompt : "");
		const promptToStore = looksLikePromptMeta(rawPrompt) ? rawPrompt : "";

		const page = await notion.pages.create({
			parent: { data_source_id: dsId },
			properties: {
				Day: { title: [{ text: { content: day } }] },
				Date: { date: { start: date } },
				Feeling: richText(feeling),
				Reflection: richText(reflection),
				ReflectionPrompt: richText(promptToStore),
				ReflectionQuestion: richText(questionToStore),
				GratefulFor: richText(gratefulFor),
			},
		});

		rememberQuestionIfNeeded(questionToStore, promptToStore, page.created_time);
		res.json({ id: page.id });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

// Update entry (day and date stay immutable)
app.put("/api/entries/:id", async (req, res) => {
	try {
		const page = await notion.pages.retrieve({ page_id: req.params.id });
		const entryDate = page.properties?.Date?.date?.start || "";
		const todayDate = new Date().toISOString().split("T")[0];
		if (entryDate !== todayDate) {
			return res
				.status(403)
				.json({ error: "Only today's journal can be edited." });
		}

		const {
			feeling,
			reflection,
			reflectionPrompt,
			reflectionQuestion,
			gratefulFor,
		} = req.body;

		const rawPrompt = String(reflectionPrompt || "").trim();
		const questionToStore =
			String(reflectionQuestion || "").trim() ||
			(!looksLikePromptMeta(rawPrompt) ? rawPrompt : "");
		const promptToStore = looksLikePromptMeta(rawPrompt) ? rawPrompt : "";

		await notion.pages.update({
			page_id: req.params.id,
			properties: {
				Feeling: richText(feeling),
				Reflection: richText(reflection),
				ReflectionPrompt: richText(promptToStore),
				ReflectionQuestion: richText(questionToStore),
				GratefulFor: richText(gratefulFor),
			},
		});

		rememberQuestionIfNeeded(questionToStore, promptToStore);
		res.json({ ok: true });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

// Delete entry
app.delete("/api/entries/:id", async (req, res) => {
	try {
		const page = await notion.pages.retrieve({ page_id: req.params.id });
		const entryDate = page.properties?.Date?.date?.start || "";
		const todayDate = new Date().toISOString().split("T")[0];
		if (entryDate !== todayDate) {
			return res
				.status(403)
				.json({ error: "Only today's journal can be deleted." });
		}

		await notion.pages.update({
			page_id: req.params.id,
			archived: true,
		});
		res.json({ ok: true });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

const PORT = process.env.PORT || 3000;

ensureOllama()
	.then(() => hydrateQuestionHistory())
	.finally(() => {
		app.listen(PORT, () => {
			console.log(`Gratitude journal running at http://localhost:${PORT}`);
		});
	});
