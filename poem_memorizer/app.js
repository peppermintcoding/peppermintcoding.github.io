const CONTENT_URL = "content.json";
const LANGUAGE_STORAGE_KEY = "poem-memorizer-language";

const elements = {
  cardQuote: document.getElementById("card-quote"),
  languageSwitcher: document.getElementById("language-switcher"),
  roundLabel: document.getElementById("round-label"),
  roundBadge: document.getElementById("round-badge"),
  roundNum: document.getElementById("round-num"),
  timer: document.getElementById("timer"),
  timerPrefix: document.getElementById("timer-prefix"),
  timerValue: document.getElementById("timer-val"),
  timerSuffix: document.getElementById("timer-suffix"),
  poemTitle: document.getElementById("poem-title"),
  poemAuthor: document.getElementById("poem-author"),
  poemContainer: document.getElementById("poem-container"),
  status: document.getElementById("status"),
  choicesArea: document.getElementById("choices-area"),
  overlayWin: document.getElementById("overlay-win"),
  overlayFail: document.getElementById("overlay-fail"),
  winTitle: document.getElementById("win-title"),
  winMessage: document.getElementById("win-message"),
  failTitle: document.getElementById("fail-title"),
  failMessage: document.getElementById("fail-msg"),
  restartButton: document.getElementById("restart-button"),
  retryButton: document.getElementById("retry-button"),
  secondaryRestartButton: document.getElementById("secondary-restart-button")
};

let gameContent = null;
let currentLanguage = null;
let currentPoem = null;
let poemLines = [];
let allWords = [];
let wordById = new Map();
let fadedIds = new Set();
let savedFadedIds = new Set();
let solvedIds = new Set();
let usedChoiceIds = new Set();
let clickOrder = [];
let expectedOrder = [];
let round = 0;
let savedRound = 0;
let timerInterval = null;
let gameActive = false;
let statusTimeout = null;

elements.restartButton.addEventListener("click", fullRestart);
elements.retryButton.addEventListener("click", retryRound);
elements.secondaryRestartButton.addEventListener("click", fullRestart);

function getLanguages() {
  return gameContent.languages;
}

function getDefaultLanguage() {
  return gameContent.defaultLanguage;
}

function resolveInitialLanguage() {
  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  const languages = getLanguages();
  return languages[storedLanguage] ? storedLanguage : getDefaultLanguage();
}

function getLanguageConfig(language = currentLanguage) {
  const languages = getLanguages();
  return languages[language] ?? languages[getDefaultLanguage()];
}

function getPoemsForLanguage(language = currentLanguage) {
  const poems = getLanguageConfig(language).poems;

  if (!Array.isArray(poems) || !poems.length) {
    throw new Error(`No poems available for "${language}"`);
  }

  return poems;
}

function formatTemplate(template, replacements = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => {
    return Object.hasOwn(replacements, key) ? String(replacements[key]) : match;
  });
}

function setMultilineText(element, lines) {
  element.replaceChildren();

  lines.forEach((line, index) => {
    if (index > 0) {
      element.appendChild(document.createElement("br"));
    }

    element.appendChild(document.createTextNode(line));
  });
}

function renderLanguageButtons() {
  elements.languageSwitcher.replaceChildren();

  Object.entries(getLanguages()).forEach(([languageCode, config]) => {
    const button = document.createElement("button");
    button.className = "language-button";
    button.type = "button";
    button.dataset.language = languageCode;
    button.title = config.languageName ?? languageCode;
    button.setAttribute("aria-label", config.languageName ?? languageCode);
    button.textContent = config.flag ?? languageCode.toUpperCase();
    button.addEventListener("click", () => setLanguage(languageCode));
    elements.languageSwitcher.appendChild(button);
  });
}

function updateLanguageButtons() {
  Array.from(elements.languageSwitcher.querySelectorAll(".language-button")).forEach((button) => {
    const isActive = button.dataset.language === currentLanguage;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function updateLocalizedCopy() {
  const copy = getLanguageConfig();

  document.documentElement.lang = copy.htmlLang;
  document.title = copy.pageTitle;
  elements.languageSwitcher.setAttribute("aria-label", copy.languageSwitcherLabel);
  elements.cardQuote.textContent = copy.cardQuote;
  elements.roundLabel.textContent = copy.roundLabel;
  elements.timerPrefix.textContent = copy.timerPrefix;
  elements.timerSuffix.textContent = copy.timerSuffix;
  elements.winTitle.textContent = copy.winTitle;
  setMultilineText(elements.winMessage, copy.winMessage);
  elements.failTitle.textContent = copy.failTitle;
  elements.restartButton.textContent = copy.restartLabel;
  elements.retryButton.textContent = copy.retryLabel;
  elements.secondaryRestartButton.textContent = copy.secondaryRestartLabel;
  updateLanguageButtons();
}

function renderPoemMeta() {
  const copy = getLanguageConfig();
  elements.poemTitle.textContent = currentPoem?.title || copy.defaultPoemTitle;
  elements.poemAuthor.textContent = currentPoem?.author ? `${copy.authorPrefix} ${currentPoem.author}` : "";
}

function hasGuessableChars(token) {
  return /[\p{L}\p{N}]/u.test(token);
}

function tokenizeLine(line) {
  const rawTokens = line.match(/\S+/g) || [];
  const mergedTokens = [];
  let pendingPrefix = [];

  rawTokens.forEach((token) => {
    if (hasGuessableChars(token)) {
      const prefix = pendingPrefix.length ? `${pendingPrefix.join(" ")} ` : "";
      mergedTokens.push(prefix + token);
      pendingPrefix = [];
      return;
    }

    if (mergedTokens.length) {
      mergedTokens[mergedTokens.length - 1] += ` ${token}`;
    } else {
      pendingPrefix.push(token);
    }
  });

  if (pendingPrefix.length && mergedTokens.length) {
    mergedTokens[mergedTokens.length - 1] += ` ${pendingPrefix.join(" ")}`;
  }

  return mergedTokens;
}

function buildWords() {
  allWords = [];
  wordById = new Map();
  let id = 0;

  poemLines.forEach((line, lineIndex) => {
    tokenizeLine(line).forEach((token, wordIndex) => {
      const word = { id, lineIdx: lineIndex, wordIdx: wordIndex, text: token };
      allWords.push(word);
      wordById.set(id, word);
      id += 1;
    });
  });
}

function dayOfYearUtc(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - start) / 86400000);
}

function hashString(value) {
  let hash = 0;

  for (const char of value) {
    hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function pickDailyPoem(poems, date = new Date()) {
  if (!poems.length) {
    throw new Error("No poems available");
  }

  const seed = `${date.getUTCFullYear()}-${dayOfYearUtc(date)}`;
  return poems[hashString(seed) % poems.length];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isValidPoem(poem) {
  return poem
    && isNonEmptyString(poem.title)
    && isNonEmptyString(poem.author)
    && isStringArray(poem.lines);
}

function isValidLanguageConfig(languageConfig) {
  return languageConfig
    && isNonEmptyString(languageConfig.htmlLang)
    && isNonEmptyString(languageConfig.pageTitle)
    && isNonEmptyString(languageConfig.flag)
    && isNonEmptyString(languageConfig.languageName)
    && isNonEmptyString(languageConfig.cardQuote)
    && isNonEmptyString(languageConfig.defaultPoemTitle)
    && isNonEmptyString(languageConfig.authorPrefix)
    && isNonEmptyString(languageConfig.roundLabel)
    && isNonEmptyString(languageConfig.timerPrefix)
    && typeof languageConfig.timerSuffix === "string"
    && isNonEmptyString(languageConfig.languageSwitcherLabel)
    && isNonEmptyString(languageConfig.winTitle)
    && isStringArray(languageConfig.winMessage)
    && isNonEmptyString(languageConfig.restartLabel)
    && isNonEmptyString(languageConfig.failTitle)
    && isNonEmptyString(languageConfig.failFallback)
    && isNonEmptyString(languageConfig.retryLabel)
    && isNonEmptyString(languageConfig.secondaryRestartLabel)
    && isNonEmptyString(languageConfig.loadErrorLine)
    && isNonEmptyString(languageConfig.reloadPrompt)
    && isNonEmptyString(languageConfig.loadingStatus)
    && isNonEmptyString(languageConfig.readingStatus)
    && isNonEmptyString(languageConfig.usedWordStatus)
    && isNonEmptyString(languageConfig.perfectStatus)
    && isNonEmptyString(languageConfig.correctStatus)
    && isNonEmptyString(languageConfig.wrongStatus)
    && isNonEmptyString(languageConfig.oneMissingStatus)
    && isNonEmptyString(languageConfig.manyMissingStatus)
    && isNonEmptyString(languageConfig.failMessage)
    && Array.isArray(languageConfig.poems)
    && languageConfig.poems.length > 0
    && languageConfig.poems.every(isValidPoem);
}

function isValidMaskProgression(maskProgression) {
  return Array.isArray(maskProgression)
    && maskProgression.length > 0
    && maskProgression.every((value) => Number.isInteger(value) && value > 0);
}

function isValidGameContent(content) {
  if (!content || typeof content !== "object") {
    return false;
  }

  const languages = content.languages;
  const defaultLanguage = content.defaultLanguage;

  return typeof languages === "object"
    && languages !== null
    && Object.keys(languages).length > 0
    && isNonEmptyString(defaultLanguage)
    && Boolean(languages[defaultLanguage])
    && Object.values(languages).every(isValidLanguageConfig)
    && isValidMaskProgression(content.maskProgression);
}

async function loadGameContent() {
  const response = await fetch(CONTENT_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load content (${response.status})`);
  }

  const content = await response.json();

  if (!isValidGameContent(content)) {
    throw new Error("Invalid content payload");
  }

  return content;
}

function showLoadError(error) {
  console.error(error);
  gameActive = false;
  clearInterval(timerInterval);
  clearTimeout(statusTimeout);
  elements.roundBadge.style.opacity = "0";
  elements.poemTitle.textContent = "Poem Memorizer";
  elements.poemAuthor.textContent = "";
  elements.poemContainer.innerHTML = "<div class=\"poem-line\">The content file could not be loaded.</div>";
  elements.choicesArea.replaceChildren();
  elements.status.textContent = "Please check poem_memorizer/content.json.";
  elements.status.dataset.tone = "wrong";
}

function renderPoem() {
  elements.poemContainer.replaceChildren();
  const byLine = new Map();

  allWords.forEach((word) => {
    if (!byLine.has(word.lineIdx)) {
      byLine.set(word.lineIdx, []);
    }

    byLine.get(word.lineIdx).push(word);
  });

  Array.from(byLine.keys()).sort((a, b) => a - b).forEach((lineIndex) => {
    const lineElement = document.createElement("div");
    lineElement.className = "poem-line";

    byLine.get(lineIndex).forEach((word) => {
      const span = document.createElement("span");
      const hidden = fadedIds.has(word.id) && !solvedIds.has(word.id);
      span.className = `word${hidden ? " faded faded-blank" : ""}`;
      span.id = `word-${word.id}`;
      span.textContent = word.text;
      lineElement.appendChild(span);
    });

    elements.poemContainer.appendChild(lineElement);
  });
}

function shuffle(values) {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function renderChoices(ids) {
  elements.choicesArea.replaceChildren();

  shuffle(ids).forEach((wordId, index) => {
    const word = getWordById(wordId);
    const choice = document.createElement("span");
    choice.className = `choice-word${usedChoiceIds.has(wordId) ? " used" : ""}`;
    choice.textContent = word.text;
    choice.dataset.wid = String(wordId);
    choice.style.animationDelay = `${index * 0.05}s`;
    choice.addEventListener("click", () => onChoiceClick(wordId, choice));
    elements.choicesArea.appendChild(choice);
  });
}

function getWordById(id) {
  return wordById.get(id);
}

function getRoundStatus() {
  const copy = getLanguageConfig();
  const remainingCount = Math.max(expectedOrder.length - clickOrder.length, 0) || fadedIds.size;
  return remainingCount === 1
    ? copy.oneMissingStatus
    : formatTemplate(copy.manyMissingStatus, { count: remainingCount });
}

function setStatus(message, tone = "neutral", sticky = false) {
  clearTimeout(statusTimeout);
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;

  if (!sticky) {
    statusTimeout = window.setTimeout(() => {
      elements.status.textContent = getRoundStatus();
      elements.status.dataset.tone = "neutral";
    }, 1100);
  }
}

function pulseChoice(element, className, duration = 450) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
}

function startTimer(seconds, onDone) {
  elements.timer.style.display = "block";
  elements.timerValue.textContent = String(seconds);
  elements.timer.classList.remove("timer-urgent");

  let remaining = seconds;

  timerInterval = window.setInterval(() => {
    remaining -= 1;
    elements.timerValue.textContent = String(remaining);

    if (remaining <= 3) {
      elements.timer.classList.add("timer-urgent");
    }

    if (remaining <= 0) {
      clearInterval(timerInterval);
      elements.timer.style.display = "none";
      onDone();
    }
  }, 1000);
}

function readPhase(onDone) {
  const copy = getLanguageConfig();

  gameActive = false;
  solvedIds.clear();
  usedChoiceIds.clear();
  clickOrder = [];
  elements.choicesArea.replaceChildren();
  setStatus(copy.readingStatus, "neutral", true);
  elements.timer.style.display = "none";

  const backup = new Set(fadedIds);
  fadedIds.clear();
  renderPoem();
  fadedIds = backup;

  startTimer(10, onDone);
}

function getMaskCountForRound(roundNumber) {
  const index = Math.min(Math.max(roundNumber - 1, 0), gameContent.maskProgression.length - 1);
  return gameContent.maskProgression[index];
}

function startNextRound() {
  const available = allWords.filter((word) => !fadedIds.has(word.id));

  if (!available.length) {
    showWin();
    return;
  }

  round += 1;

  shuffle(available)
    .slice(0, Math.min(getMaskCountForRound(round), available.length))
    .forEach((word) => fadedIds.add(word.id));

  savedFadedIds = new Set(fadedIds);
  savedRound = round;
  launchRound();
}

function launchRound() {
  gameActive = true;
  clickOrder = [];
  solvedIds.clear();
  usedChoiceIds.clear();

  elements.roundBadge.style.opacity = "1";
  elements.roundNum.textContent = String(round);

  expectedOrder = [...fadedIds].sort((left, right) => left - right);

  renderPoem();
  renderChoices(expectedOrder);
  setStatus(getRoundStatus(), "neutral", true);
}

function onChoiceClick(wordId, element) {
  if (!gameActive) {
    return;
  }

  const copy = getLanguageConfig();
  const expectedId = expectedOrder[clickOrder.length];
  const choiceWord = getWordById(wordId);
  const expectedWord = getWordById(expectedId);

  if (usedChoiceIds.has(wordId)) {
    pulseChoice(element, "already-used");
    setStatus(copy.usedWordStatus, "used");
    return;
  }

  const poemWordElement = document.getElementById(`word-${expectedId}`);

  if (choiceWord.text === expectedWord.text) {
    usedChoiceIds.add(wordId);
    clickOrder.push(expectedId);
    solvedIds.add(expectedId);
    element.classList.add("used", "correct");
    window.setTimeout(() => element.classList.remove("correct"), 600);

    if (poemWordElement) {
      poemWordElement.classList.remove("faded", "faded-blank");
      poemWordElement.classList.add("correct-flash");
      window.setTimeout(() => poemWordElement.classList.remove("correct-flash"), 600);
    }

    if (clickOrder.length === expectedOrder.length) {
      gameActive = false;
      setStatus(copy.perfectStatus, "correct", true);

      if (fadedIds.size === allWords.length) {
        window.setTimeout(showWin, 800);
      } else {
        window.setTimeout(startNextRound, 900);
      }
    } else {
      setStatus(copy.correctStatus, "correct");
    }
  } else {
    pulseChoice(element, "wrong");
    setStatus(copy.wrongStatus, "wrong", true);

    if (poemWordElement) {
      poemWordElement.classList.add("wrong-flash");
      window.setTimeout(() => poemWordElement.classList.remove("wrong-flash"), 600);
    }

    gameActive = false;
    elements.failMessage.textContent = formatTemplate(copy.failMessage, {
      chosen: choiceWord.text,
      expected: expectedWord.text
    });
    window.setTimeout(showFail, 700);
  }
}

function hideOverlays() {
  elements.overlayWin.classList.remove("active");
  elements.overlayFail.classList.remove("active");
}

function showWin() {
  gameActive = false;
  elements.overlayWin.classList.add("active");
}

function showFail() {
  elements.overlayFail.classList.add("active");
}

function retryRound() {
  hideOverlays();
  clearInterval(timerInterval);

  fadedIds = new Set(savedFadedIds);
  round = savedRound;

  readPhase(launchRound);
}

function fullRestart() {
  hideOverlays();
  clearInterval(timerInterval);
  clearTimeout(statusTimeout);
  elements.failMessage.textContent = getLanguageConfig().failFallback;

  fadedIds.clear();
  savedFadedIds.clear();
  solvedIds.clear();
  usedChoiceIds.clear();
  round = 0;
  savedRound = 0;
  elements.roundBadge.style.opacity = "0";

  buildWords();
  readPhase(startNextRound);
}

function selectPoemForLanguage(language = currentLanguage) {
  currentPoem = pickDailyPoem(getPoemsForLanguage(language));
  poemLines = [...currentPoem.lines];
  renderPoemMeta();
}

function setLanguage(language) {
  if (!getLanguages()[language] || language === currentLanguage) {
    return;
  }

  currentLanguage = language;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  updateLocalizedCopy();
  selectPoemForLanguage(language);
  fullRestart();
}

async function initializeGame() {
  try {
    gameContent = await loadGameContent();
    currentLanguage = resolveInitialLanguage();
    renderLanguageButtons();
    updateLocalizedCopy();
    setStatus(getLanguageConfig().loadingStatus, "neutral", true);
    selectPoemForLanguage(currentLanguage);
    fullRestart();
  } catch (error) {
    showLoadError(error);
  }
}

initializeGame();
