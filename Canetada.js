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
  getDoc,
  updateDoc
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
// SEGURANÇA — como esta página aceita ideias de QUALQUER pessoa, sem
// exigir login, o cuidado com o texto que entra em innerHTML é ainda
// mais importante aqui do que no resto do site. Nunca confiar em nada
// vindo do Firestore sem escapar primeiro.
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

// Esta página é ABERTA: qualquer um vê a lista e sugere ideia, sem login.
// O login aqui só serve pra liberar os botões de mover status
// (finalizar / recusar / reabrir), restritos a quem está em "authorized_posters".

let currentStatusFilter = "todas";
let canModerate = false;
let allIdeas = [];

// ---------------------------------------------------------
// AUTENTICAÇÃO (opcional, só pra moderação)
// ---------------------------------------------------------
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userBox = document.getElementById("user-box");
const userNameEl = document.getElementById("user-name");
const userAvatarEl = document.getElementById("user-avatar");

async function doLogin() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("[canetada] Erro no login:", err.code, err.message);
  }
}

loginBtn?.addEventListener("click", doLogin);
logoutBtn?.addEventListener("click", () => signOut(auth));

async function checkCanModerate(uid) {
  try {
    const snap = await getDoc(doc(db, "authorized_posters", uid));
    return snap.exists();
  } catch (err) {
    console.error("Erro ao checar permissão de moderação:", err);
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    loginBtn.style.display = "none";
    userBox.style.display = "flex";
    userNameEl.textContent = user.displayName || user.email || "sem nome";
    userAvatarEl.src = user.photoURL || "";
    canModerate = await checkCanModerate(user.uid);
  } else {
    loginBtn.style.display = "";
    userBox.style.display = "none";
    canModerate = false;
  }
  renderIdeas();
});

// ---------------------------------------------------------
// FILTRO DE STATUS (abas)
// ---------------------------------------------------------
const statusTabs = document.querySelectorAll(".status-tab");
statusTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentStatusFilter = tab.dataset.status;
    statusTabs.forEach((t) => t.classList.toggle("active", t === tab));
    renderIdeas();
  });
});

const addIdeaBtn = document.getElementById("add-idea-btn");

// ---------------------------------------------------------
// CARREGA E RENDERIZA A LISTA
// ---------------------------------------------------------
const ideaList = document.getElementById("idea-list");
const ideaEmpty = document.getElementById("idea-empty");

function formatDate(timestamp) {
  if (!timestamp) return "";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function renderRow(idea) {
  const status = idea.status || "pendente";

  const row = document.createElement("div");
  row.className = `task-item status-${status}`;
  row.dataset.id = idea.id;

  const badge = status === "finalizado"
    ? `<span class="status-badge finalizado">finalizada</span>`
    : status === "recusado"
      ? `<span class="status-badge recusado">recusada</span>`
      : "";

  row.innerHTML = `
    <button class="status-dot ${canModerate ? "can-moderate" : ""}" aria-label="mudar status"></button>
    <div class="task-main">
      <div class="task-top">
        <h4 class="task-title">${escapeHTML(idea.title || "(sem título)")}</h4>
        ${badge}
      </div>
      <p class="task-text">${escapeHTML(idea.text || "")}</p>
      <div class="task-meta">
        <span class="task-author">${escapeHTML(idea.author || "anônimo")}</span>
        <span>${formatDate(idea.createdAt)}</span>
      </div>
    </div>
    ${canModerate ? `
    <div class="task-actions">
      <button class="mod-btn finish" data-action="finalizado">✓ Finalizar</button>
      <button class="mod-btn reject" data-action="recusado">✕ Recusar</button>
      ${status !== "pendente" ? `<button class="mod-btn reset" data-action="pendente">↺ Reabrir</button>` : ""}
    </div>` : ""}
  `;

  if (canModerate) {
    const dot = row.querySelector(".status-dot");
    dot.addEventListener("click", () => cycleStatus(idea));
    row.querySelectorAll(".mod-btn").forEach((btn) => {
      btn.addEventListener("click", () => setStatus(idea, btn.dataset.action));
    });
  }

  return row;
}

async function cycleStatus(idea) {
  const order = ["pendente", "finalizado", "recusado"];
  const current = idea.status || "pendente";
  const next = order[(order.indexOf(current) + 1) % order.length];
  await setStatus(idea, next);
}

async function setStatus(idea, newStatus) {
  if (!canModerate) return;
  try {
    await updateDoc(doc(db, "ideias", idea.id), { status: newStatus });
    idea.status = newStatus;
    renderIdeas();
  } catch (err) {
    console.error("Erro ao mudar status:", err);
  }
}

function renderIdeas() {
  let filtered = allIdeas;
  if (currentStatusFilter !== "todas") {
    filtered = filtered.filter((i) => (i.status || "pendente") === currentStatusFilter);
  }

  ideaList.innerHTML = "";
  if (filtered.length === 0) {
    ideaEmpty.style.display = "block";
    return;
  }
  ideaEmpty.style.display = "none";
  filtered.forEach((idea) => ideaList.appendChild(renderRow(idea)));
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
  const author = ideaForm.author.value.trim();

  if (!title || !text) {
    ideaFormStatus.textContent = "Preenche pelo menos título e ideia.";
    return;
  }
  if (title.length > 80) {
    ideaFormStatus.textContent = "Título muito longo (máximo 80 caracteres).";
    return;
  }
  if (text.length > 600) {
    ideaFormStatus.textContent = "Texto muito longo (máximo 600 caracteres).";
    return;
  }
  if (author.length > 30) {
    ideaFormStatus.textContent = "Nome muito longo (máximo 30 caracteres).";
    return;
  }

  ideaFormStatus.textContent = "Canetando...";

  try {
    await addDoc(collection(db, "ideias"), {
      title,
      text,
      author: author || "anônimo",
      status: "pendente",
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