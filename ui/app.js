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
    } else if (it.kind === "image") {
      th = `
        <div class="thumb">
          <img loading="lazy" decoding="async"
               src="${esc(it.url)}" alt="">
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
    $("#posterFile").value = "";

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
            No posters found. Try another title or upload an image.
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
          You can upload a local poster instead.
        </p>`;
    }
  });

  $("#posterUploadBtn").addEventListener("click", () => {
    const file = $("#posterFile").files[0];

    if (!file) return toast("Choose an image first");

    if (file.size > 5 * 1024 * 1024) {
      return toast("Poster must be 5 MB or smaller");
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return toast("Choose a JPG, PNG or WebP image");
    }

    const reader = new FileReader();

    reader.onload = () =>
      postPoster({ action: "upload", data_url: reader.result });

    reader.onerror = () => toast("Could not read that image");

    reader.readAsDataURL(file);
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

  /* ---------- Video and audio ---------- */

  function showVid() {
    const it = pl.list[pl.i];

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

    vid.onloadedmetadata = () => {
      if (saved && saved.t > 5 && vid.duration && saved.t < vid.duration - 10) {
        vid.currentTime = saved.t;
        toast("Resumed from " + fmtTime(saved.t));
      }
    };

    vid.play().catch(() => {});
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

    if (pl.i < pl.list.length - 1) {
      pl.i++;
      showVid();
    }
  });

  vid.addEventListener("error", () => {
    if ($("#player").hidden) return;

    const e = $("#perr");
    e.hidden = false;

    e.textContent =
      "This browser can't play this file (usually HEVC video or AC3/DTS audio inside the MKV). Try the VLC button or download it.";
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
    $("#vimg").src = it.url;

    $("#vcap").textContent =
      it.name + "   (" + (pl.i + 1) + " / " + pl.list.length + ")";

    $("#vprev").hidden = pl.i <= 0;
    $("#vnext").hidden = pl.i >= pl.list.length - 1;

    [pl.i - 1, pl.i + 1].forEach((k) => {
      if (pl.list[k]) {
        const p = new Image();
        p.src = pl.list[k].url;
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
      const k = e.key;
      let handled = true;

      if (k === "Escape") closeOv();
      else if (k === "ArrowRight") vid.currentTime += 10;
      else if (k === "ArrowLeft") vid.currentTime -= 10;
      else if (k === "n" || k === "N") stepVid(1);
      else if (k === "p" || k === "P") stepVid(-1);
      else if (k === " ") vid.paused ? vid.play() : vid.pause();
      else handled = false;

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
