const MS_PER_DAY = 24 * 60 * 60 * 1000;

const POSITIVE_TERMS = new Set([
	"calm",
	"better",
	"healthy",
	"strong",
	"confident",
	"excited",
	"happy",
	"peaceful",
	"joy",
	"support",
	"improve",
	"good",
	"satisfied",
	"relaxed",
	"stable",
	"focused",
	"disciplined",
]);

const NEGATIVE_TERMS = new Set([
	"anxious",
	"stress",
	"stressed",
	"weak",
	"worried",
	"sick",
	"pain",
	"discomfort",
	"lonely",
	"craving",
	"blocked",
	"sluggish",
	"fear",
	"regret",
	"smoking",
	"ache",
]);

const PEOPLE_TERMS = new Set([
	"friend",
	"friends",
	"family",
	"father",
	"mother",
	"mom",
	"dad",
	"girlfriend",
	"boyfriend",
	"parents",
	"sister",
	"brother",
	"flatmates",
	"partner",
	"people",
]);

const THEME_KEYWORDS = {
	health: [
		"health",
		"lungs",
		"run",
		"marathon",
		"sleep",
		"body",
		"exercise",
		"sick",
	],
	discipline: [
		"discipline",
		"routine",
		"habit",
		"control",
		"consistency",
		"focus",
	],
	relationships: [
		"friend",
		"family",
		"parents",
		"girlfriend",
		"relationship",
		"people",
	],
	identity: [
		"myself",
		"identity",
		"confidence",
		"confident",
		"person",
		"becoming",
	],
	growth: ["growth", "improve", "learning", "mistake", "change", "progress"],
	nature: ["nature", "trees", "animals", "sunlight", "outdoors"],
	work: ["work", "job", "software", "college", "gsoc", "project"],
};

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function safeDate(dateStr) {
	if (!dateStr) return null;
	const d = new Date(`${dateStr}T00:00:00Z`);
	return Number.isNaN(d.getTime()) ? null : d;
}

function normalize(text) {
	return String(text || "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokens(text) {
	const normalized = normalize(text);
	return normalized ? normalized.split(" ") : [];
}

function wordCount(text) {
	return tokens(text).length;
}

function parseGratefulItems(text) {
	if (!text) return [];
	return String(text)
		.split(/\r?\n/)
		.map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
		.filter(Boolean);
}

function average(numbers) {
	if (!numbers.length) return 0;
	return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function streakStats(entries) {
	const uniqueDates = Array.from(
		new Set(entries.map((entry) => entry.date).filter(Boolean)),
	).sort();

	if (!uniqueDates.length) {
		return {
			activeDays: 0,
			spanDays: 0,
			longestStreak: 0,
			currentStreak: 0,
		};
	}

	let longestStreak = 1;
	let running = 1;

	for (let i = 1; i < uniqueDates.length; i += 1) {
		const prev = safeDate(uniqueDates[i - 1]);
		const next = safeDate(uniqueDates[i]);
		if (!prev || !next) continue;
		const gap = Math.round((next.getTime() - prev.getTime()) / MS_PER_DAY);
		if (gap === 1) running += 1;
		else if (gap > 1) running = 1;
		if (running > longestStreak) longestStreak = running;
	}

	let currentStreak = 1;
	for (let i = uniqueDates.length - 1; i > 0; i -= 1) {
		const prev = safeDate(uniqueDates[i - 1]);
		const next = safeDate(uniqueDates[i]);
		if (!prev || !next) continue;
		const gap = Math.round((next.getTime() - prev.getTime()) / MS_PER_DAY);
		if (gap === 1) currentStreak += 1;
		else if (gap > 1) break;
	}

	const first = safeDate(uniqueDates[0]);
	const last = safeDate(uniqueDates[uniqueDates.length - 1]);
	const spanDays =
		first && last ? Math.max(1, Math.round((last - first) / MS_PER_DAY) + 1) : 1;

	return {
		activeDays: uniqueDates.length,
		spanDays,
		longestStreak,
		currentStreak,
	};
}

function sentimentSignal(text) {
	const words = tokens(text);
	if (!words.length) return 0;
	let positive = 0;
	let negative = 0;
	for (const word of words) {
		if (POSITIVE_TERMS.has(word)) positive += 1;
		if (NEGATIVE_TERMS.has(word)) negative += 1;
	}
	return (positive - negative) / words.length;
}

function detectThemes(text) {
	const found = [];
	const normalized = normalize(text);
	for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
		if (keywords.some((word) => normalized.includes(word))) {
			found.push(theme);
		}
	}
	return found;
}

function levelFromScore(score) {
	if (score >= 85) return "Diamond";
	if (score >= 70) return "Gold";
	if (score >= 55) return "Silver";
	return "Bronze";
}

function addThresholdQuestGroup(defs, config) {
	const {
		prefix,
		metricKey,
		category,
		thresholds,
		rewardBase,
		rewardStep,
		titleBuilder,
	} = config;

	thresholds.forEach((target, index) => {
		defs.push({
			id: `${prefix}-${String(target).replace(/\./g, "_")}`,
			metricKey,
			category,
			title: titleBuilder(target),
			target,
			rewardXp: rewardBase + index * rewardStep,
		});
	});
}

function buildQuestCatalog() {
	const defs = [];

	addThresholdQuestGroup(defs, {
		prefix: "streak",
		metricKey: "currentStreak",
		category: "Consistency",
		thresholds: [1, 2, 3, 4, 5, 7, 10, 14, 21, 30, 45, 60],
		rewardBase: 25,
		rewardStep: 6,
		titleBuilder: (target) => `Hold a ${target}-day streak`,
	});

	addThresholdQuestGroup(defs, {
		prefix: "volume",
		metricKey: "totalEntries",
		category: "Volume",
		thresholds: [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90],
		rewardBase: 20,
		rewardStep: 5,
		titleBuilder: (target) => `Log ${target} total entries`,
	});

	addThresholdQuestGroup(defs, {
		prefix: "reflection",
		metricKey: "reflectionAvgWords",
		category: "Depth",
		thresholds: [5, 8, 10, 12, 15, 18, 22, 26, 30, 40],
		rewardBase: 22,
		rewardStep: 6,
		titleBuilder: (target) => `Reach ${target}+ avg reflection words`,
	});

	addThresholdQuestGroup(defs, {
		prefix: "consistency-rate",
		metricKey: "consistencyRatePct",
		category: "Stability",
		thresholds: [30, 40, 50, 60, 70, 80, 90, 100],
		rewardBase: 24,
		rewardStep: 7,
		titleBuilder: (target) => `Maintain ${target}% consistency rate`,
	});

	addThresholdQuestGroup(defs, {
		prefix: "theme",
		metricKey: "themesCovered",
		category: "Exploration",
		thresholds: [1, 2, 3, 4, 5, 6, 7],
		rewardBase: 18,
		rewardStep: 6,
		titleBuilder: (target) => `Cover ${target} unique life themes`,
	});

	addThresholdQuestGroup(defs, {
		prefix: "cooperation",
		metricKey: "cooperation",
		category: "Strategy",
		thresholds: [20, 30, 40, 50, 60, 70, 80, 90, 95],
		rewardBase: 20,
		rewardStep: 8,
		titleBuilder: (target) => `Push cooperation score to ${target}`,
	});

	addThresholdQuestGroup(defs, {
		prefix: "active-days",
		metricKey: "activeDays",
		category: "Commitment",
		thresholds: [2, 4, 6, 8, 10, 14, 20, 30],
		rewardBase: 16,
		rewardStep: 5,
		titleBuilder: (target) => `Be active on ${target} unique days`,
	});

	return defs;
}

const QUEST_CATALOG = buildQuestCatalog();

function buildQuestProgress(metrics) {
	return QUEST_CATALOG.map((quest) => {
		const progress = Number(metrics[quest.metricKey] || 0);
		return {
			id: quest.id,
			title: quest.title,
			category: quest.category,
			rewardXp: quest.rewardXp,
			target: quest.target,
			progress: Math.round(progress * 10) / 10,
			done: progress >= quest.target,
		};
	});
}

function analyzeJournalGame(rawEntries = []) {
	const entries = (Array.isArray(rawEntries) ? rawEntries : [])
		.filter((entry) => entry && entry.date)
		.slice()
		.sort((a, b) => String(a.date).localeCompare(String(b.date)));

	const totalEntries = entries.length;
	if (!totalEntries) {
		return {
			generatedAt: new Date().toISOString(),
			window: {
				totalEntries: 0,
				activeDays: 0,
				spanDays: 0,
				firstDate: "",
				lastDate: "",
			},
			scores: {
				cooperation: 0,
				defectionRisk: 0,
				exploration: 0,
				nashBalance: 0,
			},
			streaks: {
				current: 0,
				longest: 0,
			},
			writing: {
				reflectionAvgWords: 0,
				feelingAvgWords: 0,
				gratefulAvgItems: 0,
				vocabularyDiversity: 0,
			},
			sentiment: {
				firstWindowScore: 0,
				lastWindowScore: 0,
				trend: 0,
			},
			themes: {
				covered: [],
				top: [],
			},
				gamification: {
					level: "Bronze",
					xp: 0,
					completedQuests: 0,
					totalQuests: QUEST_CATALOG.length,
				},
			quests: QUEST_CATALOG.map((quest) => ({
				id: quest.id,
				title: quest.title,
				category: quest.category,
				rewardXp: quest.rewardXp,
				target: quest.target,
				progress: 0,
				done: false,
			})),
		};
	}

	const streak = streakStats(entries);
	const consistencyRate = streak.activeDays / Math.max(1, streak.spanDays);

	const reflectionWords = entries.map((e) => wordCount(e.reflection));
	const feelingWords = entries.map((e) => wordCount(e.feeling));
	const gratefulCounts = entries.map((e) => parseGratefulItems(e.gratefulFor).length);

	const avgReflectionWords = average(reflectionWords);
	const avgFeelingWords = average(feelingWords);
	const avgGratefulItems = average(gratefulCounts);

	const combinedTokens = entries.flatMap((entry) =>
		tokens(
			`${entry.feeling || ""} ${entry.reflection || ""} ${entry.gratefulFor || ""}`,
		),
	);
	const uniqueTokenCount = new Set(combinedTokens).size;
	const vocabularyDiversity = combinedTokens.length
		? uniqueTokenCount / combinedTokens.length
		: 0;

	const peopleMentions = entries.reduce((sum, entry) => {
		const entryWords = new Set(
			tokens(`${entry.reflection || ""} ${entry.gratefulFor || ""}`),
		);
		for (const word of PEOPLE_TERMS) {
			if (entryWords.has(word)) return sum + 1;
		}
		return sum;
	}, 0);
	const peopleMentionRate = peopleMentions / totalEntries;

	const sentimentByEntry = entries.map((entry) =>
		sentimentSignal(`${entry.feeling || ""} ${entry.reflection || ""}`),
	);
	const windowSize = Math.min(4, sentimentByEntry.length);
	const firstSentiment = average(sentimentByEntry.slice(0, windowSize));
	const lastSentiment = average(sentimentByEntry.slice(-windowSize));
	const sentimentTrend = lastSentiment - firstSentiment;
	const trendScore = clamp(50 + sentimentTrend * 500, 0, 100);

	const themeCounts = Object.fromEntries(
		Object.keys(THEME_KEYWORDS).map((key) => [key, 0]),
	);
	for (const entry of entries) {
		const found = detectThemes(
			`${entry.feeling || ""} ${entry.reflection || ""} ${entry.gratefulFor || ""}`,
		);
		for (const theme of found) themeCounts[theme] += 1;
	}
	const coveredThemes = Object.entries(themeCounts)
		.filter(([, count]) => count > 0)
		.map(([theme]) => theme);
	const explorationScore = clamp(
		(coveredThemes.length / Object.keys(THEME_KEYWORDS).length) * 100,
		0,
		100,
	);

	const consistencyScore = consistencyRate * 100;
	const streakScore = clamp((streak.currentStreak / 7) * 100, 0, 100);
	const depthScore = clamp((avgReflectionWords / 45) * 100, 0, 100);
	const gratitudeBreadthScore = clamp((avgGratefulItems / 5) * 100, 0, 100);
	const socialScore = clamp(peopleMentionRate * 100, 0, 100);

	const cooperation = Math.round(
		0.28 * consistencyScore +
			0.24 * streakScore +
			0.18 * depthScore +
			0.15 * gratitudeBreadthScore +
			0.15 * socialScore,
	);

	const defectionRisk = Math.round(
		clamp(
			100 -
				(0.35 * consistencyScore +
					0.2 * streakScore +
					0.2 * depthScore +
					0.15 * gratitudeBreadthScore +
					0.1 * trendScore),
			0,
			100,
		),
	);

	const nashBalance = Math.round(
		0.5 * cooperation + 0.25 * explorationScore + 0.25 * (100 - defectionRisk),
	);

	const topThemes = Object.entries(themeCounts)
		.filter(([, count]) => count > 0)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([theme, count]) => ({ theme, count }));

	const metricSnapshot = {
		currentStreak: streak.currentStreak,
		totalEntries,
		reflectionAvgWords: avgReflectionWords,
		consistencyRatePct: consistencyRate * 100,
		themesCovered: coveredThemes.length,
		cooperation,
		activeDays: streak.activeDays,
	};
	const quests = buildQuestProgress(metricSnapshot);
	const completedQuests = quests.filter((quest) => quest.done).length;

	const baseXp =
		totalEntries * 15 +
		streak.longestStreak * 10 +
		Math.round(cooperation * 1.5) +
		Math.round(explorationScore) +
		completedQuests * 8;

	return {
		generatedAt: new Date().toISOString(),
		window: {
			totalEntries,
			activeDays: streak.activeDays,
			spanDays: streak.spanDays,
			firstDate: entries[0]?.date || "",
			lastDate: entries[entries.length - 1]?.date || "",
		},
		scores: {
			cooperation,
			defectionRisk,
			exploration: Math.round(explorationScore),
			nashBalance,
		},
		streaks: {
			current: streak.currentStreak,
			longest: streak.longestStreak,
		},
		writing: {
			reflectionAvgWords: Math.round(avgReflectionWords * 10) / 10,
			feelingAvgWords: Math.round(avgFeelingWords * 10) / 10,
			gratefulAvgItems: Math.round(avgGratefulItems * 10) / 10,
			vocabularyDiversity: Math.round(vocabularyDiversity * 1000) / 1000,
		},
		sentiment: {
			firstWindowScore: Math.round(firstSentiment * 1000) / 1000,
			lastWindowScore: Math.round(lastSentiment * 1000) / 1000,
			trend: Math.round(sentimentTrend * 1000) / 1000,
		},
		themes: {
			covered: coveredThemes,
			top: topThemes,
		},
			gamification: {
				level: levelFromScore(cooperation),
				xp: baseXp,
				completedQuests,
				totalQuests: quests.length,
			},
		quests,
	};
}

module.exports = {
	QUEST_CATALOG,
	analyzeJournalGame,
};
