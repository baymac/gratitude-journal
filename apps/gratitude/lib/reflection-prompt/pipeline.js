const crypto = require("crypto");

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(base, override) {
	if (!isObject(override)) return { ...base };
	const merged = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (Array.isArray(value)) {
			merged[key] = [...value];
		} else if (isObject(value) && isObject(base[key])) {
			merged[key] = mergeConfig(base[key], value);
		} else {
			merged[key] = value;
		}
	}
	return merged;
}

function normalizeText(text) {
	return String(text || "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function toTokens(text) {
	const normalized = normalizeText(text);
	return normalized ? normalized.split(" ") : [];
}

function toBigrams(text) {
	const normalized = normalizeText(text).replace(/\s+/g, "");
	if (normalized.length < 2) return normalized ? [normalized] : [];
	const grams = [];
	for (let i = 0; i < normalized.length - 1; i++) {
		grams.push(normalized.slice(i, i + 2));
	}
	return grams;
}

function jaccardSimilarity(a, b) {
	const setA = new Set(toTokens(a));
	const setB = new Set(toTokens(b));
	if (!setA.size && !setB.size) return 1;
	if (!setA.size || !setB.size) return 0;
	let intersection = 0;
	for (const token of setA) {
		if (setB.has(token)) intersection += 1;
	}
	const union = setA.size + setB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

function diceCoefficient(a, b) {
	const gramsA = toBigrams(a);
	const gramsB = toBigrams(b);
	if (!gramsA.length && !gramsB.length) return 1;
	if (!gramsA.length || !gramsB.length) return 0;

	const counts = new Map();
	for (const gram of gramsA) {
		counts.set(gram, (counts.get(gram) || 0) + 1);
	}

	let overlap = 0;
	for (const gram of gramsB) {
		const count = counts.get(gram) || 0;
		if (count > 0) {
			overlap += 1;
			counts.set(gram, count - 1);
		}
	}

	return (2 * overlap) / (gramsA.length + gramsB.length);
}

function levenshteinDistance(a, b) {
	const aa = normalizeText(a);
	const bb = normalizeText(b);
	if (!aa) return bb.length;
	if (!bb) return aa.length;

	const rows = aa.length + 1;
	const cols = bb.length + 1;
	const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

	for (let i = 0; i < rows; i++) matrix[i][0] = i;
	for (let j = 0; j < cols; j++) matrix[0][j] = j;

	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,
				matrix[i][j - 1] + 1,
				matrix[i - 1][j - 1] + cost,
			);
		}
	}

	return matrix[rows - 1][cols - 1];
}

function levenshteinSimilarity(a, b) {
	const aa = normalizeText(a);
	const bb = normalizeText(b);
	const maxLength = Math.max(aa.length, bb.length);
	if (!maxLength) return 1;
	return 1 - levenshteinDistance(aa, bb) / maxLength;
}

function cosineSimilarity(a = [], b = []) {
	if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
	if (a.length !== b.length) return 0;

	let dot = 0;
	let magA = 0;
	let magB = 0;

	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		magA += a[i] * a[i];
		magB += b[i] * b[i];
	}

	if (!magA || !magB) return 0;
	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

class InMemoryQuestionStore {
	constructor(limit = 50) {
		this.limit = Math.max(1, limit);
		this.items = [];
	}

	setLimit(limit) {
		this.limit = Math.max(1, limit);
		this.items = this.items.slice(-this.limit);
	}

	seed(items = []) {
		this.items = Array.isArray(items) ? [...items].slice(-this.limit) : [];
	}

	add(item) {
		this.items.push(item);
		if (this.items.length > this.limit) {
			this.items = this.items.slice(-this.limit);
		}
	}

	getAll() {
		return [...this.items];
	}
}

const DEFAULT_PROMPT_PIPELINE_CONFIG = {
	history: {
		limit: 50,
	},
	generation: {
		maxAttempts: 5,
		maxWords: 18,
	},
	steps: {
		rotation: true,
		banList: true,
		stringSimilarity: true,
		embeddingSimilarity: false,
	},
	rotation: {
		themes: [
			"childhood",
			"failure",
			"future self",
			"health",
			"money",
			"identity",
			"fear",
			"friendship",
			"discipline",
			"loneliness",
			"family",
			"regret",
		],
		openingWords: ["When", "Who", "Why", "How", "What"],
	},
	filters: {
		bannedTerms: ["today", "small thing", "grateful", "appreciate"],
	},
	similarity: {
		stringThreshold: 0.75,
		useJaccard: true,
		useDice: true,
		useLevenshtein: true,
		embeddingThreshold: 0.85,
	},
	fallbackQuestions: [
		"What memory still teaches you who you want to become?",
		"How did one hard season quietly strengthen your character?",
		"Why does a past challenge still shape your decisions now?",
		"When did you surprise yourself by choosing growth over comfort?",
		"Who helped you change when you were close to giving up?",
	],
};

class PromptPipeline {
	constructor(config = {}, store = null) {
		this.config = mergeConfig(DEFAULT_PROMPT_PIPELINE_CONFIG, config);
		this.store = store || new InMemoryQuestionStore(this.config.history.limit);
		this.store.setLimit(this.config.history.limit);
	}

	updateConfig(config = {}) {
		this.config = mergeConfig(this.config, config);
		this.store.setLimit(this.config.history.limit);
	}

	getConfig() {
		return this.config;
	}

	getHistory() {
		return this.store.getAll();
	}

	setHistory(items = []) {
		const normalized = (Array.isArray(items) ? items : [])
			.filter((item) => item && item.text)
			.map((item) => ({
				id: item.id || crypto.randomUUID(),
				text: String(item.text).trim(),
				embedding: item.embedding,
				theme: item.theme || "",
				openingWord: item.openingWord || "",
				prompt: item.prompt || "",
				createdAt: item.createdAt || new Date().toISOString(),
			}));
		this.store.seed(normalized);
	}

	remember(item) {
		if (!item || !item.text) return;
		this.store.add({
			id: item.id || crypto.randomUUID(),
			text: String(item.text).trim(),
			embedding: item.embedding,
			theme: item.theme || "",
			openingWord: item.openingWord || "",
			prompt: item.prompt || "",
			createdAt: item.createdAt || new Date().toISOString(),
		});
	}

	selectTheme(index) {
		const themes = this.config.rotation.themes;
		if (!themes.length) return "personal growth";
		return themes[index % themes.length];
	}

	selectOpeningWord(index) {
		const words = this.config.rotation.openingWords;
		if (!words.length) return "What";
		return words[index % words.length];
	}

	buildPromptTemplate({ theme, openingWord }) {
		return `Theme: ${theme} | Start with: ${openingWord}`;
	}

	cleanQuestion(raw) {
		let text = String(raw || "")
			.split("\n")
			.map((line) => line.trim())
			.find((line) => line.length > 0);
		text = String(text || "")
			.replace(/^question:\s*/i, "")
			.replace(/^[\s\-*\d)."']+/, "")
			.replace(/\s+/g, " ")
			.replace(/[."']+$/, "")
			.trim();
		if (text && !text.endsWith("?")) {
			text = `${text}?`;
		}
		return text;
	}

	findBannedTerm(text) {
		const normalized = normalizeText(text);
		for (const term of this.config.filters.bannedTerms) {
			if (normalized.includes(normalizeText(term))) {
				return term;
			}
		}
		return null;
	}

	getStringSimilarityScores(a, b) {
		const scores = [];
		if (this.config.similarity.useJaccard) scores.push(jaccardSimilarity(a, b));
		if (this.config.similarity.useDice) scores.push(diceCoefficient(a, b));
		if (this.config.similarity.useLevenshtein) {
			scores.push(levenshteinSimilarity(a, b));
		}
		return scores;
	}

	findStringDuplicate(candidate, history) {
		for (const item of history) {
			const scores = this.getStringSimilarityScores(candidate, item.text);
			const score = scores.length ? Math.max(...scores) : 0;
			if (score >= this.config.similarity.stringThreshold) {
				return { matched: item, score };
			}
		}
		return null;
	}

	async findEmbeddingDuplicate(candidateEmbedding, history, embeddingProvider) {
		if (!candidateEmbedding || !Array.isArray(candidateEmbedding)) return null;
		for (const item of history) {
			let comparedEmbedding = item.embedding;
			if (!comparedEmbedding && embeddingProvider) {
				comparedEmbedding = await embeddingProvider(item.text);
				item.embedding = comparedEmbedding;
			}
			if (!comparedEmbedding) continue;
			const score = cosineSimilarity(candidateEmbedding, comparedEmbedding);
			if (score >= this.config.similarity.embeddingThreshold) {
				return { matched: item, score };
			}
		}
		return null;
	}

	pickFallback(historyLength) {
		const list = this.config.fallbackQuestions;
		if (!list.length) return "What part of your story deserves deeper reflection right now?";
		return list[historyLength % list.length];
	}

	async generate({
		generateCandidate,
		externalHistory = [],
		embeddingProvider = null,
	} = {}) {
		if (typeof generateCandidate !== "function") {
			throw new Error("generateCandidate must be a function");
		}

		const baseHistory = [...this.store.getAll(), ...(externalHistory || [])]
			.filter((item) => item && item.text)
			.slice(-this.config.history.limit);

		const rejected = [];

		for (let attempt = 0; attempt < this.config.generation.maxAttempts; attempt++) {
			const rotationIndex = baseHistory.length + attempt;
			const theme = this.config.steps.rotation
				? this.selectTheme(rotationIndex)
				: "personal growth";
			const openingWord = this.config.steps.rotation
				? this.selectOpeningWord(rotationIndex * 3 + attempt)
				: "What";
			const prompt = this.buildPromptTemplate({ theme, openingWord });

			let raw;
			try {
				raw = await generateCandidate({ attempt, theme, openingWord, prompt });
			} catch (error) {
				rejected.push({ reason: "generation_error", detail: error.message });
				continue;
			}

			const question = this.cleanQuestion(raw);
			if (!question) {
				rejected.push({ reason: "empty_output" });
				continue;
			}

			const wordCount = toTokens(question).length;
			if (wordCount > this.config.generation.maxWords) {
				rejected.push({ reason: "word_limit", words: wordCount, question });
				continue;
			}

			if (this.config.steps.banList) {
				const banned = this.findBannedTerm(question);
				if (banned) {
					rejected.push({ reason: "banned_term", banned, question });
					continue;
				}
			}

			if (this.config.steps.stringSimilarity) {
				const duplicate = this.findStringDuplicate(question, baseHistory);
				if (duplicate) {
					rejected.push({
						reason: "string_similarity",
						score: duplicate.score,
						matched: duplicate.matched.text,
						question,
					});
					continue;
				}
			}

			let embedding = null;
			if (this.config.steps.embeddingSimilarity && embeddingProvider) {
				embedding = await embeddingProvider(question);
				const duplicate = await this.findEmbeddingDuplicate(
					embedding,
					baseHistory,
					embeddingProvider,
				);
				if (duplicate) {
					rejected.push({
						reason: "embedding_similarity",
						score: duplicate.score,
						matched: duplicate.matched.text,
						question,
					});
					continue;
				}
			}

			const result = {
				id: crypto.randomUUID(),
				question,
				theme,
				openingWord,
				prompt,
				embedding,
				attempts: attempt + 1,
				rejected,
				createdAt: new Date().toISOString(),
				fromFallback: false,
			};

			this.remember({
				id: result.id,
				text: result.question,
				embedding: result.embedding,
				theme: result.theme,
				openingWord: result.openingWord,
				prompt: result.prompt,
				createdAt: result.createdAt,
			});

			return result;
		}

		const fallbackTheme = this.selectTheme(baseHistory.length);
		const fallbackOpeningWord = this.selectOpeningWord(baseHistory.length);
		const fallbackPrompt = this.buildPromptTemplate({
			theme: fallbackTheme,
			openingWord: fallbackOpeningWord,
		});
		const fallbackQuestion = this.pickFallback(baseHistory.length);

		const fallback = {
			id: crypto.randomUUID(),
			question: fallbackQuestion,
			theme: fallbackTheme,
			openingWord: fallbackOpeningWord,
			prompt: fallbackPrompt,
			embedding: null,
			attempts: this.config.generation.maxAttempts,
			rejected,
			createdAt: new Date().toISOString(),
			fromFallback: true,
		};

		this.remember({
			id: fallback.id,
			text: fallback.question,
			theme: fallback.theme,
			openingWord: fallback.openingWord,
			prompt: fallback.prompt,
			createdAt: fallback.createdAt,
		});

		return fallback;
	}
}

module.exports = {
	DEFAULT_PROMPT_PIPELINE_CONFIG,
	InMemoryQuestionStore,
	PromptPipeline,
	similarityUtils: {
		cosineSimilarity,
		diceCoefficient,
		jaccardSimilarity,
		levenshteinDistance,
		levenshteinSimilarity,
	},
};
