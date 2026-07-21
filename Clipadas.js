// ---------------------------------------------------------
// FIREBASE — mesma conexão do "gm-dex"
// ---------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDlf8DbGIuegwk5eKrBe_u9Vsv3cOU4tT4",
  authDomain: "gm-dex.firebaseapp.com",
  projectId: "gm-dex",
  storageBucket: "gm-dex.firebasestorage.app",
  messagingSenderId: "897425303504",
  appId: "1:897425303504:web:ea03b197c9c07bb7f3fbd5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ---------------------------------------------------------
// SEGURANÇA — nunca confiar em texto vindo do Firestore ao montar HTML,
// senão uma clipada com <img onerror="..."> rodaria script no navegador
// de quem visitar a página (XSS armazenado).
// ---------------------------------------------------------
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------
// LISTA DE AUTORES — chave interna + nome exibido
// (ordem alfabética, "Recentes" é tratado à parte e vem primeiro)
// ---------------------------------------------------------
const AUTHORS = [
  { key: "victoria julya", label: "Victoria Julya" },
  { key: "menezes gabriel", label: "Menezes Gabriel" },
  { key: "kaua johnny", label: "Kauã Johnny" },
  { key: "leopoldino gabriel", label: "Leopoldino Gabriel" },
  { key: "souza levi", label: "Souza Levi" },
  { key: "pecin, joão", label: "Pecin João" },
  { key: "antunes vitor", label: "Antunes Vitor" },
  { key: "heloisa maria", label: "Heloisa Maria" },
  { key: "coisax", label: "Coisax" },
  { key: "seu wilson", label: "Seu Wilson" },
  { key: "natalia vice diretora", label: "Natália Vice Diretora" },
  { key: "rogerio", label: "Rogerio" },
  { key: "loucao", label: "Loucão" },
  { key: "vinicao", label: "Vinição" },
  { key: "baldin ryan", label: "Baldin Ryan" },
  { key: "luciana", label: "Luciana" },
  { key: "primo do pecin", label: "Primo do Pecin" },
];

let currentFilter = "recentes";   // filtro de autor
let currentYearFilter = "todos";  // filtro de ano
let canPost = false;
let allClips = []; // cache local, sempre em ordem desc (mais nova primeiro), com .number já calculado
let lastRandomIndex = -1;

// ---------------------------------------------------------
// ELEMENTOS DE AUTENTICAÇÃO / GATE DE ACESSO
// ---------------------------------------------------------
const lockedScreen = document.getElementById("locked-screen");
const appContent = document.getElementById("app-content");
const loginBtn = document.getElementById("login-btn");
const loginBtn2 = document.getElementById("login-btn-2");
const logoutBtn = document.getElementById("logout-btn");
const userBox = document.getElementById("user-box");
const userNameEl = document.getElementById("user-name");
const userAvatarEl = document.getElementById("user-avatar");
const accessDeniedMsg = document.getElementById("access-denied-msg");

async function doLogin() {
  accessDeniedMsg.style.display = "none";
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("[clipadas] Erro no login:", err.code, err.message);
    accessDeniedMsg.textContent = "Não deu pra logar (" + err.code + "). Olha o console pra detalhes.";
    accessDeniedMsg.style.display = "block";
  }
}

loginBtn?.addEventListener("click", doLogin);
loginBtn2?.addEventListener("click", doLogin);
logoutBtn?.addEventListener("click", () => signOut(auth));

async function checkCanPost(uid) {
  try {
    const snap = await getDoc(doc(db, "authorized_posters", uid));
    return snap.exists();
  } catch (err) {
    console.error("Erro ao checar permissão de post:", err);
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    lockedScreen.style.display = "none";
    appContent.classList.remove("hidden");
    loginBtn.style.display = "none";
    userBox.style.display = "flex";
    userNameEl.textContent = user.displayName || user.email || "sem nome";
    userAvatarEl.src = user.photoURL || "";

    canPost = await checkCanPost(user.uid);
    addClipBtn.classList.toggle("hidden", !canPost);

    loadClipadas();
  } else {
    lockedScreen.style.display = "flex";
    appContent.classList.add("hidden");
    loginBtn.style.display = "";
    userBox.style.display = "none";
  }
});

// ---------------------------------------------------------
// DROPDOWN DE FILTRO — AUTOR
// ---------------------------------------------------------
const filterBtn = document.getElementById("filter-btn");
const filterLabel = document.getElementById("filter-label");
const filterList = document.getElementById("filter-list");
const addClipBtn = document.getElementById("add-clip-btn");

function buildFilterList() {
  const items = [{ key: "recentes", label: "Recentes" }, ...AUTHORS];
  filterList.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.label;
    li.dataset.key = item.key;
    li.setAttribute("role", "option");
    if (item.key === currentFilter) li.classList.add("active");
    li.addEventListener("click", () => selectFilter(item.key, item.label));
    filterList.appendChild(li);
  });
}

function selectFilter(key, label) {
  currentFilter = key;
  filterLabel.textContent = label;
  filterList.classList.add("hidden");
  filterBtn.setAttribute("aria-expanded", "false");
  [...filterList.children].forEach((li) => li.classList.toggle("active", li.dataset.key === key));
  renderClipadas();
}

filterBtn.addEventListener("click", () => {
  const isOpen = !filterList.classList.contains("hidden");
  filterList.classList.toggle("hidden", isOpen);
  filterBtn.setAttribute("aria-expanded", String(!isOpen));
});

buildFilterList();

// ---------------------------------------------------------
// DROPDOWN DE FILTRO — ANO
// (as opções são montadas a partir dos anos que existem nas clipadas)
// ---------------------------------------------------------
const yearFilterBtn = document.getElementById("year-filter-btn");
const yearFilterLabel = document.getElementById("year-filter-label");
const yearFilterList = document.getElementById("year-filter-list");

function buildYearFilterList() {
  const years = [...new Set(allClips.map((c) => c.year).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a)); // mais recente primeiro

  const items = [{ key: "todos", label: "Todos os anos" }, ...years.map((y) => ({ key: y, label: y }))];

  yearFilterList.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.label;
    li.dataset.key = item.key;
    li.setAttribute("role", "option");
    if (item.key === currentYearFilter) li.classList.add("active");
    li.addEventListener("click", () => selectYearFilter(item.key, item.label));
    yearFilterList.appendChild(li);
  });
}

function selectYearFilter(key, label) {
  currentYearFilter = key;
  yearFilterLabel.textContent = key === "todos" ? "Ano" : label;
  yearFilterList.classList.add("hidden");
  yearFilterBtn.setAttribute("aria-expanded", "false");
  [...yearFilterList.children].forEach((li) => li.classList.toggle("active", li.dataset.key === key));
  renderClipadas();
}

yearFilterBtn.addEventListener("click", () => {
  const isOpen = !yearFilterList.classList.contains("hidden");
  yearFilterList.classList.toggle("hidden", isOpen);
  yearFilterBtn.setAttribute("aria-expanded", String(!isOpen));
});

// fecha qualquer dropdown aberto ao clicar fora
document.addEventListener("click", (e) => {
  if (!filterBtn.contains(e.target) && !filterList.contains(e.target)) {
    filterList.classList.add("hidden");
    filterBtn.setAttribute("aria-expanded", "false");
  }
  if (!yearFilterBtn.contains(e.target) && !yearFilterList.contains(e.target)) {
    yearFilterList.classList.add("hidden");
    yearFilterBtn.setAttribute("aria-expanded", "false");
  }
});

// ---------------------------------------------------------
// CARREGA E RENDERIZA AS CLIPADAS
// ---------------------------------------------------------
const clipGrid = document.getElementById("clip-grid");
const clipEmpty = document.getElementById("clip-empty");
const clipSearchInput = document.getElementById("clip-search");
let clipSearchTerm = "";

function renderCard(clip) {
  const card = document.createElement("div");
  card.className = "clip-card";
  card.dataset.index = String(clip.number).padStart(3, "0");
  card.innerHTML = `
    <div class="tape"></div>
    <p class="clip-text">${escapeHTML(clip.text || "")}</p>
    <div class="clip-meta">
      <span class="clip-author">${escapeHTML(clip.author || "?")}</span>
      <span class="clip-year">${escapeHTML(clip.year || "")}</span>
    </div>
  `;
  return card;
}

function renderClipadas() {
  let filtered = currentFilter === "recentes"
    ? allClips
    : allClips.filter((c) => c.authorKey === currentFilter);

  if (currentYearFilter !== "todos") {
    filtered = filtered.filter((c) => c.year === currentYearFilter);
  }

  if (clipSearchTerm) {
    filtered = filtered.filter((c) => {
      const haystack = `${c.text || ""} ${c.author || ""}`.toLowerCase();
      return haystack.includes(clipSearchTerm);
    });
  }

  clipGrid.innerHTML = "";
  if (filtered.length === 0) {
    clipEmpty.textContent = clipSearchTerm
      ? "Nenhuma clipada bate com essa pesquisa."
      : "Nenhuma clipada aqui ainda. Bora consertar isso 👇";
    clipEmpty.style.display = "block";
    return;
  }
  clipEmpty.style.display = "none";
  filtered.forEach((clip) => clipGrid.appendChild(renderCard(clip)));
}

// ---------------------------------------------------------
// PESQUISA — filtra por frase ou autor
// ---------------------------------------------------------
let clipSearchDebounce = null;
clipSearchInput?.addEventListener("input", () => {
  clearTimeout(clipSearchDebounce);
  clipSearchDebounce = setTimeout(() => {
    clipSearchTerm = clipSearchInput.value.trim().toLowerCase();
    renderClipadas();
  }, 200);
});

async function loadClipadas() {
  try {
    // Busca sempre da mais nova pra mais velha.
    const q = query(collection(db, "clipadas"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    allClips = snapshot.docs.map((d) => d.data());

    // Numeração cronológica: a mais velha (último item do array, já que
    // está em ordem desc) recebe o #1; a mais nova recebe o número mais alto.
    const total = allClips.length;
    allClips.forEach((clip, i) => {
      clip.number = total - i;
    });

    buildYearFilterList();
    renderClipadas();
  } catch (err) {
    console.error("Erro ao carregar clipadas:", err);
    clipEmpty.textContent = "Não deu pra carregar as clipadas agora. Confere as regras do Firestore.";
    clipEmpty.style.display = "block";
  }
}

// ---------------------------------------------------------
// MODAL — criar nova clipada
// ---------------------------------------------------------
const clipModal = document.getElementById("clip-modal");
const clipForm = document.getElementById("clip-form");
const clipFormStatus = document.getElementById("clip-form-status");
const authorSelectWrap = document.getElementById("author-select-wrap");
const clipAuthorSelect = document.getElementById("clip-author");
const clipModalClose = document.getElementById("clip-modal-close");

AUTHORS.forEach((a) => {
  const opt = document.createElement("option");
  opt.value = a.key;
  opt.textContent = a.label;
  clipAuthorSelect.appendChild(opt);
});

function openModal() {
  if (!canPost) return;
  clipFormStatus.textContent = "";
  clipForm.reset();

  if (currentFilter === "recentes") {
    authorSelectWrap.style.display = "";
  } else {
    authorSelectWrap.style.display = "none";
    clipAuthorSelect.value = currentFilter;
  }

  clipModal.classList.remove("hidden");
}

function closeModal() {
  clipModal.classList.add("hidden");
}

addClipBtn.addEventListener("click", openModal);
clipModalClose.addEventListener("click", closeModal);
clipModal.addEventListener("click", (e) => {
  if (e.target === clipModal) closeModal();
});

clipForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user || !canPost) {
    clipFormStatus.textContent = "Você não tem permissão pra postar clipadas.";
    return;
  }

  const authorKey = currentFilter === "recentes" ? clipAuthorSelect.value : currentFilter;
  const authorMeta = AUTHORS.find((a) => a.key === authorKey);
  const text = clipForm.text.value.trim();
  const year = clipForm.year.value.trim();

  if (!authorMeta || !text || !year) {
    clipFormStatus.textContent = "Preenche todos os campos.";
    return;
  }
  if (text.length > 500) {
    clipFormStatus.textContent = "Texto muito longo (máximo 500 caracteres).";
    return;
  }

  clipFormStatus.textContent = "Publicando...";

  try {
    await addDoc(collection(db, "clipadas"), {
      text,
      year,
      author: authorMeta.label,
      authorKey: authorMeta.key,
      authorUid: user.uid,
      createdAt: serverTimestamp()
    });

    clipFormStatus.textContent = "Clipada registrada! 🎬";
    closeModal();
    loadClipadas();
  } catch (err) {
    console.error("Erro ao publicar clipada:", err);
    clipFormStatus.textContent = "Deu ruim ao publicar. Olha o console pra detalhes.";
  }
});

// ---------------------------------------------------------
// MODAL — clipada aleatória
// ---------------------------------------------------------
const randomBtn = document.getElementById("random-clip-btn");
const randomModal = document.getElementById("random-modal");
const randomCardWrap = document.getElementById("random-card-wrap");
const randomModalClose = document.getElementById("random-modal-close");
const randomAgainBtn = document.getElementById("random-again-btn");

function pickRandomClip() {
  if (allClips.length === 0) return null;
  if (allClips.length === 1) return allClips[0];

  let idx;
  do {
    idx = Math.floor(Math.random() * allClips.length);
  } while (idx === lastRandomIndex);
  lastRandomIndex = idx;
  return allClips[idx];
}

function showRandomClip() {
  const pick = pickRandomClip();
  randomCardWrap.innerHTML = "";

  if (!pick) {
    randomCardWrap.innerHTML = `<p style="color:var(--text-dim); font-size:13.5px;">Ainda não tem nenhuma clipada registrada pra sortear.</p>`;
  } else {
    randomCardWrap.appendChild(renderCard(pick));
  }

  randomModal.classList.remove("hidden");
}

function closeRandomModal() {
  randomModal.classList.add("hidden");
}

randomBtn.addEventListener("click", showRandomClip);
randomAgainBtn.addEventListener("click", showRandomClip);
randomModalClose.addEventListener("click", closeRandomModal);
randomModal.addEventListener("click", (e) => {
  if (e.target === randomModal) closeRandomModal();
});

// ---------------------------------------------------------
// MINIGAME — "quem disse isso?"
// mostra a frase + o ano, o usuário tenta acertar quem falou,
// com contador de acertos e erros na sessão de jogo.
// ---------------------------------------------------------
const gameBtn = document.getElementById("game-btn");
const gameModal = document.getElementById("game-modal");
const gameCloseBtn = document.getElementById("game-close-btn");
const gameNextBtn = document.getElementById("game-next-btn");
const gameQuoteWrap = document.getElementById("game-quote-wrap");
const gameOptionsEl = document.getElementById("game-options");
const gameFeedbackEl = document.getElementById("game-feedback");
const gameHitsEl = document.getElementById("game-hits");
const gameMissesEl = document.getElementById("game-misses");

let gameHits = 0;
let gameMisses = 0;
let gameCurrentClip = null;
let gameAnswered = false;
let gameQueue = []; // fila embaralhada, garante que nenhuma clipada se repete até o fim de um ciclo

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Autores únicos presentes nas clipadas já carregadas (não a lista fixa
// AUTHORS inteira), assim as opções erradas fazem sentido pro que existe.
function getUniqueClipAuthors() {
  const map = new Map();
  allClips.forEach((c) => {
    if (c.authorKey && !map.has(c.authorKey)) map.set(c.authorKey, c.author);
  });
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}

// Monta (ou remonta) a fila embaralhada com todas as clipadas atuais.
// Chamada no início do jogo e sempre que a fila esvazia — assim toda
// clipada aparece exatamente uma vez antes de qualquer uma repetir.
function buildGameQueue() {
  gameQueue = shuffleArray(allClips);
}

function pickGameClip() {
  if (allClips.length === 0) return null;
  if (gameQueue.length === 0) buildGameQueue();
  return gameQueue.shift();
}

function startNewQuestion() {
  const uniqueAuthors = getUniqueClipAuthors();

  if (uniqueAuthors.length < 2) {
    gameQuoteWrap.innerHTML = `<p style="color:var(--text-dim); font-size:13.5px;">Precisa de clipadas de pelo menos 2 pessoas diferentes pra jogar.</p>`;
    gameOptionsEl.innerHTML = "";
    gameFeedbackEl.textContent = "";
    gameFeedbackEl.className = "game-feedback";
    gameNextBtn.classList.add("hidden");
    return;
  }

  gameCurrentClip = pickGameClip();
  gameAnswered = false;
  gameFeedbackEl.textContent = "";
  gameFeedbackEl.className = "game-feedback";
  gameNextBtn.classList.add("hidden");

  gameQuoteWrap.innerHTML = `
    <div class="game-quote">
      <p class="game-quote-text">${escapeHTML(gameCurrentClip.text || "")}</p>
      <span class="game-quote-year">registrado em ${escapeHTML(gameCurrentClip.year || "?")}</span>
    </div>
  `;

  // opções: o autor certo + até 4 errados, sorteados entre quem mais tem clipada
  const correctKey = gameCurrentClip.authorKey;
  const wrongPool = uniqueAuthors.filter((a) => a.key !== correctKey);
  const wrongOptions = shuffleArray(wrongPool).slice(0, 4);
  const correctOption = { key: correctKey, label: gameCurrentClip.author };
  const options = shuffleArray([correctOption, ...wrongOptions]);

  gameOptionsEl.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-option-btn";
    btn.textContent = opt.label;
    btn.dataset.key = opt.key;
    btn.addEventListener("click", () => answerQuestion(opt.key, correctKey, btn));
    gameOptionsEl.appendChild(btn);
  });
}

function answerQuestion(chosenKey, correctKey, btnEl) {
  if (gameAnswered) return;
  gameAnswered = true;

  const isCorrect = chosenKey === correctKey;
  if (isCorrect) {
    gameHits++;
    btnEl.classList.add("correct");
    gameFeedbackEl.textContent = "Acertou! 🎯";
    gameFeedbackEl.className = "game-feedback hit";
  } else {
    gameMisses++;
    btnEl.classList.add("wrong");
    gameFeedbackEl.textContent = `Errou! Era ${gameCurrentClip.author}.`;
    gameFeedbackEl.className = "game-feedback miss";
  }

  gameHitsEl.textContent = `✓ ${gameHits}`;
  gameMissesEl.textContent = `✗ ${gameMisses}`;

  [...gameOptionsEl.children].forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.key === correctKey) btn.classList.add("correct");
  });

  gameNextBtn.classList.remove("hidden");
}

function openGameModal() {
  gameHits = 0;
  gameMisses = 0;
  gameCurrentClip = null;
  gameHitsEl.textContent = "✓ 0";
  gameMissesEl.textContent = "✗ 0";
  buildGameQueue();
  gameModal.classList.remove("hidden");
  startNewQuestion();
}

function closeGameModal() {
  gameModal.classList.add("hidden");
}

gameBtn.addEventListener("click", openGameModal);
gameNextBtn.addEventListener("click", startNewQuestion);
gameCloseBtn.addEventListener("click", closeGameModal);
gameModal.addEventListener("click", (e) => {
  if (e.target === gameModal) closeGameModal();
});

// Esc fecha o modal (jogo, sorteio ou criação) que estiver aberto no momento
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!gameModal.classList.contains("hidden")) closeGameModal();
  else if (!randomModal.classList.contains("hidden")) closeRandomModal();
  else if (!clipModal.classList.contains("hidden")) closeModal();
});