let lang = 'english';
let currentCategory = '';
let allData = {};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===============================
// 🌐 CHANGE LANGUAGE
// ===============================
function setLang(l) {
  lang = l;

  document.getElementById("lang-en").classList.remove("active-lang-mini");
  document.getElementById("lang-hi").classList.remove("active-lang-mini");

  if (l === "english") {
    document.getElementById("lang-en").classList.add("active-lang-mini");
  } else {
    document.getElementById("lang-hi").classList.add("active-lang-mini");
  }

  if (currentCategory) renderLaws(allData[currentCategory]);
}

// ===============================
// 📂 LOAD CATEGORY
// ===============================
async function loadCategory(cat) {
  currentCategory = cat;

  const res = await fetch(`data/${cat}.json`);
  const laws = await res.json();

  allData[cat] = laws;
  renderLaws(laws);
}

// ===============================
// 📝 RENDER LAWS
// ===============================
function renderLaws(laws) {
  const main = document.getElementById('laws');

  main.innerHTML = laws.map((l, index) => `
    <div class="law-card" style="animation-delay:${index * 0.1}s" onclick="openLawDetail('${l.id}')">
      <h3>${l.title}</h3>
      <p><b>${l.section}</b></p>
      <p>${lang === 'english' ? l.english : l.hindi}</p>
    </div>
  `).join('');
}

// ===============================
// 📄 OPEN LAW DETAIL
// ===============================
function openLawDetail(id) {
  window.location.href = `law.html?cat=${currentCategory}&id=${id}`;
}

// ===============================
// 🤖 AI CHATBOT
// ===============================
async function sendMessage() {
  const input = document.getElementById("user-input");
  const msg = input.value.trim();
  if (!msg) return;

  const chatBox = document.getElementById("chat-box");

  // USER MESSAGE
  const userDiv = document.createElement("div");
  userDiv.className = "user-message";
  userDiv.textContent = msg;
  chatBox.appendChild(userDiv);

  input.value = "";
  chatBox.scrollTop = chatBox.scrollHeight;

  // TYPING INDICATOR
  const typingDiv = document.createElement("div");
  typingDiv.className = "bot-message";
  typingDiv.id = "typing-indicator";
  typingDiv.textContent = "Typing...";
  chatBox.appendChild(typingDiv);

  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const response = await fetch("http://localhost:5000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: msg })
    });

    const data = await response.json();

    // REMOVE TYPING
    document.getElementById("typing-indicator")?.remove();

    // BOT MESSAGE
    const botDiv = document.createElement("div");
    botDiv.className = "bot-message";
    botDiv.innerHTML = formatAIResponse(data.reply);
    chatBox.appendChild(botDiv);

  } catch (error) {
    document.getElementById("typing-indicator")?.remove();

    const errorDiv = document.createElement("div");
    errorDiv.className = "bot-message";
    errorDiv.textContent = "⚠️ AI server not responding.";
    chatBox.appendChild(errorDiv);
  }

  chatBox.scrollTop = chatBox.scrollHeight;
}

// ===============================
// FORMAT AI RESPONSE
// ===============================
function formatAIResponse(text) {
  if (!text) return "";

  const cleanedText = text
    .replace(/\r/g, "")
    .replace(/\*\*(.*?)\*\*/g, "\nTitle: $1\n")
    .replace(/#+\s*/g, "")
    .replace(/^([A-Z][^\n]{3,80}?)\s+(Answer:)/gm, "Title: $1\n$2")
    .replace(/\s*(Category:|Question:|Local Law \d+:)\s*/gi, "\n\n$1 ")
    .replace(/\s*(Title:)\s*/gi, "\n\n$1 ")
    .replace(/\s*(Answer:|Key Law:|What You Can Do:|Source:|Important:|Note:|Key Laws:)\s*/gi, "\n\n$1 ")
    .replace(/\s+(\d+\.)\s*/g, "\n$1 ")
    .replace(/\s+-\s+/g, "\n- ")
    .replace(/\s+•\s+/g, "\n- ")
    .trim();

  const sectionMatches = [...cleanedText.matchAll(/(Title:|Category:|Question:|Answer:|Key Law:|What You Can Do:|Source:|Important:|Note:|Key Laws:|Local Law \d+:)([\s\S]*?)(?=Title:|Category:|Question:|Answer:|Key Law:|What You Can Do:|Source:|Important:|Note:|Key Laws:|Local Law \d+:|$)/gi)];

  if (sectionMatches.length) {
    return sectionMatches.map(match => {
      const label = match[1].replace(":", "").trim();
      const value = match[2].trim();

      if (!value) {
        return "";
      }

      if (/^(title|local law \d+)$/i.test(label)) {
        return `<h4 class="chat-main-heading">${escapeHtml(value || label)}</h4>`;
      }

      if (/^(category|question)$/i.test(label)) {
        return `<div class="chat-section chat-section-compact"><strong>${escapeHtml(label)}:</strong><p>${escapeHtml(value)}</p></div>`;
      }

      if (/^answer$/i.test(label)) {
        return `<div class="chat-section chat-section-answer"><p>${escapeHtml(value)}</p></div>`;
      }

      if (/^(source|note|important)$/i.test(label)) {
        return `<p class="chat-meta">${escapeHtml(label)}: ${escapeHtml(value)}</p>`;
      }

      if (/^key law/i.test(label) && /Local Law \d+:/i.test(value)) {
        const lawItems = value
          .split(/(?=Local Law \d+:)/i)
          .map(item => item.trim())
          .filter(Boolean);

        return `<div class="chat-section"><strong>${escapeHtml(label)}:</strong><ul>${lawItems.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
      }

      if (/^what you can do/i.test(label)) {
        const actionItems = value
          .split(/\n|(?=\s*-\s*)/)
          .map(item => item.replace(/^\s*-\s*/, "").trim())
          .filter(Boolean);

        if (actionItems.length > 1) {
          return `<div class="chat-section"><strong>${escapeHtml(label)}:</strong><ul>${actionItems.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
        }
      }

      return `<div class="chat-section"><strong>${escapeHtml(label)}:</strong><p>${escapeHtml(value)}</p></div>`;
    }).filter(Boolean).join("");
  }

  const lines = cleanedText
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const line of lines) {
    if (/^(#{1,6})\s+/.test(line)) {
      closeList();
      html += `<h4>${escapeHtml(line.replace(/^#{1,6}\s+/, ""))}</h4>`;
      continue;
    }

    if (/^Title:\s*/i.test(line)) {
      closeList();
      html += `<h4>${escapeHtml(line.replace(/^Title:\s*/i, ""))}</h4>`;
      continue;
    }

    if (/^(source|note|important)\s*:/i.test(line)) {
      closeList();
      html += `<p class="chat-meta">${escapeHtml(line)}</p>`;
      continue;
    }

    if (/^(answer|key law|what you can do|key laws)\s*:/i.test(line)) {
      closeList();
      const parts = line.split(/:\s*/);
      const label = parts.shift() || "";
      const value = parts.join(": ");

      if (/^key law/i.test(label) && /Local Law \d+:/i.test(value)) {
        const lawItems = value
          .split(/(?=Local Law \d+:)/i)
          .map(item => item.trim())
          .filter(Boolean);

        html += `<div class="chat-section"><strong>${escapeHtml(label)}:</strong><ul>${lawItems.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
        continue;
      }

      if (/^what you can do/i.test(label) && /\s*-\s*/.test(value)) {
        const actionItems = value
          .split(/\s*-\s*/)
          .map(item => item.trim())
          .filter(Boolean);

        html += `<div class="chat-section"><strong>${escapeHtml(label)}:</strong><ul>${actionItems.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
        continue;
      }

      html += `<div class="chat-section"><strong>${escapeHtml(label)}:</strong><p>${escapeHtml(value)}</p></div>`;
      continue;
    }

    if (/^Local Law \d+:/i.test(line)) {
      closeList();
      html += `<h4>${escapeHtml(line)}</h4>`;
      continue;
    }

    if (/^(\d+\.|[-•*])\s+/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${escapeHtml(line.replace(/^(\d+\.|[-•*])\s+/, ""))}</li>`;
      continue;
    }

    if (/:$/.test(line) && line.length < 70) {
      closeList();
      html += `<h4>${escapeHtml(line.slice(0, -1))}</h4>`;
      continue;
    }

    closeList();
    html += `<p>${escapeHtml(line)}</p>`;
  }

  closeList();
  return html;
}

// ===============================
// 💬 TOGGLE CHAT WINDOW
// ===============================
function toggleChat(open) {
  const chat = document.getElementById("chat-container");
  const overlay = document.getElementById("chat-overlay");

  if (open) {
    chat.classList.add("active");
    overlay.classList.add("active");
  } else {
    chat.classList.remove("active");
    overlay.classList.remove("active");
  }
}

// Scroll reveal animation
const revealElements = document.querySelectorAll('.law-card, .learn-laws, #about');

function revealOnScroll() {
  const triggerBottom = window.innerHeight * 0.85;

  revealElements.forEach(el => {
    const boxTop = el.getBoundingClientRect().top;

    if (boxTop < triggerBottom) {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
      el.style.transition = "all 0.6s ease";
    }
  });
}

window.addEventListener("scroll", revealOnScroll);

// ===== SCROLL REVEAL EFFECT =====
const fadeElements = document.querySelectorAll(
  ".cat-card, .law-card, .learn-laws, #about"
);

function revealOnScroll() {
  const triggerPoint = window.innerHeight * 0.85;

  fadeElements.forEach(el => {
    const elementTop = el.getBoundingClientRect().top;

    if (elementTop < triggerPoint) {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }
  });
}

window.addEventListener("scroll", revealOnScroll);
