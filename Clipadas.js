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
// LISTA DE AUTORES — chave interna + nome exibido
// (ordem alfabética, "Recentes" é tratado à parte e vem primeiro)
// ---------------------------------------------------------
const AUTHORS = [
  { key: "delta", label: "Delta" },
  { key: "feitzz", label: "Feitzz" },
  { key: "jhonjhon", label: "Jhon Jhon" },
  { key: "leopoldino", label: "Leopoldino" },
  { key: "levizao", label: "Levizão" },
  { key: "ptn", label: "PTN" },
  { key: "vitao", label: "Vitão" }
];

let currentFilter = "recentes"; // chave do filtro ativo
let canPost = false;
let allClips = []; // cache local de tudo que veio do Firestore

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

// Mesma checagem de permissão usada na página principal:
// coleção "authorized_posters" (doc ID = UID do usuário)
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
// DROPDOWN DE FILTRO
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

document.addEventListener("click", (e) => {
  if (!filterBtn.contains(e.target) && !filterList.contains(e.target)) {
    filterList.classList.add("hidden");
    filterBtn.setAttribute("aria-expanded", "false");
  }
});

buildFilterList();

// ---------------------------------------------------------
// CARREGA E RENDERIZA AS CLIPADAS
// ---------------------------------------------------------
const clipGrid = document.getElementById("clip-grid");
const clipEmpty = document.getElementById("clip-empty");

function renderCard(clip, index) {
  const card = document.createElement("div");
  card.className = "clip-card";
  card.dataset.index = String(index + 1).padStart(3, "0");
  card.innerHTML = `
    <div class="tape"></div>
    <p class="clip-text">${clip.text || ""}</p>
    <div class="clip-meta">
      <span class="clip-author">${clip.author || "?"}</span>
      <span class="clip-year">${clip.year || ""}</span>
    </div>
  `;
  return card;
}

function renderClipadas() {
  const filtered = currentFilter === "recentes"
    ? allClips
    : allClips.filter((c) => c.authorKey === currentFilter);

  clipGrid.innerHTML = "";
  if (filtered.length === 0) {
    clipEmpty.style.display = "block";
    return;
  }
  clipEmpty.style.display = "none";
  filtered.forEach((clip, i) => clipGrid.appendChild(renderCard(clip, i)));
}

async function loadClipadas() {
  try {
    // Só um orderBy (sem where), então não precisa de índice composto no Firestore.
    // O filtro por autor é feito no cliente em renderClipadas().
    const q = query(collection(db, "clipadas"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    allClips = snapshot.docs.map((d) => d.data());
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

  // Se um autor específico já está selecionado no filtro, trava nele.
  // Só em "Recentes" o usuário escolhe de quem é a clipada.
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