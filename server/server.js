import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STORIES_PATH = path.join(DATA_DIR, "stories.json");
const ADMIN_KEY = String(process.env.ADMIN_KEY || "legalsetu-admin");

function ensureStoriesFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORIES_PATH)) {
    fs.writeFileSync(STORIES_PATH, JSON.stringify({ submissions: [] }, null, 2));
  }
}

function readStories() {
  ensureStoriesFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(STORIES_PATH, "utf8"));
    return Array.isArray(parsed.submissions) ? parsed.submissions : [];
  } catch (error) {
    console.error("Failed to read stories:", error);
    return [];
  }
}

function writeStories(stories) {
  ensureStoriesFile();
  fs.writeFileSync(STORIES_PATH, JSON.stringify({ submissions: stories }, null, 2));
}

function requireAdmin(req, res, next) {
  if (String(req.headers["x-admin-key"] || "") !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized admin access." });
  }

  next();
}

function loadLocalLawData() {
  if (!fs.existsSync(DATA_DIR)) {
    return [];
  }

  const files = fs.readdirSync(DATA_DIR).filter(file => file.endsWith(".json") && file !== "stories.json");
  const allLaws = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));

      if (!Array.isArray(parsed)) {
        continue;
      }

      const category = path.basename(file, ".json");

      parsed.forEach(law => {
        allLaws.push({
          category,
          id: law.id || "",
          title: law.title || "",
          section: law.section || "",
          english: law.english || "",
          explanationEnglish: law.explanationEnglish || "",
          tags: law.tags || "",
          officialActName: law.officialActName || "",
          verifiedSource: law.verifiedSource || "",
          referenceLink: law.referenceLink || law.officialLink || ""
        });
      });
    } catch (error) {
      console.error(`Failed to load ${file}:`, error);
    }
  }

  return allLaws;
}

const localLaws = loadLocalLawData();

function buildLocalLawContext(message) {
  const query = message.toLowerCase();
  const keywords = query.split(/[^a-z0-9]+/i).filter(word => word.length > 2);

  const matches = localLaws
    .map(law => {
      const haystack = [
        law.category,
        law.title,
        law.section,
        law.english,
        law.explanationEnglish,
        law.tags,
        law.officialActName
      ].join(" ").toLowerCase();

      let score = haystack.includes(query) ? 4 : 0;

      for (const keyword of keywords) {
        if (haystack.includes(keyword)) {
          score += 2;
        }
      }

      return { law, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(item => item.law);

  if (!matches.length) {
    return "No exact local dataset match found.";
  }

  return matches.map((law, index) => [
    `Local Law ${index + 1}:`,
    `Category: ${law.category}`,
    `Title: ${law.title}`,
    `Section: ${law.section}`,
    `Summary: ${law.english}`,
    `Explanation: ${law.explanationEnglish}`,
    law.officialActName ? `Official Act: ${law.officialActName}` : "",
    law.verifiedSource ? `Verified Source: ${law.verifiedSource}` : "",
    law.referenceLink ? `Reference Link: ${law.referenceLink}` : "",
    law.tags ? `Tags: ${law.tags}` : ""
  ].filter(Boolean).join("\n")).join("\n\n");
}

ensureStoriesFile();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/stories", (req, res) => {
  const stories = readStories()
    .filter(story => story.status === "approved")
    .sort((a, b) => {
      if (Boolean(b.featured) !== Boolean(a.featured)) {
        return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      }

      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  res.json({ stories });
});

app.post("/api/stories", (req, res) => {
  const {
    name,
    city,
    category,
    outcomeStatus,
    problem,
    actionTaken,
    outcome,
    lesson,
    consent
  } = req.body || {};

  if (!problem || !actionTaken || !outcome || !category) {
    return res.status(400).json({ error: "Please fill the required story fields." });
  }

  if (!consent) {
    return res.status(400).json({ error: "Please confirm that the story can be reviewed." });
  }

  const stories = readStories();
  const story = {
    id: `story-${Date.now()}`,
    name: typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : "Anonymous Citizen",
    city: typeof city === "string" ? city.trim().slice(0, 80) : "",
    category: String(category).trim().slice(0, 40),
    outcomeStatus: typeof outcomeStatus === "string" ? outcomeStatus.trim().slice(0, 60) : "",
    problem: String(problem).trim().slice(0, 800),
    actionTaken: String(actionTaken).trim().slice(0, 1000),
    outcome: String(outcome).trim().slice(0, 700),
    lesson: typeof lesson === "string" ? lesson.trim().slice(0, 500) : "",
    consent: true,
    status: "pending",
    featured: false,
    createdAt: new Date().toISOString()
  };

  stories.unshift(story);
  writeStories(stories);

  res.status(201).json({ message: "Your story was submitted for review.", story });
});

app.get("/api/admin/stories", requireAdmin, (req, res) => {
  const stories = readStories().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ stories });
});

app.patch("/api/admin/stories/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, featured } = req.body || {};
  const stories = readStories();
  const storyIndex = stories.findIndex(story => story.id === id);

  if (storyIndex === -1) {
    return res.status(404).json({ error: "Story not found." });
  }

  if (["pending", "approved", "rejected"].includes(status)) {
    stories[storyIndex].status = status;
  }

  if (typeof featured === "boolean") {
    stories[storyIndex].featured = featured;
  }

  writeStories(stories);
  res.json({ message: "Story updated.", story: stories[storyIndex] });
});

app.delete("/api/admin/stories/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const stories = readStories();
  const nextStories = stories.filter(story => story.id !== id);

  if (nextStories.length === stories.length) {
    return res.status(404).json({ error: "Story not found." });
  }

  writeStories(nextStories);
  res.json({ message: "Story removed." });
});

app.post("/chat", async (req, res) => {
  const message = req.body.message;

  if (!message) {
    return res.json({ reply: "Please enter a question." });
  }

  try {
    const localLawContext = buildLocalLawContext(message);

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `
You are LegalSetu, a professional Indian legal assistant.

Rules:
- Prefer short, easy-to-read sections.
- Use this exact plain-text structure when possible:
  Key Law:
  What You Can Do:
  Source:
- Start the main explanation directly, without writing the word "Answer".
- If you mention more than one law, format each as:
  Local Law 1:
  Key Law:
  What You Can Do:
  Source:
- Put each label on its own new line.
- Leave a blank line between the main explanation and each later section.
- Use short bullets or short paragraphs.
- Mention relevant Act name and Section number only when reasonably supported.
- Use the local website law data when it is relevant to the question.
- Do not invent laws.
- If state rules vary, clearly mention: "State rules may vary."
- Do not use markdown symbols like **, ##, or ### in the final answer.
`
            },
            {
              role: "system",
              content: `Local website law data:\n${localLawContext}`
            },
            {
              role: "user",
              content: message
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      console.log("API ERROR:", data);
      return res.json({
        reply: "Sorry, I could not prepare a legal answer right now. Please try again."
      });
    }

    const aiReply = data.choices[0].message.content;
    res.json({ reply: aiReply });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.json({ reply: "AI server not responding." });
  }
});

app.listen(5000, () => {
  console.log("LegalSetu Server running on http://localhost:5000");
});
