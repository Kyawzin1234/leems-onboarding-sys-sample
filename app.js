(function () {
    const KEY = "leems-simple-v3";
    const DAY = 86400000;
    const MAX_FILE_BYTES = 400 * 1024;
    const STAGES = [
      { id: "todo",   name: "To Do",       help: "Not started yet" },
      { id: "wip",    name: "In Progress", help: "Working on it now" },
      { id: "hold",   name: "On Hold",     help: "Paused, with a reason" },
      { id: "review", name: "In Review",   help: "Waiting for a check" },
      { id: "done",   name: "Done",        help: "Checked and approved" }
    ];
    const PRIORITIES = [{ id: "high", name: "High" }, { id: "medium", name: "Medium" }, { id: "low", name: "Low" }];
    const ROLES = [{ id: "admin", name: "Admin" }, { id: "lead", name: "Team lead" }, { id: "member", name: "Member" }];
    const LEVELS = [{ id: "none", name: "None" }, { id: "read", name: "Read" }, { id: "write", name: "Write" }];
    const NEXT = {
      todo:   [["wip", "Start working"]],
      wip:    [["hold", "Put on hold"], ["review", "Send for review"]],
      hold:   [["wip", "Resume"]],
      review: [["wip", "Needs changes"]],
      done:   []
    };

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const stageOf = id => STAGES.find(s => s.id === id) || STAGES[0];
    const prioOf = id => PRIORITIES.find(p => p.id === id) || PRIORITIES[1];
    const prioRank = id => ({ high: 0, medium: 1, low: 2 }[id] ?? 1);
    const roleOf = id => ROLES.find(r => r.id === id) || ROLES[2];

    function ymd(d) {
      const z = n => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
    }
    const todayStr = () => ymd(new Date());
    const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
    const fmtDue = s => s ? new Date(s + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No due date";
    const fmtWhen = ms => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    function fmtMin(m) {
      m = Math.round(m || 0);
      const h = Math.floor(m / 60), r = m % 60;
      return h ? h + "h " + r + "m" : r + "m";
    }
    const isOverdue = t => !!t.due && t.stage !== "done" && t.due < todayStr();
    const uid = p => p + Math.random().toString(36).slice(2, 8);

    function toast(msg) {
      const t = $("#toast");
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(toast._t);
      toast._t = setTimeout(() => t.classList.remove("show"), 2600);
    }

    // ---------- Data ----------
    function seed() {
      const now = Date.now();
      const projects = [{ id: "p-internship", name: "Internship" }];
      const members = [
        { id: "kh", name: "Kyaw Zin Hein", initials: "KH", role: "admin" },
        { id: "nt", name: "Member NT", initials: "NT", role: "lead" },
        { id: "is", name: "Member IS", initials: "IS", role: "member" },
        { id: "am", name: "Member AM", initials: "AM", role: "member" },
        { id: "ps", name: "Member PS", initials: "PS", role: "member" }
      ];
      const access = {
        "p-internship": { nt: "write", is: "write", am: "read", ps: "none" }
      };
      const rows = [
        ["T-200", "Redesign LEEMS Performance Panel", "review", "high", "kh", 2, 141],
        ["T-143", "Submit GitHub Profile & Frontend Projects", "review", "high", "kh", -1, 39],
        ["T-300", "LEEMS Onboarding System: UI/UX Design", "hold", "medium", "kh", 5, 0],
        ["T-299", "Digital Marketing Campaign Execution", "todo", "low", "kh", 7, 196],
        ["T-002", "LEEMS Training", "done", "low", "kh", -3, 10]
      ];
      const tasks = rows.map(([id, title, stage, priority, assignee, dueOff, minutes]) => {
        const created = now - 10 * DAY;
        const history = [{ at: created, type: "create", by: "kh", byName: "Kyaw Zin Hein", to: "todo" }];
        if (stage !== "todo") {
          history.push({ at: now - 2 * DAY, type: "move", by: "kh", byName: "Kyaw Zin Hein", from: "todo", to: stage,
            note: stage === "hold" ? "Discussing the scope with the team" : "" });
        }
        return { id, title, project: "p-internship", stage, priority, assignee, due: addDays(dueOff),
          minutes, createdAt: created, history, attachments: [] };
      });
      return { version: 3, currentUser: "kh", members, projects, access, tasks };
    }
    function load() {
      try {
        const s = JSON.parse(localStorage.getItem(KEY));
        if (s && Array.isArray(s.tasks) && Array.isArray(s.members) && Array.isArray(s.projects)) return s;
      } catch (e) {}
      return seed();
    }
    let state = load();
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { toast("Storage is full. Remove some files or export a backup."); }
    }

    // ---------- Lookups and permissions ----------
    const memberOf = id => state.members.find(m => m.id === id);
    const nameOf = id => (memberOf(id) ? memberOf(id).name : "Unassigned");
    const projectOf = id => state.projects.find(p => p.id === id);
    const projectName = id => (projectOf(id) ? projectOf(id).name : "No project");
    const me = () => memberOf(state.currentUser) || state.members[0];
    const isAdmin = () => me().role === "admin";
    const isLeadPlus = () => me().role === "admin" || me().role === "lead";

    function access(projectId, memberId) {
      const m = memberOf(memberId || state.currentUser);
      if (!m) return "none";
      if (m.role === "admin") return "write";
      return (state.access[projectId] && state.access[projectId][m.id]) || "none";
    }
    const canSee = t => access(t.project) !== "none";
    const canWrite = t => access(t.project) === "write";
    const visibleTasks = () => state.tasks.filter(canSee);
    const writableProjects = () => state.projects.filter(p => access(p.id) === "write");

    function addHistory(t, entry) {
      t.history.push({ at: Date.now(), by: state.currentUser, byName: me().name, ...entry });
    }

    function describe(h) {
      if (h.type === "create") return "created this task in " + esc(stageOf(h.to).name);
      if (h.type === "assign") return "assigned it to " + esc(nameOf(h.to));
      if (h.type === "rename") return "renamed it to " + esc(h.to);
      if (h.type === "attach") return "attached " + esc(h.to);
      if (h.type === "detach") return "removed " + esc(h.to);
      if (h.type === "link") return "added a link: " + esc(h.to);
      return "moved it from " + esc(stageOf(h.from).name) + " to " + esc(stageOf(h.to).name);
    }
    const whoName = h => memberOf(h.by) ? memberOf(h.by).name : (h.byName || "Someone");

    const memberOptions = selected => state.members
      .map(m => `<option value="${esc(m.id)}"${m.id === selected ? " selected" : ""}>${esc(m.name)}</option>`).join("");
    const avatar = id => {
      const m = memberOf(id);
      return `<span class="avatar" title="${esc(nameOf(id))}">${esc(m ? m.initials : "?")}</span>`;
    };

    // ---------- Filters ----------
    const F = { q: "", stage: "all", priority: "all", assignee: "me" };
    const AF = { q: "", person: "all" };

    function matchesTask(f, t) {
      const q = f.q.trim().toLowerCase();
      if (q && !(t.title + " " + t.id + " " + projectName(t.project)).toLowerCase().includes(q)) return false;
      if (f.stage !== "all" && t.stage !== f.stage) return false;
      if (f.priority !== "all" && t.priority !== f.priority) return false;
      if (f.assignee === "me" && t.assignee !== state.currentUser) return false;
      if (f.assignee !== "me" && f.assignee !== "all" && t.assignee !== f.assignee) return false;
      return true;
    }

    function buildFormSelects() {
      $("#f-stage").innerHTML = '<option value="all">All stages</option>' +
        STAGES.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
      $("#f-priority").innerHTML = '<option value="all">Any priority</option>' +
        PRIORITIES.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
      $("#f-assignee").innerHTML = '<option value="me">Assigned to me</option><option value="all">Everyone</option>' +
        state.members.filter(m => m.id !== state.currentUser)
          .map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
      const wp = writableProjects();
      $("#n-project").innerHTML = wp.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
      $("#n-priority").innerHTML = PRIORITIES.map(p => `<option value="${p.id}"${p.id === "medium" ? " selected" : ""}>${esc(p.name)}</option>`).join("");
      $("#n-assignee").innerHTML = memberOptions(state.currentUser);
      $("#a-person").innerHTML = '<option value="all">Everyone</option>' +
        state.members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
      $("#acting-as").innerHTML = state.members.map(m =>
        `<option value="${esc(m.id)}"${m.id === state.currentUser ? " selected" : ""}>${esc(m.name)} (${roleOf(m.role).name})</option>`).join("");
      $("#add-open-btn").hidden = wp.length === 0;
      syncFilterInputs();
    }
    function syncFilterInputs() {
      $("#f-q").value = F.q;
      $("#f-stage").value = F.stage;
      $("#f-priority").value = F.priority;
      $("#f-assignee").value = F.assignee;
      $("#a-q").value = AF.q;
      $("#a-person").value = AF.person;
    }

    // ---------- Task actions ----------
    function moveTask(id, to) {
      const t = state.tasks.find(x => x.id === id);
      if (!t || t.stage === to) return;
      if (!canWrite(t)) { toast("You have read-only access to this project"); return; }
      let note = "";
      if (to === "hold") {
        note = (prompt("What is blocking this task? A short reason is required.") || "").trim();
        if (!note) { toast("A reason is needed to put a task on hold"); return; }
      }
      const from = t.stage;
      t.stage = to;
      addHistory(t, { type: "move", from, to, note });
      save();
      toast("Moved to " + stageOf(to).name);
      renderAll();
    }

    function reassign(id, memberId) {
      const t = state.tasks.find(x => x.id === id);
      if (!t || t.assignee === memberId || !canWrite(t)) return;
      t.assignee = memberId;
      addHistory(t, { type: "assign", to: memberId });
      save();
      toast("Assigned to " + nameOf(memberId));
      renderAll();
    }

    function renameTask(id) {
      const t = state.tasks.find(x => x.id === id);
      if (!t || !canWrite(t)) return;
      const name = (prompt("New name for this task", t.title) || "").trim();
      if (!name || name === t.title) return;
      t.title = name;
      addHistory(t, { type: "rename", to: name });
      save();
      toast("Task renamed");
      renderAll();
    }

    function deleteTask(id) {
      const t = state.tasks.find(x => x.id === id);
      if (!t || !canWrite(t) || !confirm('Delete "' + t.title + '"? This cannot be undone.')) return;
      state.tasks = state.tasks.filter(x => x.id !== id);
      save();
      toast("Task deleted");
      renderAll();
    }

    function createTask() {
      const title = $("#n-title").value.trim();
      if (!title) { toast("Give the task a name first"); return; }
      const project = $("#n-project").value;
      if (access(project) !== "write") { toast("You need write access to add tasks here"); return; }
      const now = Date.now();
      const nums = state.tasks.map(t => parseInt(String(t.id).replace(/\D/g, ""), 10) || 0);
      const id = "T-" + String(Math.max(0, ...nums) + 1).padStart(3, "0");
      state.tasks.push({
        id, title, project, stage: "todo",
        priority: $("#n-priority").value, assignee: $("#n-assignee").value,
        due: $("#n-due").value || "", minutes: 0, createdAt: now, attachments: [],
        history: [{ at: now, type: "create", by: state.currentUser, byName: me().name, to: "todo" }]
      });
      save();
      $("#n-title").value = "";
      $("#n-due").value = "";
      $("#add-form").hidden = true;
      toast("Task added to To Do");
      renderAll();
    }

    // ---------- Files and links ----------
    let attachTarget = null;

    function attachmentsHTML(t) {
      if (!t.attachments || !t.attachments.length) return "";
      return '<ul class="atts">' + t.attachments.map(a => {
        const label = a.link
          ? `<a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">${esc(a.name)}</a>`
          : (a.dataUrl ? `<a href="${a.dataUrl}" download="${esc(a.name)}">${esc(a.name)}</a>` : esc(a.name));
        const icon = a.link ? "🔗" : "📎";
        const rm = canWrite(t)
          ? `<button class="btn btn-small btn-ghost btn-danger" data-rm-att="${esc(t.id)}" data-att="${esc(a.id)}">Remove</button>` : "";
        return `<li><span>${icon} ${label}</span>${rm}</li>`;
      }).join("") + "</ul>";
    }

    function addAttachment(t, att, note) {
      t.attachments.push(att);
      addHistory(t, { type: att.link ? "link" : "attach", to: att.name });
      save();
      toast(note || "Added");
      renderAll();
    }

    function onFilePicked(file) {
      const t = state.tasks.find(x => x.id === attachTarget);
      attachTarget = null;
      if (!t || !file || !canWrite(t)) return;
      const base = { id: uid("a"), name: file.name, size: file.size, addedBy: state.currentUser, at: Date.now() };
      if (file.size > MAX_FILE_BYTES) {
        addAttachment(t, { ...base, dataUrl: null, note: "too large to store" },
          "File is over 400 KB, so only its name was saved. Use a link for big files.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => addAttachment(t, { ...base, dataUrl: reader.result }, "File attached");
      reader.readAsDataURL(file);
    }

    function addLink(t) {
      const url = (prompt("Paste the link (it must start with https:// or http://)") || "").trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) { toast("Links must start with http:// or https://"); return; }
      addAttachment(t, { id: uid("a"), name: url, link: url, addedBy: state.currentUser, at: Date.now() }, "Link added");
    }

    function removeAttachment(taskId, attId) {
      const t = state.tasks.find(x => x.id === taskId);
      if (!t || !canWrite(t)) return;
      const a = t.attachments.find(x => x.id === attId);
      if (!a || !confirm('Remove "' + a.name + '"?')) return;
      t.attachments = t.attachments.filter(x => x.id !== attId);
      addHistory(t, { type: "detach", to: a.name });
      save();
      toast("Removed");
      renderAll();
    }

    // ---------- Team and access ----------
    function addMember(name) {
      if (!isLeadPlus()) { toast("Only admins or team leads can add people"); return; }
      name = name.trim();
      if (!name) { toast("Type a name first"); return; }
      const id = uid("m");
      const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
      state.members.push({ id, name, initials, role: "member" });
      state.projects.forEach(p => {
        state.access[p.id] = state.access[p.id] || {};
        state.access[p.id][id] = "read";
      });
      save();
      $("#m-name").value = "";
      buildFormSelects();
      toast(name + " added as a member with read access");
      renderAll();
    }

    function removeMember(id) {
      if (!isLeadPlus()) { toast("Only admins or team leads can remove people"); return; }
      const m = memberOf(id);
      if (!m || id === state.currentUser) { toast("You cannot remove yourself"); return; }
      if (m.role === "admin" && state.members.filter(x => x.role === "admin").length === 1) {
        toast("There must always be at least one admin"); return;
      }
      if (!confirm("Remove " + m.name + " from the team? Their tasks will become unassigned.")) return;
      state.tasks.forEach(t => {
        if (t.assignee === id) {
          t.assignee = "";
          addHistory(t, { type: "assign", to: "" });
        }
      });
      state.members = state.members.filter(x => x.id !== id);
      Object.keys(state.access).forEach(p => delete state.access[p][id]);
      save();
      buildFormSelects();
      toast(m.name + " removed");
      renderAll();
    }

    function setRole(id, role) {
      if (!isAdmin()) { toast("Only admins can change roles"); return; }
      const m = memberOf(id);
      if (!m || m.role === role) return;
      if (m.role === "admin" && role !== "admin" && state.members.filter(x => x.role === "admin").length === 1) {
        toast("There must always be at least one admin"); renderAccess(); return;
      }
      m.role = role;
      save();
      toast(m.name + " is now " + roleOf(role).name);
      renderAll();
    }

    function setAccess(projectId, memberId, level) {
      if (!isLeadPlus()) { toast("Only admins or team leads can change access"); renderAccess(); return; }
      state.access[projectId] = state.access[projectId] || {};
      state.access[projectId][memberId] = level;
      save();
      toast("Access updated");
      renderAll();
    }

    function addProject(name) {
      if (!isAdmin()) { toast("Only admins can add projects"); return; }
      name = name.trim();
      if (!name) { toast("Type a project name first"); return; }
      const id = uid("p-");
      state.projects.push({ id, name });
      state.access[id] = {};
      state.members.forEach(m => { if (m.role !== "admin") state.access[id][m.id] = "none"; });
      save();
      $("#p-name").value = "";
      buildFormSelects();
      toast("Project added");
      renderAll();
    }

    function removeProject(id) {
      if (!isAdmin()) { toast("Only admins can remove projects"); return; }
      const count = state.tasks.filter(t => t.project === id).length;
      if (count) { toast("This project still has " + count + " task(s). Delete or move them first."); return; }
      const p = projectOf(id);
      if (!p || !confirm('Remove project "' + p.name + '"?')) return;
      state.projects = state.projects.filter(x => x.id !== id);
      delete state.access[id];
      save();
      buildFormSelects();
      toast("Project removed");
      renderAll();
    }

    // ---------- Rendering ----------
    const openHist = new Set();

    function historyHTML(t) {
      if (!t.history.length) return '<p class="meta">No history yet.</p>';
      return '<ol class="hist">' + t.history.slice().reverse().map(h =>
        `<li><strong>${esc(whoName(h))}</strong> ${describe(h)}<span class="when">${fmtWhen(h.at)}</span>` +
        (h.note ? `<div class="note">"${esc(h.note)}"</div>` : "") + "</li>"
      ).join("") + "</ol>";
    }

    function taskCard(t) {
      const s = stageOf(t.stage);
      const write = canWrite(t);
      const buttons = write ? (NEXT[t.stage] || []).map(([to, label]) => {
        const primary = to === "review" || (to === "wip" && t.stage === "todo");
        return `<button class="btn btn-small${primary ? " btn-primary" : ""}" data-move="${esc(t.id)}" data-to="${to}">${esc(label)}</button>`;
      }).join("") : "";
      const over = isOverdue(t);
      const open = openHist.has(t.id);
      const writeTools = write ? `
          <button class="btn btn-small btn-ghost" data-edit="${esc(t.id)}">Rename</button>
          <button class="btn btn-small btn-ghost" data-attach="${esc(t.id)}">Attach file</button>
          <button class="btn btn-small btn-ghost" data-link="${esc(t.id)}">Add link</button>
          <button class="btn btn-small btn-ghost btn-danger" data-del="${esc(t.id)}">Delete</button>` : "";
      return `
        <article class="task" draggable="${write}" data-drag="${esc(t.id)}">
          <div class="task-top">
            <span class="chip ${t.stage}">${esc(s.name)}</span>
            <span class="pri ${t.priority}">${esc(prioOf(t.priority).name)}</span>
            <span class="chip">${esc(projectName(t.project))}</span>
            ${write ? "" : '<span class="readonly">Read only</span>'}
          </div>
          <h4>${esc(t.title)}</h4>
          <div class="meta">${esc(t.id)} · ${fmtMin(t.minutes)} logged · <span class="due${over ? " over" : ""}">Due ${esc(fmtDue(t.due))}${over ? " (overdue)" : ""}</span></div>
          <div class="assign-row">
            ${avatar(t.assignee)}
            ${write
              ? `<select class="mini-select" data-assign="${esc(t.id)}" aria-label="Assign to">${memberOptions(t.assignee)}</select>`
              : `<span class="meta">${esc(nameOf(t.assignee))}</span>`}
          </div>
          <div class="moves">
            ${buttons || (write ? '<span class="meta">Finished. Nothing else to do.</span>' : "")}
            ${writeTools}
            <button class="btn btn-small btn-ghost" data-hist="${esc(t.id)}">${open ? "Hide history" : "History"}</button>
          </div>
          ${attachmentsHTML(t)}
          ${open ? historyHTML(t) : ""}
        </article>`;
    }

    function sortTasks(list) {
      const order = STAGES.map(s => s.id);
      return list.slice().sort((a, b) =>
        order.indexOf(a.stage) - order.indexOf(b.stage) || prioRank(a.priority) - prioRank(b.priority));
    }

    function renderTasks() {
      const list = sortTasks(visibleTasks().filter(t => matchesTask(F, t)));
      $("#task-list").innerHTML = list.length
        ? list.map(taskCard).join("")
        : '<p class="empty">No tasks match these filters. Try "Everyone", clear the search, or ask a lead for access.</p>';
      $("#count-tasks").textContent = list.length + " of " + visibleTasks().length + " tasks you can see";
    }

    function renderBoard() {
      const f = { ...F, stage: "all" };
      $("#board").innerHTML = STAGES.map(s => {
        const items = sortTasks(visibleTasks().filter(t => t.stage === s.id && matchesTask(f, t)));
        return `
          <div class="col" data-stage="${s.id}">
            <div class="col-head"><h3>${esc(s.name)}</h3><span class="chip">${items.length}</span></div>
            <div class="col-help">${esc(s.help)}</div>
            ${items.length ? items.map(taskCard).join("") : '<p class="empty">Nothing here</p>'}
          </div>`;
      }).join("");
      bindBoardDrag();
    }

    function renderHome() {
      $("#hello").textContent = "Hello, " + me().name.split(" ")[0] + " 👋";
      const mine = state.tasks.filter(t => t.assignee === state.currentUser && canSee(t));
      const done = mine.filter(t => t.stage === "done").length;
      const pct = mine.length ? Math.round(done / mine.length * 100) : 0;
      $("#stat-total").textContent = mine.length;
      $("#stat-done").textContent = done;
      $("#stat-review").textContent = mine.filter(t => t.stage === "review").length;
      $("#stat-over").textContent = mine.filter(isOverdue).length;
      $("#stat-time").textContent = fmtMin(mine.reduce((a, t) => a + t.minutes, 0));
      $("#progress-text").innerHTML = `<strong>${done} of ${mine.length}</strong> of your tasks are finished (${pct}%).`;
      $("#progress-bar").style.width = pct + "%";
      $("#home-team").innerHTML = state.members.map(m => {
        const ts = visibleTasks().filter(t => t.assignee === m.id);
        const d = ts.filter(t => t.stage === "done").length;
        return `<div class="list-row">${avatar(m.id)}<div class="grow"><strong>${esc(m.name)}</strong>
          <div class="meta">${ts.length - d} open · ${d} done</div></div></div>`;
      }).join("");
    }

    function renderTeam() {
      $("#team-add-card").hidden = !isLeadPlus();
      $("#team-grid").innerHTML = state.members.map(m => {
        const ts = visibleTasks().filter(t => t.assignee === m.id);
        const d = ts.filter(t => t.stage === "done").length;
        const over = ts.filter(isOverdue).length;
        const pct = ts.length ? Math.round(d / ts.length * 100) : 0;
        const remove = isLeadPlus() && m.id !== state.currentUser
          ? `<button class="btn btn-small btn-ghost btn-danger" data-remove-member="${esc(m.id)}">Remove</button>` : "";
        return `
          <div class="card">
            <div class="row team-card-header">
              <div class="row">${avatar(m.id)}<h3 class="team-card-title">${esc(m.name)}</h3></div>
              <span class="chip ${m.role}">${roleOf(m.role).name}</span>
            </div>
            <p class="meta team-card-meta">${ts.length - d} open · ${d} done · ${over} overdue</p>
            <div class="bar"><span style="width:${pct}%"></span></div>
            <p class="stat-hint-note">${pct}% of the work you can see is finished</p>
            <div class="team-card-actions">${remove}</div>
          </div>`;
      }).join("");
    }

    function renderAccess() {
      const notice = $("#access-notice");
      notice.innerHTML = isLeadPlus() ? "" :
        '<div class="notice">You are a member. You can see access settings, but only admins and team leads can change them.</div>';

      $("#roles-body").innerHTML = state.members.map(m => `
        <tr>
          <td>${avatar(m.id)} ${esc(m.name)}</td>
          <td>${isAdmin() && m.id !== state.currentUser
            ? `<select data-role="${esc(m.id)}" aria-label="Role for ${esc(m.name)}">${ROLES.map(r => `<option value="${r.id}"${r.id === m.role ? " selected" : ""}>${r.name}</option>`).join("")}</select>`
            : `<span class="chip ${m.role}">${roleOf(m.role).name}</span>`}</td>
          <td class="meta">${m.id === state.currentUser ? "You" : ""}</td>
        </tr>`).join("");

      $("#access-head").innerHTML = "<tr><th>Person</th>" +
        state.projects.map(p => `<th>${esc(p.name)}</th>`).join("") + "</tr>";

      $("#access-body").innerHTML = state.members.map(m => `
        <tr>
          <td>${esc(m.name)}</td>
          ${state.projects.map(p => {
            if (m.role === "admin") return '<td><span class="chip admin">Full</span></td>';
            const current = (state.access[p.id] && state.access[p.id][m.id]) || "none";
            return isLeadPlus()
              ? `<td><select data-access-project="${esc(p.id)}" data-access-member="${esc(m.id)}" aria-label="${esc(m.name)} access to ${esc(p.name)}">${LEVELS.map(l => `<option value="${l.id}"${l.id === current ? " selected" : ""}>${l.name}</option>`).join("")}</select></td>`
              : `<td>${esc(LEVELS.find(l => l.id === current).name)}</td>`;
          }).join("")}
        </tr>`).join("");

      $("#projects-list").innerHTML = state.projects.length ? state.projects.map(p => {
        const count = state.tasks.filter(t => t.project === p.id).length;
        return `<div class="list-row"><div class="grow"><strong>${esc(p.name)}</strong><div class="meta">${count} task(s)</div></div>
          ${isAdmin() ? `<button class="btn btn-small btn-ghost btn-danger" data-remove-project="${esc(p.id)}">Remove</button>` : ""}</div>`;
      }).join("") : '<p class="empty">No projects yet.</p>';
      $("#project-add-row").hidden = !isAdmin();
    }

    function renderActivity() {
      const rows = [];
      visibleTasks().forEach(t => t.history.forEach(h => rows.push({ t, h })));
      rows.sort((a, b) => b.h.at - a.h.at);
      const q = AF.q.trim().toLowerCase();
      const list = rows.filter(({ t, h }) =>
        (AF.person === "all" || h.by === AF.person) &&
        (!q || (t.title + " " + t.id).toLowerCase().includes(q)));
      $("#activity-list").innerHTML = list.length
        ? '<ol class="feed">' + list.slice(0, 200).map(({ t, h }) => `
            <li>${avatar(h.by)}
              <div class="grow">
                <div><strong>${esc(whoName(h))}</strong> ${describe(h)}<span class="task-ref">${esc(t.id)}</span></div>
                <div class="when activity-subline">${esc(t.title)} · ${fmtWhen(h.at)}</div>
                ${h.note ? `<div class="note">"${esc(h.note)}"</div>` : ""}
              </div>
            </li>`).join("") + "</ol>"
        : '<p class="empty">No activity matches these filters.</p>';
      $("#activity-count").textContent = list.length + " events";
    }

    function renderMetrics() {
      const all = visibleTasks();
      const total = all.length;
      const done = all.filter(t => t.stage === "done").length;
      const pct = total ? Math.round(done / total * 100) : 0;
      $("#ring-fg").setAttribute("stroke-dasharray", (pct * 3.27).toFixed(1) + " 327");
      $("#ring-text").textContent = pct + "%";
      $("#m-total").textContent = total;
      $("#m-done").textContent = done;
      $("#m-over").textContent = all.filter(isOverdue).length;

      const cycle = all.map(t => {
        const d = t.history.find(h => h.type === "move" && h.to === "done");
        return d ? (d.at - t.createdAt) / DAY : null;
      }).filter(x => x !== null);
      $("#m-cycle").textContent = cycle.length
        ? (cycle.reduce((a, b) => a + b, 0) / cycle.length).toFixed(1) + " days"
        : "No finished tasks yet";

      $("#m-stages").innerHTML = STAGES.map(s => {
        const n = all.filter(t => t.stage === s.id).length;
        const w = total ? Math.round(n / total * 100) : 0;
        return `<div class="bar-row"><span class="bar-label">${esc(s.name)}</span><div class="bar"><span style="width:${w}%"></span></div><strong>${n}</strong></div>`;
      }).join("");

      $("#m-people").innerHTML = state.members.map(m => {
        const ts = all.filter(t => t.assignee === m.id);
        const d = ts.filter(t => t.stage === "done").length;
        const w = ts.length ? Math.round(d / ts.length * 100) : 0;
        return `<div class="bar-row"><span class="bar-label">${esc(m.name)}</span><div class="bar"><span style="width:${w}%"></span></div><strong>${d}/${ts.length}</strong></div>`;
      }).join("");

      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d);
      }
      const counts = days.map(day => {
        const start = day.getTime(), end = start + DAY;
        return all.reduce((n, t) => n + t.history.filter(h => h.type === "move" && h.to === "done" && h.at >= start && h.at < end).length, 0);
      });
      const max = Math.max(1, ...counts);
      $("#m-week").innerHTML = days.map((day, i) => `
        <div class="wk">
          <div class="wk-track"><div class="wk-bar" style="height:${Math.round(counts[i] / max * 100)}%" title="${counts[i]} finished"></div></div>
          <span>${day.toLocaleDateString(undefined, { weekday: "short" })}</span>
          <strong>${counts[i]}</strong>
        </div>`).join("");
    }

    function renderAll() {
      buildFormSelects();
      renderHome();
      renderTasks();
      renderBoard();
      renderTeam();
      renderAccess();
      renderActivity();
      renderMetrics();
    }

    // ---------- Drag and drop on the board ----------
    let draggedId = null;
    function bindBoardDrag() {
      const board = $("#board"); $$("[data-drag]", board).forEach(card => {
        card.addEventListener("dragstart", e => {
          if (card.getAttribute("draggable") !== "true") { e.preventDefault(); return; }
          draggedId = card.dataset.drag;
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", draggedId);
        });
        card.addEventListener("dragend", () => {
          draggedId = null;
          card.classList.remove("dragging");
          $$(".col", board).forEach(c => c.classList.remove("drop-over")); }); }); $$
(".col", board).forEach(col => {
        col.addEventListener("dragover", e => {
          if (!draggedId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          col.classList.add("drop-over");
        });
        col.addEventListener("dragleave", e => {
          if (!col.contains(e.relatedTarget)) col.classList.remove("drop-over");
        });
        col.addEventListener("drop", e => {
          e.preventDefault();
          col.classList.remove("drop-over");
          const id = draggedId || e.dataTransfer.getData("text/plain");
          moveTask(id, col.dataset.stage);
        });
      });
    }

    // ---------- Navigation ----------
    function showPage(name) {
      $$(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + name)); $$
(".nav-btn").forEach(b => {
        if (b.dataset.page === name) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      const bar = $("#filter-bar");
      const slot = name === "tasks" ? $("#slot-tasks") : name === "board" ? $("#slot-board") : null;
      if (slot) { slot.appendChild(bar); bar.hidden = false; }
      else bar.hidden = true;
      bar.classList.toggle("no-stage", name === "board");
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderAll();
    }

    // ---------- Export and import ----------
    function download(name, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function toCSV() {
      const cols = ["ID", "Title", "Project", "Stage", "Priority", "Assigned to", "Due", "Minutes logged", "Attachments", "Created"];
      const rows = visibleTasks().map(t => [
        t.id, t.title, projectName(t.project), stageOf(t.stage).name, prioOf(t.priority).name,
        nameOf(t.assignee), t.due || "", t.minutes, (t.attachments || []).length, ymd(new Date(t.createdAt))
      ]);
      return [cols, ...rows]
        .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(","))
        .join("\n");
    }

    // ---------- Events ----------
    document.addEventListener("click", e => {
      const t = e.target;
      const go = t.closest("[data-go]");
      if (go) { e.preventDefault(); showPage(go.dataset.go); return; }
      const nav = t.closest(".nav-btn");
      if (nav) { showPage(nav.dataset.page); return; }
      const mv = t.closest("[data-move]");
      if (mv) { moveTask(mv.dataset.move, mv.dataset.to); return; }
      const ed = t.closest("[data-edit]");
      if (ed) { renameTask(ed.dataset.edit); return; }
      const del = t.closest("[data-del]");
      if (del) { deleteTask(del.dataset.del); return; }
      const att = t.closest("[data-attach]");
      if (att) {
        attachTarget = att.dataset.attach;
        const input = $("#att-file");
        input.value = "";
        input.click();
        return;
      }
      const link = t.closest("[data-link]");
      if (link) {
        const task = state.tasks.find(x => x.id === link.dataset.link);
        if (task && canWrite(task)) addLink(task);
        return;
      }
      const rma = t.closest("[data-rm-att]");
      if (rma) { removeAttachment(rma.dataset.rmAtt, rma.dataset.att); return; }
      const hi = t.closest("[data-hist]");
      if (hi) {
        const id = hi.dataset.hist;
        openHist.has(id) ? openHist.delete(id) : openHist.add(id);
        renderAll();
        return;
      }
      const rmm = t.closest("[data-remove-member]");
      if (rmm) { removeMember(rmm.dataset.removeMember); return; }
      const rmp = t.closest("[data-remove-project]");
      if (rmp) { removeProject(rmp.dataset.removeProject); return; }
      if (t.closest("[data-add-open]")) {
        const f = $("#add-form");
        f.hidden = !f.hidden;
        if (!f.hidden) $("#n-title").focus();
        return;
      }
      const ex = t.closest("[data-export]");
      if (ex) {
        const kind = ex.dataset.export;
        if (kind === "csv") download("leems-tasks-" + todayStr() + ".csv", "﻿" + toCSV(), "text/csv;charset=utf-8");
        if (kind === "json") download("leems-backup-" + todayStr() + ".json", JSON.stringify(state, null, 2), "application/json");
        if (kind === "print") window.print();
        return;
      }
      if (t.closest("[data-import]")) { $("#import-file").click(); return; }
      if (t.closest("#f-clear")) {
        Object.assign(F, { q: "", stage: "all", priority: "all", assignee: "me" });
        syncFilterInputs();
        renderAll();
        return;
      }
      if (t.closest("#n-save")) { createTask(); return; }
      if (t.closest("#m-add")) { addMember($("#m-name").value); return; }
      if (t.closest("#p-add")) { addProject($("#p-name").value); return; }
    });

    document.addEventListener("change", e => {
      const el = e.target;
      if (el.matches("[data-assign]")) reassign(el.dataset.assign, el.value);
      else if (el.matches("[data-role]")) setRole(el.dataset.role, el.value);
      else if (el.matches("[data-access-project]")) setAccess(el.dataset.accessProject, el.dataset.accessMember, el.value);
      else if (el.id === "acting-as") {
        state.currentUser = el.value;
        save();
        toast("Now viewing as " + me().name);
        renderAll();
      }
    });

    $("#att-file").addEventListener("change", e => onFilePicked(e.target.files[0]));
    $("#m-name").addEventListener("keydown", e => { if (e.key === "Enter") addMember(e.target.value); });
    $("#p-name").addEventListener("keydown", e => { if (e.key === "Enter") addProject(e.target.value); });
    $("#n-title").addEventListener("keydown", e => { if (e.key === "Enter") createTask(); });

    ["f-q", "f-stage", "f-priority", "f-assignee"].forEach(id => {
      $("#" + id).addEventListener("input", () => {
        F.q = $("#f-q").value;
        F.stage = $("#f-stage").value;
        F.priority = $("#f-priority").value;
        F.assignee = $("#f-assignee").value;
        renderTasks();
        renderBoard();
      });
    });
    ["a-q", "a-person"].forEach(id => {
      $("#" + id).addEventListener("input", () => {
        AF.q = $("#a-q").value;
        AF.person = $("#a-person").value;
        renderActivity();
      });
    });

    $("#import-file").addEventListener("change", async e => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.tasks) || !Array.isArray(data.members) || !Array.isArray(data.projects)) throw new Error("bad");
        if (!confirm("Replace everything on this device with this backup?")) return;
        state = data;
        if (!memberOf(state.currentUser)) state.currentUser = state.members[0].id;
        save();
        toast("Backup restored");
        renderAll();
      } catch (err) {
        toast("That file is not a LEEMS backup");
      }
    });

    // ---------- Guided tour ----------
    const TOUR_KEY = "leems-tour-done-v1";
    const TOUR = [
      { page: "home", target: ".nav", title: "Your menu", text: "These buttons take you to every part of LEEMS. Start here and explore." },
      { page: "home", target: "#stat-total", title: "Your numbers", text: "These cards show your tasks, what is finished, and what is waiting for review." },
      { page: "tasks", target: "#task-list .task .moves button", title: "Move a task forward", text: "Press a button on a card to move it. Use History to see what happened." },
      { page: "tasks", target: "#filter-bar #f-q", title: "Search and filter", text: "Type a name to search, or use the drop-downs to narrow the list." },
      { page: "tasks", target: "#add-open-btn", title: "Add a task", text: "Press here, type a short name, and it lands in To Do." },
      { page: "board", target: "#board .col", title: "The Task Board", text: "Drag a card to another column to change its stage. You can only move tasks you can write to." },
      { page: "team", target: "#team-grid", title: "Your team", text: "See who is on the team. Admins and team leads can add or remove people here." },
      { page: "access", target: "#page-access .card", title: "Access", text: "Admins set roles. Leads decide who can read or write each project." },
      { page: "activity", target: "#activity-list", title: "Activity", text: "Every move, assignment, and file change is listed here, newest first." },
      { page: "metrics", target: "#ring-wrap", title: "Your progress", text: "The ring shows how much of the work is finished." },
      { page: "export", target: "[data-export='csv']", title: "Export", text: "Download a spreadsheet, a full backup, or print a report." },
      { page: "help", target: "[data-page='help']", title: "Need a reminder?", text: "How It Works explains roles, stages, and files in plain words." }
    ];

    let tourIndex = 0, tourEl = null, tourTarget = null;
    function clearTour() {
      if (tourTarget) tourTarget.classList.remove("tour-spot");
      tourTarget = null;
      if (tourEl) tourEl.remove();
      tourEl = null;
    }
    function endTour(markDone) {
      clearTour();
      if (markDone) { try { localStorage.setItem(TOUR_KEY, "1"); } catch (e) {} }
    }
    function placeBubble() {
      if (!tourEl || !tourTarget) return;
      const r = tourTarget.getBoundingClientRect();
      const bw = tourEl.offsetWidth, bh = tourEl.offsetHeight, pad = 12;
      const left = Math.min(Math.max(r.left + r.width / 2 - bw / 2, 12), window.innerWidth - bw - 12);
      let top, side;
      if (r.bottom + bh + pad < window.innerHeight) { top = r.bottom + pad; side = "below"; }
      else { top = Math.max(12, r.top - bh - pad); side = "above"; }
      tourEl.style.left = left + "px";
      tourEl.style.top = top + "px";
      tourEl.className = "tour-bubble " + side;
      const arrowX = Math.min(Math.max(r.left + r.width / 2 - left - 6, 14), bw - 26);
      tourEl.style.setProperty("--arrow-x", arrowX + "px");
    }
    function showTourStep(i) {
      clearTour();
      if (i >= TOUR.length) { endTour(true); return; }
      tourIndex = i;
      const step = TOUR[i];
      showPage(step.page);
      requestAnimationFrame(() => {
        const target = document.querySelector(step.target);
        if (!target || target.getClientRects().length === 0) { showTourStep(i + 1); return; }
        tourTarget = target;
        target.classList.add("tour-spot");
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        tourEl = document.createElement("div");
        tourEl.setAttribute("role", "dialog");
        tourEl.setAttribute("aria-label", "Tour step " + (i + 1) + " of " + TOUR.length);
        tourEl.innerHTML = `
          <div class="tour-count">Step ${i + 1} of ${TOUR.length}</div>
          <h4>${esc(step.title)}</h4>
          <p>${esc(step.text)}</p>
          <div class="tour-actions">
            <button class="tour-skip" data-tour="skip">Skip tour</button>
            <div class="tour-dots">${TOUR.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("")}</div>
            <div class="row tour-action-buttons">
              ${i > 0 ? '<button class="btn btn-small" data-tour="back">Back</button>' : ""}
              <button class="btn btn-primary btn-small" data-tour="next">${i === TOUR.length - 1 ? "Finish" : "Next"}</button>
            </div>
          </div>`;
        document.body.appendChild(tourEl);
        setTimeout(placeBubble, 350);
      });
    }
    document.addEventListener("click", e => {
      const btn = e.target.closest("[data-tour]");
      if (!btn) return;
      const action = btn.dataset.tour;
      if (action === "skip") endTour(true);
      if (action === "next") showTourStep(tourIndex + 1);
      if (action === "back") showTourStep(tourIndex - 1);
    });
    $("#start-tour").addEventListener("click", () => showTourStep(0));
    window.addEventListener("resize", placeBubble);
    window.addEventListener("scroll", placeBubble, { passive: true });
    try {
      if (!localStorage.getItem(TOUR_KEY)) setTimeout(() => showTourStep(0), 700);
    } catch (e) {}

    // ---------- Start ----------
    const d = new Date();
    $("#today-label").textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    showPage("home");
  })();