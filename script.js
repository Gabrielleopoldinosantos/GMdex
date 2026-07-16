// ---------------------------------------------------------
// FIREBASE — conexão pro "gm-dex"
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
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
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
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

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
const noPermissionMsg = document.getElementById("no-permission-msg");
const newPostForm = document.getElementById("new-post-form");

async function doLogin() {
  accessDeniedMsg.style.display = "none";
  console.log("[gm-dex] abrindo pop-up de login...");
  try {
    const result = await signInWithPopup(auth, provider);
    console.log("[gm-dex] login via pop-up OK:", result.user.uid);
  } catch (err) {
    console.error("[gm-dex] Erro no login:", err.code, err.message);
    accessDeniedMsg.textContent = "Não deu pra logar (" + err.code + "). Olha o console pra detalhes.";
    accessDeniedMsg.style.display = "block";
  }
}

loginBtn?.addEventListener("click", doLogin);
loginBtn2?.addEventListener("click", doLogin);
logoutBtn?.addEventListener("click", () => signOut(auth));

// Checa na coleção "authorized_posters" (doc ID = UID do usuário) se ele pode postar.
// Quem controla isso é você, direto no console do Firebase > Firestore.
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
  console.log("[gm-dex] onAuthStateChanged disparou. user:", user ? user.uid : null);
  if (user) {
    lockedScreen.style.display = "none";
    appContent.classList.remove("hidden");
    loginBtn.style.display = "none";
    userBox.style.display = "flex";
    userNameEl.textContent = user.displayName || user.email || "sem nome";
    userAvatarEl.src = user.photoURL || "";

    const canPost = await checkCanPost(user.uid);
    newPostForm.style.display = canPost ? "" : "none";
    noPermissionMsg.style.display = canPost ? "none" : "block";

    loadPosts();
  } else {
    lockedScreen.style.display = "flex";
    appContent.classList.add("hidden");
    loginBtn.style.display = "";
    userBox.style.display = "none";
  }
});

// ---------------------------------------------------------
// EFEITO DE DIGITAÇÃO DO HERO
// ---------------------------------------------------------
const phrase = "COMO QUE NOIS TÁ ?... NAAAAA BOSTA !!!";
const typedEl = document.getElementById("typed");
let i = 0;
function type() {
  if (i <= phrase.length) {
    typedEl.textContent = phrase.slice(0, i);
    i++;
    setTimeout(type, 70);
  } else {
    typedEl.style.borderRight = "3px solid transparent";
  }
}
type();

// ---------------------------------------------------------
// RENDERIZA OS "POSTS' (lidos do Firestore, coleção "posts")
// ---------------------------------------------------------
// Cada documento em "posts" deve ter os campos:
// title (string), text (string), tag (string: jogos/receita/filme/role),
// author (string), authorInitial (string), avatarColor (string, ex: "var(--accent-mint)"),
// imageUrl (string, opcional), createdAt (timestamp)

const grid = document.getElementById("posts-grid");
const emptyMsg = document.getElementById("posts-empty");

function formatDate(timestamp) {
  if (!timestamp) return "";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function renderCard(post) {
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <div class="tape"></div>
    <span class="tag ${post.tag || "role"}">${post.tag || "geral"}</span>
    ${post.imageUrl ? `<img class="post-img" src="${post.imageUrl}" alt="${post.title}">` : ""}
    <h3>${post.title || "(sem título)"}</h3>
    <p>${post.text || ""}</p>
    <div class="meta">
      <div class="author">
        <div class="avatar" style="background:${post.avatarColor || "var(--accent-mint)"}">${post.authorInitial || "?"}</div>
        ${post.author || "anônimo"}
      </div>
      <span>${formatDate(post.createdAt)}</span>
    </div>
  `;
  return card;
}

async function loadPosts() {
  try {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      emptyMsg.style.display = "block";
      grid.innerHTML = "";
      return;
    }

    emptyMsg.style.display = "none";
    grid.innerHTML = "";
    snapshot.forEach((doc) => {
      grid.appendChild(renderCard(doc.data()));
    });
  } catch (err) {
    console.error("Erro ao carregar posts:", err);
    emptyMsg.textContent = "Não deu pra carregar os posts agora. Confere as regras do Firestore.";
    emptyMsg.style.display = "block";
  }
}

// Só chama loadPosts() depois do login (feito dentro do onAuthStateChanged acima).

// ---------------------------------------------------------
// FORMULARIO — criar novo post (com upload de imagem opcional)
// ---------------------------------------------------------
const statusEl = document.getElementById("form-status");

if (newPostForm) {
  newPostForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
      statusEl.textContent = "Faça login pra postar.";
      return;
    }

    statusEl.textContent = "Publicando...";

    const title = newPostForm.title.value.trim();
    const text = newPostForm.text.value.trim();
    const tag = newPostForm.tag.value;
    const author = user.displayName || user.email || "anônimo";
    const file = newPostForm.image.files[0];

    if (!title || !text) {
      statusEl.textContent = "Preenche pelo menos título e texto.";
      return;
    }

    try {
      let imageUrl = "";

      // upload da imagem pro Cloud Storage, se tiver sido escolhida
      if (file) {
        const path = `posts/${Date.now()}_${file.name}`;
        const imgRef = ref(storage, path);
        await uploadBytes(imgRef, file);
        imageUrl = await getDownloadURL(imgRef);
      }

      await addDoc(collection(db, "posts"), {
        title,
        text,
        tag,
        author,
        authorUid: user.uid,
        authorInitial: author.charAt(0).toUpperCase(),
        avatarColor: "var(--accent-mint)",
        imageUrl,
        createdAt: serverTimestamp()
      });

      statusEl.textContent = "Postado! 🎉";
      newPostForm.reset();
      loadPosts();
    } catch (err) {
      console.error("Erro ao publicar post:", err);
      statusEl.textContent = "Deu ruim ao publicar. Olha o console pra detalhes.";
    }
  });
}