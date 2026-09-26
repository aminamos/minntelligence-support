// Embeddable support bubble. Usage on any page:
//   <script src="https://support.minntelligence.fyi/widget.js" data-support></script>
(function () {
  if (window.__supportWidget) return;
  window.__supportWidget = true;
  var API = new URL(document.currentScript && document.currentScript.src || "https://support.minntelligence.fyi/widget.js").origin;
  var KEY = "support-visitor-key";
  var CONV = "support-conversation-id";
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var css = document.createElement("style");
  css.textContent = [
    "#support-bubble{position:fixed;right:1rem;bottom:1rem;z-index:1000;font-family:Georgia,serif;}",
    "#support-fab{width:3rem;height:3rem;border-radius:50%;border:1px solid #1a1a1a;background:#f4f1ea;font-size:1.4rem;cursor:pointer;}",
    "#support-panel{display:none;width:20rem;max-width:calc(100vw - 2rem);border:1px solid #1a1a1a;border-radius:12px;background:#f4f1ea;margin-bottom:.5rem;overflow:hidden;}",
    "#support-panel.open{display:block;}",
    "#support-msgs{height:16rem;overflow-y:auto;padding:.6rem;background:#fff;}",
    "#support-msgs p{margin:0 0 .4rem;font-size:.95rem;}",
    "#support-msgs .agent{color:#0078bf;}",
    "#support-form{display:flex;border-top:1px solid #1a1a1a;}",
    "#support-input{flex:1;border:none;padding:.5rem;font:inherit;background:#fff;}",
    "#support-send{border:none;border-left:1px solid #1a1a1a;background:#f4f1ea;padding:0 .8rem;cursor:pointer;font:inherit;}",
    "#support-meta{display:flex;gap:.3rem;padding:.4rem .6rem;border-top:1px solid #ccc;}",
    "#support-meta input{flex:1;min-width:0;border:1px solid #ccc;border-radius:6px;padding:.25rem .4rem;font:inherit;font-size:.85rem;}"
  ].join("\n");
  document.head.appendChild(css);

  var wrap = document.createElement("div");
  wrap.id = "support-bubble";
  wrap.innerHTML = '<div id="support-panel" role="dialog" aria-label="Support chat">' +
    '<div id="support-msgs"></div>' +
    '<div id="support-meta"><input id="support-name" placeholder="Name (optional)" autocomplete="name">' +
    '<input id="support-email" placeholder="Email (optional)" autocomplete="email"></div>' +
    '<form id="support-form"><input id="support-input" placeholder="How can we help?" autocomplete="off">' +
    '<button id="support-send" type="submit">Send</button></form></div>' +
    '<button id="support-fab" aria-label="Open support chat">?</button>';
  document.body.appendChild(wrap);

  var fab = wrap.querySelector("#support-fab");
  var panel = wrap.querySelector("#support-panel");
  var msgs = wrap.querySelector("#support-msgs");
  var form = wrap.querySelector("#support-form");
  var input = wrap.querySelector("#support-input");
  var timer = null;

  function render(list) {
    msgs.innerHTML = list.map(function (m) {
      var who = m.sender === "agent" ? "agent" : "you";
      return '<p><strong class="' + who + '">' + esc(who) + ":</strong> " + esc(m.body) + "</p>";
    }).join("");
    msgs.scrollTop = msgs.scrollHeight;
  }

  function poll() {
    var id = store(CONV), key = store(KEY);
    if (!id || !key) return;
    fetch(API + "/api/conversations/" + encodeURIComponent(id) + "?key=" + encodeURIComponent(key))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.messages) render(d.messages); })
      .catch(function () {});
  }

  fab.addEventListener("click", function () {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) { poll(); timer = setInterval(poll, 5000); }
    else if (timer) { clearInterval(timer); timer = null; }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    var id = store(CONV), key = store(KEY);
    if (!id) {
      var name = wrap.querySelector("#support-name").value.trim();
      var email = wrap.querySelector("#support-email").value.trim();
      fetch(API + "/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, name: name, email: email, key: key }),
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (d && d.id) { store(CONV, d.id); if (d.key) store(KEY, d.key); poll(); }
      }).catch(function () {});
    } else {
      fetch(API + "/api/conversations/" + encodeURIComponent(id) + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key, body: text }),
      }).then(function () { poll(); }).catch(function () {});
    }
  });

  if (store(CONV)) poll();
})();
