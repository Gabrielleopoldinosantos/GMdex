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
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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

// Esta página é aberta pra todo mundo: sem login, sem checagem de permissão.
// Qualquer visitante pode ver e sugerir ideias direto.

const TAGS = [
  { key: "jogos", label: "jogos" },
  { key: "receita", label: "receita" },
  { key: "filme", label: "filme" },
  { key: "role", label: "rolê" },
  { key: "outro", label: "outro" }
];

let currentFilter = "todas";
let allIdeas = []; // cache local, cada item já tem seu id do doc

// ---------------------------------------------------------
// VOTOS — guardados no navegador, pra não deixar votar 2x na mesma ideia
// (não exige login, é só um controle local simples)
// ---------------------------------------------------------
const VOTED_KEY = "gm_canetada_votadas";

function getVotedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(VOTED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function markVoted(id) {
  const voted = getVotedIds();
  voted.add(id);
  localStorage.setItem(VOTED_KEY, JSON.stringify([...voted]));
}

// ---------------------------------------------------------
// DROPDOWN DE FILTRO
// ---------------------------------------------------------
const filterBtn = document.getElementById("filter-btn");
const filterLabel = document.getElementById("filter-label");
const filterList = document.getElementById("filter-list");
const addIdeaBtn = document.getElementById("add-idea-btn");

function buildFilterList() {
  const items = [{ key: "todas", label: "Todas" }, ...TAGS];
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
  renderIdeas();
}

filterBtn.addEventListener("click", () => {
  const isOpen = !filterList.classList.contains("hidden");
  filterList.classList.toggle("hidden", isOpen);
  filterBtn.setAttribute("aria-expanded", String(!isOpen));
});

document.addEventListener("click", (e) => {
  if (!filterBtn.contains(e.target) && !filterList.contains(e.target)) {
    filterList.classList.add("hidden");
    filterBtn.setAttribute("aria-expanded", "false");
  }
});

buildFilterList();

// ---------------------------------------------------------
// CARREGA E RENDERIZA AS IDEIAS
// ---------------------------------------------------------
const ideaGrid = document.getElementById("idea-grid");
const ideaEmpty = document.getElementById("idea-empty");

function renderCard(idea) {
  const votedIds = getVotedIds();
  const alreadyVoted = votedIds.has(idea.id);

  const card = document.createElement("div");
  card.className = "idea-card";
  card.innerHTML = `
    <div class="tape"></div>
    <span class="tag ${idea.tag || "outro"}">${idea.tag || "outro"}</span>
    <h3>${idea.title || "(sem título)"}</h3>
    <p class="idea-body">${idea.text || ""}</p>
    <div class="idea-meta">
      <span class="idea-author">${idea.author || "anônimo"}</span>
      <button class="vote-btn ${alreadyVoted ? "voted" : ""}" data-id="${idea.id}">
        <span class="pen">🖋️</span> ${idea.votes || 0}
      </button>
    </div>
  `;

  const voteBtn = card.querySelector(".vote-btn");
  voteBtn.addEventListener("click", () => handleVote(idea.id, voteBtn));

  return card;
}

async function handleVote(id, btn) {
  const votedIds = getVotedIds();
  if (votedIds.has(id)) return; // já votou nessa

  btn.disabled = true;
  try {
    await updateDoc(doc(db, "ideias", id), { votes: increment(1) });
    markVoted(id);

    const idea = allIdeas.find((i) => i.id === id);
    if (idea) idea.votes = (idea.votes || 0) + 1;

    btn.classList.add("voted");
    btn.innerHTML = `<span class="pen">🖋️</span> ${idea ? idea.votes : ""}`;
  } catch (err) {
    console.error("Erro ao votar:", err);
  } finally {
    btn.disabled = false;
  }
}

function renderIdeas() {
  const filtered = currentFilter === "todas"
    ? allIdeas
    : allIdeas.filter((i) => i.tag === currentFilter);

  // ordena por votos (mais votadas primeiro), depois por data
  const sorted = [...filtered].sort((a, b) => (b.votes || 0) - (a.votes || 0));

  ideaGrid.innerHTML = "";
  if (sorted.length === 0) {
    ideaEmpty.style.display = "block";
    return;
  }
  ideaEmpty.style.display = "none";
  sorted.forEach((idea) => ideaGrid.appendChild(renderCard(idea)));
}

async function loadIdeas() {
  try {
    const q = query(collection(db, "ideias"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    allIdeas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderIdeas();
  } catch (err) {
    console.error("Erro ao carregar ideias:", err);
    ideaEmpty.textContent = "Não deu pra carregar as ideias agora. Confere as regras do Firestore.";
    ideaEmpty.style.display = "block";
  }
}

loadIdeas();

// ---------------------------------------------------------
// MODAL — sugerir nova ideia (aberto pra qualquer visitante)
// ---------------------------------------------------------
const ideaModal = document.getElementById("idea-modal");
const ideaForm = document.getElementById("idea-form");
const ideaFormStatus = document.getElementById("idea-form-status");
const ideaModalClose = document.getElementById("idea-modal-close");

function openModal() {
  ideaFormStatus.textContent = "";
  ideaForm.reset();
  ideaModal.classList.remove("hidden");
}

function closeModal() {
  ideaModal.classList.add("hidden");
}

addIdeaBtn.addEventListener("click", openModal);
ideaModalClose.addEventListener("click", closeModal);
ideaModal.addEventListener("click", (e) => {
  if (e.target === ideaModal) closeModal();
});

ideaForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = ideaForm.title.value.trim();
  const text = ideaForm.text.value.trim();
  const tag = ideaForm.tag.value;
  const author = ideaForm.author.value.trim();

  if (!title || !text) {
    ideaFormStatus.textContent = "Preenche pelo menos título e ideia.";
    return;
  }

  ideaFormStatus.textContent = "Canetando...";

  try {
    await addDoc(collection(db, "ideias"), {
      title,
      text,
      tag,
      author: author || "anônimo",
      votes: 0,
      createdAt: serverTimestamp()
    });

    ideaFormStatus.textContent = "Ideia registrada! ✍️";
    closeModal();
    loadIdeas();
  } catch (err) {
    console.error("Erro ao publicar ideia:", err);
    ideaFormStatus.textContent = "Deu ruim ao publicar. Olha o console pra detalhes.";
  }
});