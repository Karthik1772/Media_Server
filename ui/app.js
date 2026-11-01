(() => {
  const D = JSON.parse(document.getElementById("data").textContent);
  const $ = (s) => document.querySelector(s);

  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };

  const nat = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  const fmtSize = (n) => {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;

    while (n >= 1024 && i < 4) {
      n /= 1024;
      i++;
    }

    return (i ? n.toFixed(1) : n) + " " + units[i];
  };

  const fmtDate = (t) =>
    new Date(t * 1000).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const fmtTime = (s) => {
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const x = s % 60;

    return (
      (h ? h + ":" + String(m).padStart(2, "0") : m) +
      ":" +
      String(x).padStart(2, "0")
    );
  };

  const hue = (s) => {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  };

  const pretty = (it) =>
    it.dir ? it.name : it.name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ");

  const ext = (it) =>
    it.name.includes(".")
      ? it.name.split(".").pop().toUpperCase().slice(0, 5)
      : "";

  const posKey = (it) => "pos:" + location.pathname + it.url;

  const progress = (it) => {
    const s = store.get(posKey(it), null);
    return s && s.d ? Math.min(100, Math.round((s.t * 100) / s.d)) : 0;
  };

  const state = {
    q: "",
    sort: store.get("sort", "name"),
    view: store.get("view", "grid"),
  };

  /* ---------- Theme ---------- */

  const themeToggle = $("#themeToggle");

  function applyTheme(theme, persist = false) {
    const next = theme === "light" ? "light" : "dark";

    document.documentElement.dataset.theme = next;
    if (persist) store.set("theme", next);

    if (themeToggle) {
      themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
      themeToggle.setAttribute(
        "aria-label",
        next === "dark" ? "Switch to light theme" : "Switch to dark theme",
      );
      themeToggle.title = next === "dark" ? "Light theme" : "Dark theme";
    }

    const meta = document.querySelector('meta[name="theme-color"]');

    if (meta) {
      meta.content = next === "dark" ? "#0b0b10" : "#f4f4f8";
    }
  }

  const savedTheme = store.get("theme", null);

  applyTheme(
    savedTheme ||
      (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
  );

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      applyTheme(
        document.documentElement.dataset.theme === "dark" ? "light" : "dark",
        true,
      );
    });
  }

  matchMedia("(prefers-color-scheme: light)").addEventListener(
    "change",
    (e) => {
      if (!store.get("theme", null)) applyTheme(e.matches ? "light" : "dark");
    },
  );

  /* ---------- Notifications ---------- */

  let toastT;

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;

    clearTimeout(toastT);
    toastT = setTimeout(() => {
      t.hidden = true;
    }, 3200);
  }

  /* ---------- Header and breadcrumbs ---------- */

  const parts = D.path.split("/").filter(Boolean);
  const title = parts.length ? parts[parts.length - 1] : "Media Library";

  $("#title").textContent = title;
  document.title = title;

  (() => {
    let acc = "/";
    const crumbs = [{ n: "Home", u: "/" }];

    parts.forEach((p) => {
      acc += encodeURIComponent(p) + "/";
      crumbs.push({ n: p, u: acc });
    });

    $("#crumbs").innerHTML = crumbs
      .map(
        (x, i) =>
          (i ? "<i>&#8250;</i>" : "") +
          `<a href="${x.u}"${
            i === crumbs.length - 1 ? ' class="cur"' : ""
          }>${esc(x.n)}</a>`,
      )
      .join("");
  })();

  (() => {
    const n = {
      dir: 0,
      video: 0,
      image: 0,
      audio: 0,
      file: 0,
    };

    let size = 0;

    D.items.forEach((i) => {
      n[i.dir ? "dir" : i.kind]++;
      size += i.size;
    });

    const out = [];

    if (n.dir) out.push(n.dir + (n.dir > 1 ? " folders" : " folder"));
    if (n.video) out.push(n.video + (n.video > 1 ? " videos" : " video"));
    if (n.image) out.push(n.image + (n.image > 1 ? " images" : " image"));
    if (n.audio) out.push(n.audio + " audio");
    if (n.file) out.push(n.file + (n.file > 1 ? " files" : " file"));
    if (size) out.push(fmtSize(size));

    $("#stats").textContent = out.join("  ·  ") || "Empty folder";
  })();

  /* ---------- Preview frames for Photos videos ----------
     The server makes these itself when ffmpeg is installed. Otherwise the browser grabs one
     frame per small video, once, and uploads it - after that it is served as a cached image. */

  function setArt(it, url) {
    it.poster = url;
    document.querySelectorAll(".card").forEach((c) => {
      if (c.dataset.key !== it.key) return;
      const th = c.querySelector(".thumb");
      if (th && !th.querySelector(".poster-img")) {
        th.insertAdjacentHTML(
          "afterbegin",
          `<img class="poster-img" src="${esc(url)}" alt="" decoding="async" onerror="this.remove()">`,
        );
      }
    });
  }

  const capQueue = [];
  const capSeen = new Set();
  let capActive = 0;

  function queueCapture(it) {
    if (!it.capture || capSeen.has(it.key)) return;
    capSeen.add(it.key);
    capQueue.push(it);
    pumpCapture();
  }

  function pumpCapture() {
    while (capActive < 2 && capQueue.length) {
      const it = capQueue.shift();
      capActive++;
      captureFrame(it).finally(() => {
        capActive--;
        pumpCapture();
      });
    }
  }

  function captureFrame(it) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "metadata";
      let finished = false;
      let timer = 0;

      const finish = async (blob, report = true) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        v.removeAttribute("src");
        v.load();
        try {
          if (blob) {
            const r = await fetch(
              "/__api/thumb?key=" + encodeURIComponent(it.key),
              {
                method: "POST",
                headers: { "Content-Type": "image/jpeg" },
                body: blob,
              },
            );
            const j = await r.json();
            if (j.ok && j.poster) setArt(it, j.poster);
          } else if (report) {
            // this browser can't decode it: remember that so we don't try again
            await fetch(
              "/__api/thumb?failed=1&key=" + encodeURIComponent(it.key),
              {
                method: "POST",
              },
            );
          }
        } catch {}
        resolve();
      };

      timer = setTimeout(() => finish(null, false), 25000);
      v.addEventListener("error", () => finish(null));
      v.addEventListener("loadedmetadata", () => {
        try {
          v.currentTime = Math.min(1, (v.duration || 2) / 2);
        } catch {
          finish(null);
        }
      });
      v.addEventListener("seeked", () => {
        try {
          const w = 360;
          const h = Math.max(
            1,
            Math.round((w * (v.videoHeight || 9)) / (v.videoWidth || 16)),
          );
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          c.getContext("2d").drawImage(v, 0, 0, w, h);
          c.toBlob((b) => finish(b), "image/jpeg", 0.72);
        } catch {
          finish(null);
        }
      });
      v.src = it.url;
    });
  }

  /* ---------- Listing and cards ---------- */

  function list() {
    const q = state.q.trim().toLowerCase();

    const items = D.items.filter((i) => !q || i.name.toLowerCase().includes(q));

    items.sort((x, y) => {
      if (x.dir !== y.dir) return x.dir ? -1 : 1;

      if (state.sort === "size") {
        return y.size - x.size || nat.compare(x.name, y.name);
      }

      if (state.sort === "date") return y.mtime - x.mtime;

      return nat.compare(x.name, y.name);
    });

    return items;
  }

  function card(it) {
    const a = document.createElement("a");

    a.className = "card";
    a.href = it.url;
    a.title = it.name;
    a.dataset.key = it.key || "";

    let th;

    if (it.dir) {
      th = `
        <div class="thumb folder" style="--h:${hue(it.name)}">
          <span class="ico">&#128193;</span>
          <span class="badge">
            ${it.count} item${it.count === 1 ? "" : "s"}
          </span>
        </div>`;
    } else if (it.kind === "image" && it.heic && !it.thumb) {
      // .heic that this server can't convert (pip install pillow-heif): no broken image
      th = `
        <div class="thumb heic-missing" title="Run: pip install pillow-heif   (on the PC running the server)">
          <span class="ico">&#128444;&#65039;</span>
          <span class="badge">${esc(ext(it))}</span>
        </div>`;
    } else if (it.kind === "image") {
      th = `
        <div class="thumb">
          <img loading="lazy" decoding="async"
               src="${esc(it.thumb || it.url)}" alt=""${
                 it.thumb
                   ? ` data-o="${esc(it.url)}" onerror="if(this.dataset.o){this.src=this.dataset.o;this.dataset.o=''}"`
                   : ""
               }>
          <span class="badge">${esc(ext(it))}</span>
        </div>`;
    } else if (it.kind === "video") {
      const p = progress(it);
      const scope = it.scope || "other";

      // poster (Vedios) or preview frame (Photos); otherwise the CSS default image shows
      const art = it.poster
        ? `<img class="poster-img" src="${esc(it.poster)}" alt=""
                loading="lazy" decoding="async" onerror="this.remove()">`
        : "";

      th = `
        <div class="thumb video scope-${scope}">
          ${art}
          <span class="badge">${esc(ext(it))}</span>
          ${p ? `<div class="prog"><i style="width:${p}%"></i></div>` : ""}
          ${
            scope === "poster"
              ? `<button class="poster-edit"
                         type="button"
                         title="Change poster"
                         aria-label="Change poster for ${esc(pretty(it))}">
                   ✎
                 </button>`
              : ""
          }
        </div>`;
    } else if (it.kind === "audio") {
      th = `
        <div class="thumb audio">
          <span class="ico">&#127925;</span>
          <span class="badge">${esc(ext(it))}</span>
        </div>`;
    } else {
      th = `
        <div class="thumb">
          <span class="ico">&#128196;</span>
          <span class="badge">${esc(ext(it)) || "FILE"}</span>
        </div>`;
    }

    const sub = it.dir
      ? "Folder"
      : `${fmtSize(it.size)} · ${fmtDate(it.mtime)}`;

    a.innerHTML =
      th +
      `<div class="info">
        <div class="name">${esc(pretty(it))}</div>
        <div class="sub">${sub}</div>
      </div>`;

    a.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;

      if (!it.dir && ["video", "audio", "image"].includes(it.kind)) {
        e.preventDefault();
        openMedia(it);
      }
    });

    const editPoster = a.querySelector(".poster-edit");

    if (editPoster) {
      editPoster.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPosterPicker(it);
      });
    }

    return a;
  }

  function render() {
    const g = $("#grid");

    g.innerHTML = "";
    const hasPosters = D.items.some(
      (i) => i.kind === "video" && i.scope === "poster",
    );
    g.className =
      "grid" +
      (state.view === "list" ? " list" : "") +
      (hasPosters ? " posters" : "");

    const items = list();
    const frag = document.createDocumentFragment();

    items.forEach((it) => frag.appendChild(card(it)));
    g.appendChild(frag);
    items.forEach(queueCapture);

    $("#empty").hidden = items.length > 0;
    $("#empty").textContent = state.q
      ? `No matches for "${state.q}"`
      : "Nothing here.";

    $("#bgrid").classList.toggle("on", state.view !== "list");
    $("#blist").classList.toggle("on", state.view === "list");
    $("#sort").value = state.sort;
  }

  $("#q").addEventListener("input", (e) => {
    state.q = e.target.value;
    render();
  });

  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    store.set("sort", state.sort);
    render();
  });

  $("#bgrid").onclick = () => {
    state.view = "grid";
    store.set("view", "grid");
    render();
  };

  $("#blist").onclick = () => {
    state.view = "list";
    store.set("view", "list");
    render();
  };

  /* ---------- Poster selection ---------- */

  const posterModal = $("#posterModal");
  let posterTarget = null;

  const posterKey = (it) =>
    (
      (D.path || "/").replace(/^\/+|\/+$/g, "") +
      (D.path && D.path !== "/" ? "/" : "") +
      it.name
    ).replace(/\\/g, "/");

  function openPosterPicker(it) {
    posterTarget = it;

    $("#posterFor").textContent = pretty(it);

    $("#posterYear").value = it.q_year || "";
    $("#posterQuery").value = it.q_title || pretty(it);

    $("#posterResults").innerHTML = "";
    $("#posterLink").value = "";

    posterModal.hidden = false;
    document.body.classList.add("lock");
    $("#posterQuery").focus();
  }

  function closePosterPicker() {
    posterModal.hidden = true;
    document.body.classList.remove("lock");
    posterTarget = null;
  }

  $("#posterClose").addEventListener("click", closePosterPicker);

  posterModal.addEventListener("click", (e) => {
    if (e.target === posterModal) closePosterPicker();
  });

  async function postPoster(payload) {
    if (!posterTarget) return;

    payload.video_key = posterTarget.key || posterKey(posterTarget);
    payload.title = $("#posterQuery").value.trim();
    payload.year = $("#posterYear").value.trim();

    try {
      const response = await fetch("/__api/poster-select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Could not save poster.");
      }

      const wasShow = posterTarget.hint === "tv";
      posterTarget.poster = result.poster || "";

      closePosterPicker();
      render();
      // every episode of the show got the new poster - reload to show them all
      if (wasShow) setTimeout(() => location.reload(), 700);

      toast(result.poster ? "Poster saved" : "Poster reset to default");
    } catch (error) {
      toast(error.message || "Poster update failed");
    }
  }

  $("#posterSearchForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const q = $("#posterQuery").value.trim();
    if (!q) return toast("Enter a movie title first");

    const results = $("#posterResults");
    results.innerHTML = '<p class="poster-help">Searching posters…</p>';

    try {
      const url =
        "/__api/poster-search?" +
        new URLSearchParams({
          q,
          year: $("#posterYear").value.trim(),
          kind: (posterTarget && posterTarget.hint) || "movie",
        });

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Poster search failed");
      }

      results.innerHTML = "";

      if (!data.results || !data.results.length) {
        results.innerHTML = `
          <p class="poster-help">
            No posters found. Try another title or paste a link below.
          </p>`;
        return;
      }

      data.results.forEach((candidate) => {
        const item = document.createElement("button");

        item.type = "button";
        item.className = "poster-candidate";

        item.innerHTML = `
          <img src="${esc(candidate.image_url)}" alt="" referrerpolicy="no-referrer">
          <span>
            <b>${esc(candidate.title)}</b>
            <small>${esc([candidate.year, candidate.source, candidate.note].filter(Boolean).join(" · "))}</small>
          </span>`;

        item.addEventListener("click", () => {
          postPoster({
            action: "select",
            candidate_id: candidate.id,
          });
        });

        results.appendChild(item);
      });
    } catch (error) {
      results.innerHTML = `
        <p class="poster-help">
          ${esc(error.message)}.
          You can paste a TMDB or Wikipedia link instead.
        </p>`;
    }
  });

  $("#posterLinkForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const link = $("#posterLink").value.trim();

    if (!link) return toast("Paste a TMDB or Wikipedia link first");

    let host = "";
    try {
      host = new URL(link).hostname.toLowerCase();
    } catch {
      return toast("That doesn't look like a link - paste the full address");
    }

    if (
      !/(^|\.)(themoviedb\.org|tmdb\.org|wikipedia\.org|wikimedia\.org)$/.test(
        host,
      )
    ) {
      return toast("Only TMDB and Wikipedia links are accepted");
    }

    toast("Fetching the image…");
    postPoster({ action: "url", link });
  });

  $("#posterReset").addEventListener("click", () => {
    postPoster({ action: "reset" });
  });

  /* ---------- Player and image viewer ---------- */

  const vid = $("#vid");

  let pl = { list: [], i: 0 };
  let overlayOpen = false;

  function pushOv() {
    if (!overlayOpen) {
      history.pushState({ ov: 1 }, "");
      overlayOpen = true;
    }
  }

  function hideAll() {
    const wasOpen = !$("#player").hidden || !$("#viewer").hidden;

    $("#player").hidden = true;
    $("#viewer").hidden = true;

    document.body.classList.remove("lock");

    leavePlayer();
    vid.pause();
    vid.removeAttribute("src");
    vid.load();

    $("#vimg").removeAttribute("src");

    if (wasOpen) render();
  }

  function closeOv() {
    if (overlayOpen) history.back();
    else hideAll();
  }

  addEventListener("popstate", () => {
    overlayOpen = false;
    hideAll();
  });

  function openMedia(it) {
    pl.list = D.items
      .filter((x) => !x.dir && x.kind === it.kind)
      .sort((a, b) => nat.compare(a.name, b.name));

    pl.i = pl.list.findIndex((x) => x.url === it.url);

    pushOv();
    document.body.classList.add("lock");

    it.kind === "image" ? showImg() : showVid();
  }

  /* ---------- Video player: our own controls ----------
     The browser still decodes the video; everything you see and tap is ours - seek bar,
     touch gestures, speed, fit, lock, picture-in-picture, fullscreen and an Audio /
     Subtitles menu. Subtitles are drawn by us (so size, colour and delay can change).
     The default audio plays from the video itself; any other language is extracted once
     by the server and played from a hidden <audio> kept in sync with the muted video. */

  const aud = $("#aud");
  const playerEl = $("#player");
  const stage = $("#stage");
  const seekEl = $("#pseek");
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const T_ = (t) => (isFinite(t) ? fmtTime(Math.max(0, t)) : "0:00");

  const HOUR10 =
    '<path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>';
  const TEN =
    '<text x="12" y="15.6" font-size="7.4" font-weight="700" text-anchor="middle" fill="currentColor" font-family="system-ui,sans-serif">10</text>';
  const ICON = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
    prev: '<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>',
    next: '<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>',
    back: HOUR10 + TEN,
    fwd: '<g transform="translate(24 0) scale(-1 1)">' + HOUR10 + "</g>" + TEN,
    vol: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',
    mute: '<path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.5 2.5V12zM19 12c0 .9-.2 1.8-.5 2.5l1.5 1.5A8.9 8.9 0 0 0 21 12c0-4.3-3-7.9-7-8.8v2.1c2.9.9 5 3.5 5 6.7zM4.3 3L3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3c-.7.5-1.4.9-2.3 1.2v2.1a9 9 0 0 0 3.7-1.8l2 2 1.3-1.3L4.3 3zM12 4L9.9 6.1 12 8.2V4z"/>',
    cc: '<path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z"/>',
    fit: '<path d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16.01H3V4.99h18v14.02z"/>',
    pip: '<path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/>',
    lock: '<path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6z"/>',
    fs: '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>',
    fsx: '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>',
  };
  const svg = (n) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  const FITS = [
    ["contain", "Fit"],
    ["cover", "Fill"],
    ["fill", "Stretch"],
  ];
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const SUB_COLORS = ["#ffffff", "#ffe066", "#7be0ff", "#9dff8a"];

  const prefs = {
    volume: clamp(Number(store.get("vol", 1)), 0, 1),
    muted: !!store.get("muted", false),
    speed: Number(store.get("speed", 1)) || 1,
    subSize: Number(store.get("subSize", 100)) || 100,
    subColor: store.get("subColor", "#ffffff"),
  };

  const P = {
    token: 0, // changes with every video, so late answers for an old video are ignored
    prepId: 0,
    tracks: null, // {ffmpeg, audio: [], subs: []} from the server
    aIdx: 0, // audio track chosen in the menu
    ext: false, // true while an extracted track plays from the <audio> element
    extIdx: 0,
    sId: "", // chosen subtitle id ('' = off)
    cues: [],
    delay: 0, // subtitle delay in seconds (+ = later)
    locked: false,
    fit: 0,
    menu: "",
    idleT: 0,
    bright: 1,
    msgA: "",
    msgS: "",
  };

  const trkKey = (it) => "trk2:" + location.pathname + it.url;
  const PREF_KEY = "trkpref2"; // {a: audio language, s: subtitle language | "off" | null = never chosen}
  const getPref = () => store.get(PREF_KEY, { a: "", s: null });

  /* ----- buttons, icons ----- */
  const setIcons = () => {
    $("#pprev").innerHTML = svg("prev");
    $("#pnext").innerHTML = svg("next");
    $("#pback").innerHTML = svg("back");
    $("#pfwd").innerHTML = svg("fwd");
    $("#ptracks").innerHTML = svg("cc");
    $("#pfit").innerHTML = svg("fit");
    $("#ppip").innerHTML = svg("pip");
    $("#plock").innerHTML = svg("lock");
    $("#punlock").innerHTML = svg("lock");
    $("#pfs").innerHTML = svg("fs");
    updatePlay();
    applyVol();
    applySubStyle();
    updateSpeed();
  };

  function updatePlay() {
    $("#pplay").innerHTML = svg(vid.paused ? "play" : "pause");
    $("#pplay").setAttribute("aria-label", vid.paused ? "Play" : "Pause");
  }

  function updateSpeed() {
    $("#pspeed").textContent = vid.playbackRate + "×";
  }

  function updateTracksBtn() {
    $("#ptracks").classList.toggle("on", !!P.sId || P.aIdx !== 0);
  }

  /* ----- seek bar ----- */
  let scrubbing = false;

  function paintSeek(t) {
    const d = vid.duration;
    seekEl.style.setProperty(
      "--p",
      (isFinite(d) && d > 0 ? clamp(t / d, 0, 1) * 100 : 0) + "%",
    );
    $("#ptime").textContent = T_(t);
  }

  function paintBuf() {
    const d = vid.duration;
    let end = 0;
    if (isFinite(d) && d > 0) {
      for (let i = 0; i < vid.buffered.length; i++) {
        if (
          vid.buffered.start(i) <= vid.currentTime + 0.5 &&
          vid.buffered.end(i) > end
        ) {
          end = vid.buffered.end(i);
        }
      }
      end = clamp(end / d, 0, 1);
    }
    seekEl.style.setProperty("--b", end * 100 + "%");
  }

  function seekTo(t) {
    if (!isFinite(vid.duration)) return;
    vid.currentTime = clamp(t, 0, vid.duration);
    paintSeek(vid.currentTime);
  }

  function seekBy(d) {
    seekTo(vid.currentTime + d);
    hud((d > 0 ? "+" : "−") + Math.abs(d) + " s", T_(vid.currentTime));
  }

  const seekFrac = (e) => {
    const r = seekEl.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  };

  const tip = $(".seek-tip");

  function showTip(e) {
    if (!isFinite(vid.duration)) return;
    const f = seekFrac(e);
    tip.hidden = false;
    tip.style.left = f * 100 + "%";
    tip.textContent = T_(f * vid.duration);
  }

  seekEl.addEventListener("pointerdown", (e) => {
    if (!isFinite(vid.duration)) return;
    scrubbing = true;
    seekEl.classList.add("drag");
    seekEl.setPointerCapture(e.pointerId);
    paintSeek(seekFrac(e) * vid.duration);
    showTip(e);
  });
  seekEl.addEventListener("pointermove", (e) => {
    showTip(e);
    if (scrubbing) paintSeek(seekFrac(e) * vid.duration);
  });
  seekEl.addEventListener("pointerup", (e) => {
    if (!scrubbing) return;
    scrubbing = false;
    seekEl.classList.remove("drag");
    seekTo(seekFrac(e) * vid.duration);
    if (e.pointerType !== "mouse") tip.hidden = true;
  });
  seekEl.addEventListener("pointercancel", () => {
    scrubbing = false;
    seekEl.classList.remove("drag");
    tip.hidden = true;
  });
  seekEl.addEventListener("pointerleave", () => {
    if (!scrubbing) tip.hidden = true;
  });

  /* ----- volume, speed, fit ----- */
  function applyVol() {
    const m = prefs.muted || prefs.volume === 0;
    if (P.ext) {
      vid.muted = true;
      aud.muted = m;
      aud.volume = prefs.volume;
    } else {
      vid.muted = m;
      vid.volume = prefs.volume;
    }
    $("#pvol").value = m ? 0 : prefs.volume;
    $("#pmute").innerHTML = svg(m ? "mute" : "vol");
  }

  function saveVol() {
    store.set("vol", prefs.volume);
    store.set("muted", prefs.muted);
  }

  $("#pvol").addEventListener("input", (e) => {
    prefs.volume = Number(e.target.value);
    prefs.muted = prefs.volume === 0;
    applyVol();
    saveVol();
  });

  function toggleMute() {
    if (prefs.muted || prefs.volume === 0) {
      prefs.muted = false;
      if (prefs.volume === 0) prefs.volume = 0.5;
    } else {
      prefs.muted = true;
    }
    applyVol();
    saveVol();
    hud(prefs.muted ? "Muted" : "Volume", Math.round(prefs.volume * 100) + "%");
  }

  function bumpVolume(d) {
    prefs.muted = false;
    prefs.volume = clamp(Math.round((prefs.volume + d) * 100) / 100, 0, 1);
    applyVol();
    saveVol();
    hud("Volume", Math.round(prefs.volume * 100) + "%", prefs.volume);
  }

  function setSpeed(v) {
    prefs.speed = v;
    store.set("speed", v);
    vid.defaultPlaybackRate = v;
    vid.playbackRate = v;
    hud(v + "×", "Speed");
  }

  function cycleFit() {
    P.fit = (P.fit + 1) % FITS.length;
    vid.style.objectFit = FITS[P.fit][0];
    hud(FITS[P.fit][1], "Picture");
  }

  /* ----- HUD (centre pop-up for gestures and shortcuts) ----- */
  let hudT = 0;

  function hud(big, small, bar) {
    const h = $("#ghud");
    h.innerHTML =
      `<b>${esc(big)}</b>` +
      (small ? `<span>${esc(small)}</span>` : "") +
      (bar === undefined
        ? ""
        : `<em><i style="width:${clamp(bar, 0, 1) * 100}%"></i></em>`);
    h.hidden = false;
    clearTimeout(hudT);
    hudT = setTimeout(() => (h.hidden = true), 900);
  }

  function setMsg(which, text) {
    P["msg" + which] = text;
    const chip = $("#pchip");
    const t = [P.msgA, P.msgS].filter(Boolean).join("   ·   ");
    chip.textContent = t;
    chip.hidden = !t;
  }

  /* ----- auto-hide controls, lock ----- */
  function wake() {
    playerEl.classList.remove("idle");
    clearTimeout(P.idleT);
    if (!vid.paused && !P.menu && !scrubbing) {
      P.idleT = setTimeout(() => playerEl.classList.add("idle"), 3200);
    }
  }

  function toggleControls() {
    if (playerEl.classList.contains("idle") || vid.paused) wake();
    else {
      clearTimeout(P.idleT);
      playerEl.classList.add("idle");
    }
  }

  let unlockT = 0;

  function showUnlock() {
    $("#punlock").hidden = false;
    clearTimeout(unlockT);
    unlockT = setTimeout(() => ($("#punlock").hidden = true), 3000);
  }

  function setLock(on) {
    P.locked = on;
    playerEl.classList.toggle("locked", on);
    $("#punlock").hidden = true;
    if (on) {
      closeMenu();
      toast("Controls locked - tap the screen, then the lock button to unlock");
    }
  }

  $("#plock").onclick = () => setLock(true);
  $("#punlock").onclick = () => setLock(false);

  /* ----- fullscreen, picture-in-picture ----- */
  const fsEl = () =>
    document.fullscreenElement || document.webkitFullscreenElement;
  const canFs = !!(
    playerEl.requestFullscreen || playerEl.webkitRequestFullscreen
  );

  function toggleFs() {
    const p = fsEl()
      ? (document.exitFullscreen || document.webkitExitFullscreen).call(
          document,
        )
      : canFs
        ? (playerEl.requestFullscreen || playerEl.webkitRequestFullscreen).call(
            playerEl,
          )
        : null;
    if (p && p.catch) p.catch(() => {});
  }

  function onFsChange() {
    const on = !!fsEl();
    $("#pfs").innerHTML = svg(on ? "fsx" : "fs");
    try {
      if (on && vid.videoWidth > vid.videoHeight) {
        screen.orientation.lock("landscape").catch(() => {});
      } else if (!on) {
        screen.orientation.unlock();
      }
    } catch {}
  }

  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  if (!canFs) $("#pfs").hidden = true; // iPhone: the player already fills the screen

  if (document.pictureInPictureEnabled && vid.requestPictureInPicture) {
    $("#ppip").hidden = false;
    $("#ppip").onclick = () => {
      const p = document.pictureInPictureElement
        ? document.exitPictureInPicture()
        : vid.requestPictureInPicture();
      p.catch(() => toast("Picture-in-picture isn't available for this video"));
    };
  }

  /* ----- play state events + audio sync ----- */
  const spin = (on) => ($("#pspin").hidden = !on);

  function audPlay() {
    if (P.ext && aud.paused && aud.readyState >= 2) aud.play().catch(() => {});
  }

  vid.addEventListener("play", () => {
    updatePlay();
    wake();
    audPlay();
  });
  vid.addEventListener("pause", () => {
    updatePlay();
    wake();
    if (P.ext) aud.pause();
  });
  vid.addEventListener("waiting", () => {
    spin(true);
    if (P.ext) aud.pause();
  });
  vid.addEventListener("playing", () => {
    spin(false);
    if (P.ext) {
      aud.currentTime = vid.currentTime;
      audPlay();
    }
  });
  vid.addEventListener("canplay", () => spin(false));
  vid.addEventListener("seeking", () => {
    if (P.ext) aud.currentTime = vid.currentTime;
  });
  vid.addEventListener("seeked", () => {
    if (P.ext) {
      aud.currentTime = vid.currentTime;
      if (!vid.paused) audPlay();
    }
  });
  vid.addEventListener("ratechange", () => {
    aud.playbackRate = vid.playbackRate;
    updateSpeed();
  });
  vid.addEventListener("durationchange", () => {
    $("#pdur").textContent = T_(vid.duration);
  });
  vid.addEventListener("progress", paintBuf);
  vid.addEventListener("timeupdate", () => {
    if (!scrubbing) paintSeek(vid.currentTime);
    paintBuf();
    // keep the extra audio within 0.3 s of the picture
    if (
      P.ext &&
      !vid.paused &&
      !vid.seeking &&
      aud.readyState >= 2 &&
      Math.abs(aud.currentTime - vid.currentTime) > 0.3
    ) {
      aud.currentTime = vid.currentTime;
    }
  });
  aud.addEventListener("canplay", () => {
    if (P.ext && !vid.paused && !vid.seeking) audPlay();
  });

  /* ----- subtitles (drawn by us) ----- */
  function parseVTT(txt) {
    const out = [];
    const tm = (s) => {
      const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
      return m
        ? Number(m[1] || 0) * 3600 +
            Number(m[2]) * 60 +
            Number(m[3]) +
            Number(m[4].padEnd(3, "0")) / 1000
        : NaN;
    };
    txt
      .replace(/\r/g, "")
      .split(/\n{2,}/)
      .forEach((block) => {
        const lines = block.split("\n");
        const k = lines.findIndex((l) => l.includes("-->"));
        if (k < 0) return;
        const [a, b] = lines[k].split("-->");
        const s = tm(a);
        const e = tm(b);
        if (isNaN(s) || isNaN(e)) return;
        const h = esc(lines.slice(k + 1).join("\n"))
          .replace(/&lt;(\/?)(i|b|u)&gt;/gi, "<$1$2>") // keep only simple styling
          .replace(/&lt;[^&]*?&gt;/g, "")
          .replace(/\{\\[^}]*\}/g, "")
          .trim()
          .replace(/\n/g, "<br>");
        if (h) out.push({ s, e, h });
      });
    return out.sort((x, y) => x.s - y.s);
  }

  let subHtml = "";

  function tickSubs(force) {
    if (playerEl.hidden) return;
    let html = "";
    if (P.cues.length) {
      const t = vid.currentTime - P.delay;
      html = P.cues
        .filter((c) => t >= c.s && t < c.e)
        .map((c) => c.h)
        .join("<br>");
    }
    if (html !== subHtml || force) {
      subHtml = html;
      $("#subs").innerHTML = html ? `<span>${html}</span>` : "";
    }
  }

  setInterval(tickSubs, 120);

  function applySubStyle() {
    const el = $("#subs");
    el.style.setProperty("--ss", prefs.subSize / 100);
    el.style.setProperty("--sc", prefs.subColor);
  }

  // only choices the user makes are saved; automatic picks are worked out again each time
  function saveTrk(what) {
    const it = pl.list[pl.i];
    if (!it || !P.tracks) return;
    store.set(trkKey(it), { a: P.aIdx, s: P.sId });
    const pref = getPref();
    if (what === "a") {
      const a = P.tracks.audio.find((x) => x.i === P.aIdx);
      pref.a = (a && a.lang) || "";
    } else {
      const s = P.tracks.subs.find((x) => x.id === P.sId);
      pref.s = P.sId ? (s && s.lang) || null : "off";
    }
    store.set(PREF_KEY, pref);
  }

  async function chooseSub(id, auto) {
    const it = pl.list[pl.i];
    const token = P.token;
    P.sId = id;
    P.cues = [];
    tickSubs(true);
    setMsg("S", "");
    updateTracksBtn();
    renderMenu();
    if (!auto) saveTrk("s");
    if (!id || !it) return;
    setMsg("S", "Loading subtitles…");
    try {
      const r = await fetch(
        `/__api/subtitle?key=${encodeURIComponent(it.key)}&id=${encodeURIComponent(id)}`,
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't load that subtitle");
      }
      const text = await r.text();
      if (token !== P.token || P.sId !== id) return;
      P.cues = parseVTT(text);
      setMsg("S", "");
      if (!P.cues.length) toast("That subtitle file has no readable lines");
      else if (!auto) toast("Subtitles on");
      tickSubs(true);
    } catch (err) {
      if (token !== P.token || P.sId !== id) return;
      P.sId = "";
      setMsg("S", "");
      updateTracksBtn();
      renderMenu();
      toast(err.message);
    }
  }

  /* ----- audio tracks ----- */
  const NO_NATIVE = new Set(["dts", "truehd", "mlp", "dca"]);

  // true when this browser can't decode the track itself (AC3 / DTS ...): it gets converted
  function needsConv(a) {
    if (!a) return false;
    if (NO_NATIVE.has(a.codec)) return true;
    const t = {
      ac3: 'audio/mp4; codecs="ac-3"',
      eac3: 'audio/mp4; codecs="ec-3"',
    }[a.codec];
    return !!t && !document.createElement("audio").canPlayType(t);
  }

  function enterExt(url, i) {
    P.ext = true;
    P.extIdx = i;
    aud.src = url;
    aud.playbackRate = vid.playbackRate;
    aud.addEventListener(
      "loadedmetadata",
      () => {
        aud.currentTime = vid.currentTime;
        if (!vid.paused) aud.play().catch(() => {});
      },
      { once: true },
    );
    aud.load();
    applyVol();
  }

  function leaveExt() {
    if (!P.ext) return;
    P.ext = false;
    P.extIdx = 0;
    aud.pause();
    aud.removeAttribute("src");
    aud.load();
    applyVol();
  }

  async function chooseAudio(i, auto) {
    const T = P.tracks;
    const it = pl.list[pl.i];
    const tr = T && T.audio.find((a) => a.i === i);
    if (!tr || !it) return;
    const token = P.token;
    const my = ++P.prepId;
    P.aIdx = i;
    updateTracksBtn();
    if (!auto) saveTrk("a");
    renderMenu();
    // track 1 is what the video plays by itself - unless this browser can't decode it
    if (i === 0 && !needsConv(tr)) {
      setMsg("A", "");
      leaveExt();
      return;
    }
    const hold = i === 0; // silent otherwise, so wait for the converted track
    const wasPlaying = !vid.paused;
    if (hold) vid.pause();
    setMsg("A", "Preparing audio…");
    const stop = (msg) => {
      setMsg("A", "");
      P.aIdx = P.extIdx;
      updateTracksBtn();
      renderMenu();
      if (msg) toast(msg);
      if (hold && wasPlaying) vid.play().catch(() => {});
    };
    try {
      let url = "";
      for (;;) {
        const r = await fetch(
          `/__api/audio-prepare?key=${encodeURIComponent(it.key)}&a=${i}`,
        );
        const j = await r.json();
        if (my !== P.prepId || token !== P.token) return;
        if (!r.ok || j.status === "error") {
          throw new Error(j.error || "Couldn't prepare that audio track");
        }
        if (j.status === "done") {
          url = j.url;
          break;
        }
        setMsg(
          "A",
          "Preparing audio… " + Math.round((j.progress || 0) * 100) + "%",
        );
        await wait(1200);
        if (my !== P.prepId || token !== P.token) return;
      }
      setMsg("A", "");
      enterExt(url, i);
      if (hold && wasPlaying) vid.play().catch(() => {});
      if (!auto) toast("Audio: " + tr.label);
    } catch (err) {
      if (my !== P.prepId || token !== P.token) return;
      stop(err.message);
    }
  }

  function autoPick(it, T) {
    const saved = store.get(trkKey(it), null);
    const pref = getPref();
    let ai = 0;
    if (saved && T.audio.some((a) => a.i === saved.a)) ai = saved.a;
    else if (pref.a) {
      const m = T.audio.find((a) => a.lang === pref.a);
      if (m) ai = m.i;
    }
    let sid = "";
    const chosenHere = !!saved && typeof saved.s === "string"; // you picked (or turned off) subtitles for this video
    if (chosenHere) {
      sid = T.subs.some((s) => s.id === saved.s && s.ok) ? saved.s : "";
    } else if (pref.s !== "off") {
      // your usual subtitle language, else the track the file itself marks as default / forced
      const lang = pref.s
        ? T.subs.find((s) => s.ok && s.lang === pref.s)
        : null;
      const flagged =
        T.subs.find((s) => s.ok && s.default) ||
        T.subs.find((s) => s.ok && s.forced);
      const m = lang || flagged;
      if (m) sid = m.id;
    }
    if (T.audio.length && (ai !== 0 || needsConv(T.audio[0])))
      chooseAudio(ai, true);
    if (sid) chooseSub(sid, true);
  }

  async function loadTracks(it, token) {
    P.tracks = null;
    if (!it.key) return;
    try {
      const r = await fetch("/__api/tracks?key=" + encodeURIComponent(it.key));
      const T = await r.json();
      if (!r.ok) throw new Error(T.error || "");
      if (token !== P.token) return;
      P.tracks = T;
      renderMenu();
      autoPick(it, T);
    } catch {
      if (token !== P.token) return;
      P.tracks = { ffmpeg: false, audio: [], subs: [] };
      renderMenu();
    }
  }

  /* ----- the Audio / Subtitles and Speed menus ----- */
  const mrow = (k, v, label, on, note, disabled) =>
    `<button class="mrow" type="button" data-k="${k}" data-v="${esc(v)}"${
      disabled ? " disabled" : ""
    }><span class="chk">${on ? "✓" : ""}</span><span>${esc(label)}</span>${
      note ? `<small>${esc(note)}</small>` : ""
    }</button>`;

  const mstep = (label, value, k) =>
    `<div class="mstep"><span>${label}</span><div>` +
    `<button type="button" data-k="${k}" data-v="-" aria-label="less">−</button>` +
    `<output>${value}</output>` +
    `<button type="button" data-k="${k}" data-v="+" aria-label="more">+</button></div></div>`;

  function menuTracks() {
    const T = P.tracks;
    let h = '<div class="mh">Audio</div>';
    if (!T) h += '<div class="mnote">Looking for tracks…</div>';
    else if (!T.audio.length) {
      h += `<div class="mnote">${
        T.ffmpeg
          ? "No separate audio tracks found."
          : "Switching audio needs ffmpeg and ffprobe installed on the PC running the server."
      }</div>`;
    } else {
      T.audio.forEach((a) => {
        const conv = a.i !== 0 || needsConv(a);
        h += mrow(
          "a",
          a.i,
          a.label,
          P.aIdx === a.i,
          conv && P.aIdx !== a.i ? "converts once" : "",
        );
      });
    }
    h += '<div class="mh">Subtitles</div>' + mrow("s", "", "Off", P.sId === "");
    ((T && T.subs) || []).forEach((s) => {
      h += mrow(
        "s",
        s.id,
        s.label,
        P.sId === s.id,
        s.ok ? (s.default ? "default" : "") : "image-based",
        !s.ok,
      );
    });
    if (T && !T.subs.length) {
      h +=
        '<div class="mnote">No subtitles found. Put a .srt or .vtt file with the same name next to the video.</div>';
    }
    h += '<div class="mh">Subtitle style</div>';
    h += mstep("Size", prefs.subSize + "%", "size");
    h += mstep(
      "Delay",
      (P.delay > 0 ? "+" : "") + P.delay.toFixed(1) + " s",
      "delay",
    );
    h +=
      '<div class="mswatches">' +
      SUB_COLORS.map(
        (c) =>
          `<button class="mswatch${c === prefs.subColor ? " on" : ""}" type="button" data-k="color" data-v="${c}" style="background:${c}" aria-label="Subtitle colour ${c}"></button>`,
      ).join("") +
      "</div>";
    return h;
  }

  function menuSpeed() {
    return (
      '<div class="mh">Playback speed</div>' +
      SPEEDS.map((v) =>
        mrow(
          "speed",
          v,
          v + "×" + (v === 1 ? " (normal)" : ""),
          vid.playbackRate === v,
        ),
      ).join("")
    );
  }

  function renderMenu() {
    if (!P.menu) return;
    $("#pmenu").innerHTML = P.menu === "speed" ? menuSpeed() : menuTracks();
  }

  function openMenu(kind) {
    if (P.menu === kind) return closeMenu();
    P.menu = kind;
    renderMenu();
    const m = $("#pmenu");
    m.hidden = false;
    m.style.bottom = $("#pctrl").offsetHeight + 6 + "px";
    wake();
  }

  function closeMenu() {
    P.menu = "";
    $("#pmenu").hidden = true;
    wake();
  }

  $("#pmenu").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]");
    if (!b || b.disabled) return;
    const k = b.dataset.k;
    const v = b.dataset.v;
    if (k === "a") chooseAudio(Number(v));
    else if (k === "s") chooseSub(v);
    else if (k === "speed") {
      setSpeed(Number(v));
      closeMenu();
    } else if (k === "size") {
      prefs.subSize = clamp(prefs.subSize + (v === "+" ? 10 : -10), 50, 250);
      store.set("subSize", prefs.subSize);
      applySubStyle();
      renderMenu();
    } else if (k === "color") {
      prefs.subColor = v;
      store.set("subColor", v);
      applySubStyle();
      renderMenu();
    } else if (k === "delay") {
      P.delay = Math.round((P.delay + (v === "+" ? 0.5 : -0.5)) * 10) / 10;
      tickSubs(true);
      renderMenu();
    }
  });

  $("#pspeed").onclick = () => openMenu("speed");
  $("#ptracks").onclick = () => openMenu("tracks");

  function cycleSub() {
    const T = P.tracks;
    if (!T) return;
    const ids = [""].concat(T.subs.filter((s) => s.ok).map((s) => s.id));
    const next = ids[(ids.indexOf(P.sId) + 1) % ids.length];
    chooseSub(next);
    const s = T.subs.find((x) => x.id === next);
    hud(s ? s.label : "Subtitles off", "Subtitles");
  }

  function cycleAudio() {
    const T = P.tracks;
    if (!T || T.audio.length < 2) return;
    const i = T.audio.findIndex((a) => a.i === P.aIdx);
    const next = T.audio[(i + 1) % T.audio.length];
    chooseAudio(next.i);
    hud(next.label, "Audio");
  }

  /* ----- taps and touch gestures on the picture ----- */
  let tapTimer = 0;
  let lastTap = 0;
  let gest = null;

  function togglePlay() {
    if (vid.paused) vid.play().catch(() => {});
    else vid.pause();
  }

  function onTap(e, touch) {
    if (P.menu) return closeMenu();
    const now = performance.now();
    const r = stage.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    if (now - lastTap < 300) {
      clearTimeout(tapTimer);
      lastTap = now; // keep tapping to keep skipping
      if (!touch) return toggleFs();
      if (rel < 0.33) seekBy(-10);
      else if (rel > 0.67) seekBy(10);
      else togglePlay();
      return;
    }
    lastTap = now;
    tapTimer = setTimeout(() => (touch ? toggleControls() : togglePlay()), 280);
  }

  stage.addEventListener("pointerdown", (e) => {
    wake();
    if (P.locked) return showUnlock();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gest = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      touch: e.pointerType !== "mouse",
      mode: "",
    };
  });

  stage.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") return wake();
    if (!gest || e.pointerId !== gest.id || P.locked) return;
    const dx = e.clientX - gest.x;
    const dy = e.clientY - gest.y;
    const r = stage.getBoundingClientRect();
    if (!gest.mode) {
      if (Math.hypot(dx, dy) < 16) return;
      gest.mode =
        Math.abs(dx) > Math.abs(dy)
          ? "seek"
          : gest.x - r.left < r.width / 2
            ? "bright"
            : "vol";
      gest.t0 = vid.currentTime;
      gest.v0 = prefs.volume;
      gest.b0 = P.bright;
      closeMenu();
    }
    if (gest.mode === "seek") {
      if (!isFinite(vid.duration)) return;
      gest.target = clamp(gest.t0 + (dx / r.width) * 150, 0, vid.duration);
      const diff = Math.round(gest.target - gest.t0);
      hud((diff >= 0 ? "+" : "−") + Math.abs(diff) + " s", T_(gest.target));
    } else if (gest.mode === "vol") {
      prefs.volume = clamp(gest.v0 - dy / (r.height * 0.7), 0, 1);
      prefs.muted = false;
      applyVol();
      hud("Volume", Math.round(prefs.volume * 100) + "%", prefs.volume);
    } else {
      P.bright = clamp(gest.b0 - dy / (r.height * 0.7), 0.25, 1.75);
      vid.style.filter = P.bright === 1 ? "" : `brightness(${P.bright})`;
      hud(
        "Brightness",
        Math.round(P.bright * 100) + "%",
        (P.bright - 0.25) / 1.5,
      );
    }
  });

  function endGesture(e, cancelled) {
    const g = gest;
    gest = null;
    if (!g || e.pointerId !== g.id) return;
    if (g.mode === "seek" && !cancelled && g.target !== undefined)
      seekTo(g.target);
    if (g.mode === "vol") saveVol();
    if (g.mode || cancelled || P.locked) return;
    onTap(e, g.touch);
  }

  stage.addEventListener("pointerup", (e) => endGesture(e, false));
  stage.addEventListener("pointercancel", (e) => endGesture(e, true));
  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      bumpVolume(e.deltaY < 0 ? 0.05 : -0.05);
    },
    { passive: false },
  );
  playerEl.addEventListener("pointermove", wake);
  playerEl.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) b.blur(); // so Space / Enter keep controlling the video, not the last button
  });

  $("#pplay").onclick = togglePlay;
  $("#pback").onclick = () => seekBy(-10);
  $("#pfwd").onclick = () => seekBy(10);
  $("#pmute").onclick = toggleMute;
  $("#pfit").onclick = cycleFit;
  $("#pfs").onclick = toggleFs;

  /* ----- opening / closing a video ----- */
  function resetPlayer() {
    P.token++;
    P.prepId++;
    P.tracks = null;
    P.aIdx = 0;
    P.sId = "";
    P.cues = [];
    P.delay = 0;
    P.fit = 0;
    P.bright = 1;
    vid.style.objectFit = "";
    vid.style.filter = "";
    leaveExt();
    setMsg("A", "");
    setMsg("S", "");
    closeMenu();
    tickSubs(true);
    updateTracksBtn();
    clearTimeout(tapTimer);
    if (P.locked) setLock(false);
    playerEl.classList.remove("idle");
    $("#ghud").hidden = true;
  }

  function leavePlayer() {
    resetPlayer();
    try {
      if (fsEl())
        (document.exitFullscreen || document.webkitExitFullscreen).call(
          document,
        );
      if (document.pictureInPictureElement) document.exitPictureInPicture();
    } catch {}
  }

  function showVid() {
    const it = pl.list[pl.i];

    resetPlayer();
    $("#viewer").hidden = true;
    $("#player").hidden = false;

    $("#ptitle").textContent = pretty(it);
    $("#pcount").textContent = pl.i + 1 + " / " + pl.list.length;

    $("#pprev").disabled = pl.i <= 0;
    $("#pnext").disabled = pl.i >= pl.list.length - 1;
    $("#pdl").href = it.url;
    $("#perr").hidden = true;

    const saved = store.get(posKey(it), null);

    vid.src = it.url;
    vid.defaultPlaybackRate = prefs.speed;
    vid.playbackRate = prefs.speed;
    applyVol();
    updatePlay();
    updateSpeed();
    paintSeek(0);
    paintBuf();
    $("#pdur").textContent = "0:00";
    spin(true);
    wake();

    vid.onloadedmetadata = () => {
      if (saved && saved.t > 5 && vid.duration && saved.t < vid.duration - 10) {
        vid.currentTime = saved.t;
        toast("Resumed from " + fmtTime(saved.t));
      }
    };

    vid.play().catch(() => {});
    loadTracks(it, P.token);
  }

  let lastSave = 0;

  vid.addEventListener("timeupdate", () => {
    const now = Date.now();

    if (now - lastSave < 4000 || !vid.duration || $("#player").hidden) {
      return;
    }

    lastSave = now;

    const it = pl.list[pl.i];

    if (it) {
      store.set(posKey(it), {
        t: vid.currentTime,
        d: vid.duration,
      });
    }
  });

  vid.addEventListener("ended", () => {
    const it = pl.list[pl.i];

    if (it) store.set(posKey(it), { t: 0, d: vid.duration });
    aud.pause();

    if (pl.i < pl.list.length - 1) {
      pl.i++;
      showVid();
    }
  });

  vid.addEventListener("error", () => {
    if ($("#player").hidden) return;

    spin(false);
    const e = $("#perr");
    e.hidden = false;

    e.textContent =
      "This browser can't play this file (usually HEVC video inside the MKV). Try the VLC button or download it.";
  });

  function stepVid(d) {
    const n = pl.i + d;

    if (n >= 0 && n < pl.list.length) {
      pl.i = n;
      showVid();
    }
  }

  $("#pprev").onclick = () => stepVid(-1);
  $("#pnext").onclick = () => stepVid(1);
  $("#pclose").onclick = closeOv;

  setIcons();

  function copyText(t) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(t);
        return true;
      }

      const a = document.createElement("textarea");
      a.value = t;
      a.style.position = "fixed";
      a.style.opacity = "0";

      document.body.appendChild(a);
      a.select();

      const ok = document.execCommand("copy");
      a.remove();

      return ok;
    } catch {
      return false;
    }
  }

  $("#pvlc").onclick = () => {
    const it = pl.list[pl.i];
    const u = new URL(it.url, location.href);
    const ua = navigator.userAgent;

    if (/Android/i.test(ua)) {
      location.href =
        "intent://" +
        u.host +
        u.pathname +
        "#Intent;scheme=http;package=org.videolan.vlc;type=video/*;end";
    } else if (/iPhone|iPad/i.test(ua)) {
      location.href =
        "vlc-x-callback://x-callback-url/stream?url=" +
        encodeURIComponent(u.href);
    } else {
      toast(
        copyText(u.href)
          ? "Link copied - in VLC: Media > Open Network Stream"
          : u.href,
      );
    }
  };

  /* ---------- Images ---------- */

  function showImg() {
    const it = pl.list[pl.i];

    $("#player").hidden = true;
    $("#viewer").hidden = false;

    vid.pause();
    // lighter 1600 px copy when there is one; a .heic original can't be shown by most browsers
    if (it.heic && !it.view) {
      $("#vimg").removeAttribute("src");
      toast(
        "This HEIC photo can't be shown - run: pip install pillow-heif (on the server PC)",
      );
    } else {
      $("#vimg").src = it.view || it.url;
    }
    $("#vorig").hidden = !it.view || !!it.heic;

    $("#vcap").textContent =
      it.name + "   (" + (pl.i + 1) + " / " + pl.list.length + ")";

    $("#vprev").hidden = pl.i <= 0;
    $("#vnext").hidden = pl.i >= pl.list.length - 1;

    [pl.i - 1, pl.i + 1].forEach((k) => {
      if (pl.list[k]) {
        const nb = pl.list[k];
        if (nb.kind !== "image" || (nb.heic && !nb.view)) return;
        const p = new Image();
        p.src = nb.view || nb.url;
      }
    });
  }

  function stepImg(d) {
    const n = pl.i + d;

    if (n >= 0 && n < pl.list.length) {
      pl.i = n;
      showImg();
    }
  }

  $("#vprev").onclick = () => stepImg(-1);
  $("#vnext").onclick = () => stepImg(1);
  $("#vclose").onclick = closeOv;

  $("#vorig").onclick = () => {
    const it = pl.list[pl.i];
    $("#vimg").src = it.url;
    $("#vorig").hidden = true;
    toast("Loading the original…");
  };

  $("#vimg").addEventListener("error", () => {
    const it = pl.list[pl.i];
    const cur = $("#vimg").getAttribute("src");
    if (it && cur && cur !== it.url && !it.heic) {
      $("#vimg").src = it.url; // the lighter copy failed: use the original
      $("#vorig").hidden = true;
    }
  });

  let sx = 0;
  let sy = 0;

  $("#viewer").addEventListener(
    "touchstart",
    (e) => {
      sx = e.changedTouches[0].clientX;
      sy = e.changedTouches[0].clientY;
    },
    { passive: true },
  );

  $("#viewer").addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;

      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        stepImg(dx < 0 ? 1 : -1);
      }
    },
    { passive: true },
  );

  /* ---------- Keyboard shortcuts ---------- */

  addEventListener("keydown", (e) => {
    if (!$("#player").hidden) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      let handled = true;

      wake();

      if (P.locked) {
        if (k === "Escape") showUnlock();
        return;
      }

      if (k === "Escape") {
        if (P.menu) closeMenu();
        else closeOv();
      } else if (k === "ArrowRight") seekBy(10);
      else if (k === "ArrowLeft") seekBy(-10);
      else if (k === "ArrowUp") bumpVolume(0.05);
      else if (k === "ArrowDown") bumpVolume(-0.05);
      else if (k === " " || k === "k" || k === "K") togglePlay();
      else if (k === "n" || k === "N") stepVid(1);
      else if (k === "p" || k === "P") stepVid(-1);
      else if (k === "f" || k === "F") toggleFs();
      else if (k === "m" || k === "M") toggleMute();
      else if (k === "c" || k === "C") cycleSub();
      else if (k === "a" || k === "A") cycleAudio();
      else if (k === "<" || k === ",") {
        const i = SPEEDS.indexOf(vid.playbackRate);
        setSpeed(SPEEDS[Math.max(0, (i < 0 ? 2 : i) - 1)]);
      } else if (k === ">" || k === ".") {
        const i = SPEEDS.indexOf(vid.playbackRate);
        setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + 1)]);
      } else handled = false;

      if (handled) e.preventDefault();
    } else if (!$("#viewer").hidden) {
      if (e.key === "Escape") closeOv();
      else if (e.key === "ArrowRight") stepImg(1);
      else if (e.key === "ArrowLeft") stepImg(-1);
    } else if (e.key === "/" && document.activeElement !== $("#q")) {
      e.preventDefault();
      $("#q").focus();
    }
  });

  render();
})();
