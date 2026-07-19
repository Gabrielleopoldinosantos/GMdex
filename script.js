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
  getDoc,
  updateDoc,
  deleteDoc
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
// CLOUDINARY — upload de imagem/vídeo (grátis, sem servidor)
// ---------------------------------------------------------
const CLOUDINARY_CLOUD_NAME = "h7alwq39";
const CLOUDINARY_UPLOAD_PRESET = "sanatorio_unsigned";
const MAX_FILES = 4;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB por arquivo

// Upload via XMLHttpRequest (em vez de fetch) porque só o XHR dispara
// evento de progresso real durante o envio do arquivo.
function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const isVideo = file.type.startsWith("video/");
    const resourceType = isVideo ? "video" : "image";
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ url: data.secure_url, type: resourceType });
        } catch (err) {
          reject(new Error("Resposta inválida da Cloudinary."));
        }
      } else {
        reject(new Error(`Cloudinary upload falhou: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Erro de rede durante o upload."));

    xhr.send(formData);
  });
}

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
// mediaItems (array de {url, type}, até 4, opcional), createdAt (timestamp)
//
// Posts antigos ainda podem ter só mediaUrl + mediaType (formato de mídia única);
// o renderCard trata os dois formatos.

const grid = document.getElementById("posts-grid");
const emptyMsg = document.getElementById("posts-empty");
const postCountEl = document.getElementById("post-count");
const loadMoreBtn = document.getElementById("load-more-btn");
const categoryTabs = document.querySelectorAll("#category-tabs .status-tab");
const postSearchInput = document.getElementById("post-search");

const PAGE_SIZE = 9;
let allPosts = [];        // cache local, sempre em ordem desc (mais nova primeiro)
let currentTagFilter = "todas";
let searchTerm = "";
let visibleCount = PAGE_SIZE;

function formatDate(timestamp) {
  if (!timestamp) return "";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function getMediaItems(post) {
  if (post.mediaItems && post.mediaItems.length) return post.mediaItems;
  if (post.mediaUrl) return [{ url: post.mediaUrl, type: post.mediaType || "image" }];
  return [];
}

function renderCard(post) {
  const card = document.createElement("div");
  card.className = "card";

  const items = getMediaItems(post).slice(0, 4);

  let mediaHtml = "";
  if (items.length) {
    const cells = items.map((item, idx) =>
      item.type === "video"
        ? `<video src="${item.url}" data-media-idx="${idx}" playsinline muted></video>`
        : `<img src="${item.url}" data-media-idx="${idx}" alt="${post.title || ""}">`
    ).join("");
    mediaHtml = `<div class="post-media count-${items.length}">${cells}</div>`;
  }

  const isOwner = auth.currentUser && post.authorUid === auth.currentUser.uid;
  const ownerActionsHtml = isOwner ? `
    <div class="post-actions">
      <button type="button" class="post-action-btn edit" data-action="edit">✎ Editar</button>
      <button type="button" class="post-action-btn delete" data-action="delete">🗑 Excluir</button>
    </div>` : "";

  card.innerHTML = `
    <div class="tape"></div>
    <span class="tag ${post.tag || "role"}">${post.tag || "geral"}</span>
    ${mediaHtml}
    <h3>${post.title || "(sem título)"}</h3>
    <p>${post.text || ""}</p>
    ${ownerActionsHtml}
    <div class="meta">
      <div class="author">
        <div class="avatar" style="background:${post.avatarColor || "var(--accent-mint)"}">${post.authorInitial || "?"}</div>
        ${post.author || "anônimo"}
      </div>
      <span>${formatDate(post.createdAt)}</span>
    </div>
  `;

  // Clique em qualquer mídia do card abre ela em tela cheia (com navegação
  // entre as demais mídias do mesmo post, quando houver mais de uma).
  if (items.length) {
    card.querySelectorAll(".post-media [data-media-idx]").forEach((el) => {
      el.addEventListener("click", () => {
        openLightbox(items, Number(el.dataset.mediaIdx));
      });
    });
  }

  // Editar/excluir — só visível e funcional pra quem publicou o post.
  if (isOwner) {
    card.querySelector('[data-action="edit"]')?.addEventListener("click", () => openEditModal(post));
    card.querySelector('[data-action="delete"]')?.addEventListener("click", () => handleDeletePost(post));
  }

  return card;
}

// ---------------------------------------------------------
// LIGHTBOX — abre a mídia de um post em tela cheia
// ---------------------------------------------------------
const lightbox = document.getElementById("lightbox");
const lightboxMedia = document.getElementById("lightbox-media");
const lightboxClose = document.getElementById("lightbox-close");
const lightboxPrev = document.getElementById("lightbox-prev");
const lightboxNext = document.getElementById("lightbox-next");
const lightboxCounter = document.getElementById("lightbox-counter");

let lightboxItems = [];
let lightboxIndex = 0;

function renderLightboxMedia() {
  const item = lightboxItems[lightboxIndex];
  if (!item) return;
  lightboxMedia.innerHTML = item.type === "video"
    ? `<video src="${item.url}" controls playsinline autoplay></video>`
    : `<img src="${item.url}" alt="">`;

  const multiple = lightboxItems.length > 1;
  lightboxPrev.style.display = multiple ? "" : "none";
  lightboxNext.style.display = multiple ? "" : "none";
  lightboxCounter.textContent = multiple ? `${lightboxIndex + 1} / ${lightboxItems.length}` : "";
}

function openLightbox(items, startIndex) {
  if (!items || !items.length) return;
  lightboxItems = items;
  lightboxIndex = startIndex || 0;
  renderLightboxMedia();
  lightbox.classList.remove("hidden");
}

function closeLightbox() {
  lightbox.classList.add("hidden");
  lightboxMedia.innerHTML = "";
  lightboxItems = [];
}

function showPrevMedia() {
  lightboxIndex = (lightboxIndex - 1 + lightboxItems.length) % lightboxItems.length;
  renderLightboxMedia();
}

function showNextMedia() {
  lightboxIndex = (lightboxIndex + 1) % lightboxItems.length;
  renderLightboxMedia();
}

lightboxClose.addEventListener("click", closeLightbox);
lightboxPrev.addEventListener("click", showPrevMedia);
lightboxNext.addEventListener("click", showNextMedia);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (lightbox.classList.contains("hidden")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") showPrevMedia();
  if (e.key === "ArrowRight") showNextMedia();
});

// ---------------------------------------------------------
// FILTRO DE CATEGORIA (abas)
// ---------------------------------------------------------
categoryTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentTagFilter = tab.dataset.tag;
    visibleCount = PAGE_SIZE; // volta pro início ao trocar de categoria
    categoryTabs.forEach((t) => t.classList.toggle("active", t === tab));
    renderPosts();
  });
});

// ---------------------------------------------------------
// PESQUISA — filtra por título ou texto do post
// ---------------------------------------------------------
let searchDebounce = null;
postSearchInput?.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchTerm = postSearchInput.value.trim().toLowerCase();
    visibleCount = PAGE_SIZE; // volta pro início a cada nova pesquisa
    renderPosts();
  }, 200);
});

function getFilteredPosts() {
  let filtered = currentTagFilter === "todas"
    ? allPosts
    : allPosts.filter((p) => p.tag === currentTagFilter);

  if (searchTerm) {
    filtered = filtered.filter((p) => {
      const haystack = `${p.title || ""} ${p.text || ""}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }

  return filtered;
}

function renderPosts() {
  const filtered = getFilteredPosts();

  grid.innerHTML = "";

  if (filtered.length === 0) {
    emptyMsg.textContent = searchTerm
      ? "Nenhum post bate com essa pesquisa."
      : "Nenhum post ainda. Seja o primeiro a postar ali embaixo 👇";
    emptyMsg.style.display = "block";
    loadMoreBtn.classList.add("hidden");
    postCountEl.textContent = "";
    return;
  }

  emptyMsg.style.display = "none";

  const toShow = filtered.slice(0, visibleCount);
  toShow.forEach((post) => grid.appendChild(renderCard(post)));

  postCountEl.textContent = `mostrando ${toShow.length} de ${filtered.length}`;
  loadMoreBtn.classList.toggle("hidden", visibleCount >= filtered.length);
}

loadMoreBtn.addEventListener("click", () => {
  visibleCount += PAGE_SIZE;
  renderPosts();
});

async function loadPosts() {
  try {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    allPosts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    visibleCount = PAGE_SIZE;
    renderPosts();
  } catch (err) {
    console.error("Erro ao carregar posts:", err);
    emptyMsg.textContent = "Não deu pra carregar os posts agora. Confere as regras do Firestore.";
    emptyMsg.style.display = "block";
  }
}

// Só chama loadPosts() depois do login (feito dentro do onAuthStateChanged acima).

// ---------------------------------------------------------
// EDITAR / EXCLUIR POST — só liberado pra quem publicou (authorUid)
// ---------------------------------------------------------
const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editFormStatus = document.getElementById("edit-form-status");
const editModalClose = document.getElementById("edit-modal-close");

let editingPost = null;

function openEditModal(post) {
  editingPost = post;
  editFormStatus.textContent = "";
  editForm.title.value = post.title || "";
  editForm.text.value = post.text || "";
  editForm.tag.value = post.tag || "role";
  editModal.classList.remove("hidden");
}

function closeEditModal() {
  editModal.classList.add("hidden");
  editingPost = null;
}

editModalClose.addEventListener("click", closeEditModal);
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) closeEditModal();
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingPost) return;

  const user = auth.currentUser;
  if (!user || editingPost.authorUid !== user.uid) {
    editFormStatus.textContent = "Você só pode editar seus próprios posts.";
    return;
  }

  const title = editForm.title.value.trim();
  const text = editForm.text.value.trim();
  const tag = editForm.tag.value;

  if (!title || !text) {
    editFormStatus.textContent = "Preenche pelo menos título e texto.";
    return;
  }

  editFormStatus.textContent = "Salvando...";

  try {
    await updateDoc(doc(db, "posts", editingPost.id), { title, text, tag });
    editFormStatus.textContent = "Post atualizado! ✎";
    closeEditModal();
    loadPosts();
  } catch (err) {
    console.error("Erro ao editar post:", err);
    editFormStatus.textContent = "Deu ruim ao salvar. Olha o console pra detalhes.";
  }
});

async function handleDeletePost(post) {
  const user = auth.currentUser;
  if (!user || post.authorUid !== user.uid) return;

  const confirmed = confirm(`Excluir o post "${post.title || "(sem título)"}"? Essa ação não pode ser desfeita.`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "posts", post.id));
    loadPosts();
  } catch (err) {
    console.error("Erro ao excluir post:", err);
    alert("Deu ruim ao excluir o post. Olha o console pra detalhes.");
  }
}

// ---------------------------------------------------------
// FORMULARIO — criar novo post (até 4 mídias, com progresso de upload)
// ---------------------------------------------------------
const statusEl = document.getElementById("form-status");
const progressWrap = document.getElementById("upload-progress");
const progressBar = document.getElementById("upload-progress-bar");

function setProgress(fraction) {
  progressBar.style.width = `${Math.round(fraction * 100)}%`;
}

if (newPostForm) {
  newPostForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
      statusEl.textContent = "Faça login pra postar.";
      return;
    }

    const title = newPostForm.title.value.trim();
    const text = newPostForm.text.value.trim();
    const tag = newPostForm.tag.value;
    const author = user.displayName || user.email || "anônimo";
    const files = Array.from(newPostForm.image.files);

    if (!title || !text) {
      statusEl.textContent = "Preenche pelo menos título e texto.";
      return;
    }

    // Validações client-side, antes de gastar tempo/banda com upload
    if (files.length > MAX_FILES) {
      statusEl.textContent = `Máximo de ${MAX_FILES} arquivos por post. Você selecionou ${files.length}.`;
      return;
    }

    const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      const sizeMb = (oversized.size / (1024 * 1024)).toFixed(1);
      statusEl.textContent = `"${oversized.name}" tem ${sizeMb}MB — o limite é 20MB por arquivo.`;
      return;
    }

    try {
      const mediaItems = [];

      if (files.length) {
        progressWrap.style.display = "block";
        setProgress(0);

        for (let idx = 0; idx < files.length; idx++) {
          statusEl.textContent = `Enviando mídia ${idx + 1} de ${files.length}...`;
          const uploaded = await uploadToCloudinary(files[idx], (fraction) => {
            const overall = (idx + fraction) / files.length;
            setProgress(overall);
          });
          mediaItems.push(uploaded);
        }

        setProgress(1);
      }

      statusEl.textContent = "Publicando...";

      await addDoc(collection(db, "posts"), {
        title,
        text,
        tag,
        author,
        authorUid: user.uid,
        authorInitial: author.charAt(0).toUpperCase(),
        avatarColor: "var(--accent-mint)",
        mediaItems,
        createdAt: serverTimestamp()
      });

      statusEl.textContent = "Postado! 🎉";
      newPostForm.reset();
      progressWrap.style.display = "none";
      setProgress(0);
      loadPosts();
    } catch (err) {
      console.error("Erro ao publicar post:", err);
      statusEl.textContent = "Deu ruim ao publicar. Olha o console pra detalhes.";
      progressWrap.style.display = "none";
      setProgress(0);
    }
  });
}