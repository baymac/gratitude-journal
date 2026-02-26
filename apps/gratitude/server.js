const express = require("express");
const { Client } = require("@notionhq/client");
const path = require("path");
const fs = require("fs");

const {
	DEFAULT_PROMPT_PIPELINE_CONFIG,
	InMemoryQuestionStore,
	PromptPipeline,
} = require("./lib/reflection-prompt/pipeline");
const { analyzeJournalGame } = require("./lib/journal-analytics/gameTheory");

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:1b";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
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

const NOTION_CACHE_PATH = path.join(__dirname, ".notion-cache.json");

function loadNotionCache() {
	try {
		const raw = fs.readFileSync(NOTION_CACHE_PATH, "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function saveNotionCache(data) {
	try {
		fs.writeFileSync(NOTION_CACHE_PATH, JSON.stringify(data), "utf8");
	} catch (err) {
		console.warn("Could not write Notion cache:", err.message);
	}
}

const cachedIds = loadNotionCache();
let databaseId = cachedIds?.databaseId || null;
let dataSourceId = cachedIds?.dataSourceId || null;
const FALLBACK_REFLECTION_QUESTION =
	"What memory still guides the person you are becoming?";
const FALLBACK_REFLECTION_PROMPT = "Theme: personal growth | Start with: What";

class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

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

function todayDateStr() {
	return new Date().toISOString().split("T")[0];
}

function normalizePromptFields({ reflectionPrompt, reflectionQuestion }) {
	const rawPrompt = String(reflectionPrompt || "").trim();
	const questionToStore =
		String(reflectionQuestion || "").trim() ||
		(!looksLikePromptMeta(rawPrompt) ? rawPrompt : "");
	const promptToStore = looksLikePromptMeta(rawPrompt) ? rawPrompt : "";
	return { questionToStore, promptToStore };
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

	saveNotionCache({ databaseId, dataSourceId });
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

async function generatePromptPayload() {
	try {
		const result = await promptPipeline.generate({
			generateCandidate: ({ theme, openingWord }) =>
				generateQuestionFromOllama({ theme, openingWord }),
		});

		return {
			prompt: result.question,
			question: result.question,
			reflectionQuestion: result.question,
			reflectionPrompt: result.prompt,
			theme: result.theme,
			openingWord: result.openingWord,
			attempts: result.attempts,
			fromFallback: result.fromFallback,
		};
	} catch (err) {
		console.error("Prompt generation failed:", err.message);
		return {
			prompt: FALLBACK_REFLECTION_QUESTION,
			question: FALLBACK_REFLECTION_QUESTION,
			reflectionQuestion: FALLBACK_REFLECTION_QUESTION,
			reflectionPrompt: FALLBACK_REFLECTION_PROMPT,
			fromFallback: true,
		};
	}
}

async function listEntries(direction = "descending") {
	const { dataSourceId: dsId } = await getOrCreateDatabase();
	const response = await notion.dataSources.query({
		data_source_id: dsId,
		sorts: [{ property: "Date", direction }],
	});
	return response.results.map((page) => mapNotionPageToEntry(page));
}

async function analyticsSnapshot() {
	const entries = await listEntries("ascending");
	const analytics = analyzeJournalGame(entries);
	return { entries, analytics };
}

async function createEntry({
	feeling,
	reflection,
	reflectionPrompt,
	reflectionQuestion,
	gratefulFor,
}) {
	const { dataSourceId: dsId } = await getOrCreateDatabase();
	const date = todayDateStr();

	const todayExisting = await notion.dataSources.query({
		data_source_id: dsId,
		filter: {
			property: "Date",
			date: { equals: date },
		},
		page_size: 1,
	});

	if (todayExisting.results.length > 0) {
		throw new HttpError(409, "Today's journal is done.");
	}

	const existing = await notion.dataSources.query({ data_source_id: dsId });
	const day = String(existing.results.length + 1);
	const { questionToStore, promptToStore } = normalizePromptFields({
		reflectionPrompt,
		reflectionQuestion,
	});

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
	return {
		id: page.id,
		day,
		date,
	};
}

function analyticsSummaryText(entries, analytics) {
	if (!entries.length) {
		return "No entries yet. Run log-today to create your first journal entry.";
	}

	const gamification = analytics.gamification || {};
	const scores = analytics.scores || {};
	const streaks = analytics.streaks || {};
	const topThemes = Array.isArray(analytics.themes?.top)
		? analytics.themes.top.slice(0, 3)
		: [];
	const themeText = topThemes.length
		? topThemes.map((item) => `${item.theme} (${item.count})`).join(", ")
		: "No clear pattern yet";

	return [
		`Entries: ${entries.length}`,
		`Level: ${gamification.level || "Bronze"} (${gamification.xp || 0} XP)`,
		`Current streak: ${streaks.current || 0} day(s)`,
		`Cooperation score: ${scores.cooperation || 0}`,
		`Defection risk: ${scores.defectionRisk || 0}`,
		`Top themes: ${themeText}`,
	].join("\n");
}

// Generate a reflection question using anti-repetition pipeline
app.get("/api/prompt", async (req, res) => {
	const payload = await generatePromptPayload();
	res.json(payload);
});

// ── Open Claw endpoints ──────────────────────────────────────────────────────
// These are called by the Open Claw AI agent when handling /log-gratitude
// and /analytics-gratitude Telegram commands. The agent manages conversation
// state; these endpoints are fully stateless.

// Step 1 of /log-gratitude: get today's reflection prompt.
// Returns { reflectionQuestion, reflectionPrompt, alreadyLogged }
app.get("/api/open-claw/prompt", async (req, res) => {
	try {
		const entries = await listEntries("descending");
		const alreadyLogged = entries.some((e) => e.date === todayDateStr());
		if (alreadyLogged) {
			return res.json({ alreadyLogged: true });
		}
		const payload = await generatePromptPayload();
		res.json({ alreadyLogged: false, ...payload });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

// Step 2 of /log-gratitude: save the entry once the agent has collected all fields.
// Body: { feeling, reflection, reflectionQuestion, reflectionPrompt, gratefulFor }
// Returns { day, date, entryId }
app.post("/api/open-claw/log-gratitude", async (req, res) => {
	try {
		const {
			feeling,
			reflection,
			reflectionQuestion,
			reflectionPrompt,
			gratefulFor,
		} = req.body;
		const created = await createEntry({
			feeling,
			reflection,
			reflectionQuestion,
			reflectionPrompt,
			gratefulFor,
		});
		res.json({ day: created.day, date: created.date, entryId: created.id });
	} catch (err) {
		if (err instanceof HttpError) {
			return res.status(err.status).json({ error: err.message });
		}
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

// /analytics-gratitude: plain-text summary the agent can paste directly into Telegram.
app.get("/api/open-claw/analytics", async (req, res) => {
	try {
		const { entries, analytics } = await analyticsSnapshot();
		res.type("text/plain").send(analyticsSummaryText(entries, analytics));
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

// Get all entries
app.get("/api/entries", async (req, res) => {
	try {
		const entries = await listEntries("descending");
		res.json(entries);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

// Strategy-based journaling analytics
app.get("/api/analytics", async (req, res) => {
	try {
		const { analytics } = await analyticsSnapshot();
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
		const created = await createEntry({
			feeling,
			reflection,
			reflectionPrompt,
			reflectionQuestion,
			gratefulFor,
		});
		res.json({ id: created.id });
	} catch (err) {
		if (err instanceof HttpError) {
			return res.status(err.status).json({ error: err.message });
		}
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

// Update entry (day and date stay immutable)
app.put("/api/entries/:id", async (req, res) => {
	try {
		const page = await notion.pages.retrieve({ page_id: req.params.id });
		const entryDate = page.properties?.Date?.date?.start || "";
		const todayDate = todayDateStr();
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

		const { questionToStore, promptToStore } = normalizePromptFields({
			reflectionPrompt,
			reflectionQuestion,
		});

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
		const todayDate = todayDateStr();
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

app.listen(PORT, () => {
	console.log(`Gratitude journal running at http://localhost:${PORT}`);
	hydrateQuestionHistory();
});
