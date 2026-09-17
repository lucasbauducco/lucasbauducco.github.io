(() => {
  const demo = document.getElementById("demo-report");
  if (!demo) return;

  // Fictional sample records. Integer minutes keep totals exact across filters.
  const records = [
    { date: "2026-09-07", person: "Ana", company: "Estudio Sur", task: "demoTaskBackend", minutes: 180 },
    { date: "2026-09-08", person: "Martín", company: "Faro Digital", task: "demoTaskIntegration", minutes: 150 },
    { date: "2026-09-09", person: "Lucía", company: "Estudio Sur", task: "demoTaskTests", minutes: 120 },
    { date: "2026-09-10", person: "Ana", company: "Faro Digital", task: "demoTaskBackend", minutes: 240 },
    { date: "2026-09-11", person: "Martín", company: "Faro Digital", task: "demoTaskSupport", minutes: 90 },
    { date: "2026-09-14", person: "Ana", company: "Estudio Sur", task: "demoTaskIntegration", minutes: 210 },
    { date: "2026-09-15", person: "Lucía", company: "Estudio Sur", task: "demoTaskBackend", minutes: 165 },
    { date: "2026-09-16", person: "Martín", company: "Faro Digital", task: "demoTaskTests", minutes: 135 }
  ];
  const periods = {
    first: ["2026-09-07", "2026-09-11"],
    second: ["2026-09-14", "2026-09-18"]
  };
  const form = demo.querySelector("form");
  const rows = demo.querySelector("tbody");
  const empty = demo.querySelector(".demo-empty");
  const reportGroups = demo.querySelector(".demo-report-groups");

  function duration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours} h${remainder ? ` ${remainder} min` : ""}`;
  }

  function render() {
    // Reuse the portfolio's language dictionary and language-switch lifecycle.
    const language = currentLanguage();
    const copy = translations[language];
    const company = form.elements.company.value;
    const person = form.elements.person.value;
    const period = periods[form.elements.period.value];
    const filtered = records.filter((record) =>
      (!company || record.company === company) &&
      (!person || record.person === person) &&
      (!period || (record.date >= period[0] && record.date <= period[1]))
    );
    const totalMinutes = filtered.reduce((total, record) => total + record.minutes, 0);
    const byCompany = new Map();
    const fragment = document.createDocumentFragment();
    const dateFormat = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "es-AR", {
      day: "2-digit", month: "short", timeZone: "UTC"
    });

    filtered.forEach((record) => {
      byCompany.set(record.company, (byCompany.get(record.company) || 0) + record.minutes);
      const row = document.createElement("tr");
      row.setAttribute("role", "row");
      const values = [dateFormat.format(new Date(`${record.date}T12:00:00Z`)), record.person, record.company, copy[record.task], duration(record.minutes)];
      const labels = [copy.demoDate, copy.demoPerson, copy.demoCompany, copy.demoTask, copy.demoDuration];
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.setAttribute("role", "cell");
        const label = document.createElement("span");
        label.className = "demo-cell-label";
        label.setAttribute("aria-hidden", "true");
        label.textContent = labels[index];
        cell.append(label, document.createTextNode(value));
        row.append(cell);
      });
      fragment.append(row);
    });
    rows.replaceChildren(fragment);
    demo.querySelector(".demo-table-wrap").hidden = filtered.length === 0;
    empty.hidden = filtered.length > 0;
    demo.querySelector("[data-demo-total]").textContent = duration(totalMinutes);
    demo.querySelector("[data-demo-count]").textContent = filtered.length;
    demo.querySelector("[data-demo-companies]").textContent = byCompany.size;
    demo.querySelector("[data-demo-status]").textContent = copy.demoStatus
      .replace("{count}", filtered.length).replace("{duration}", duration(totalMinutes));

    const groups = document.createDocumentFragment();
    byCompany.forEach((minutes, name) => {
      const group = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = name;
      const value = document.createElement("strong");
      value.textContent = duration(minutes);
      const track = document.createElement("span");
      track.className = "demo-report-track";
      track.setAttribute("aria-hidden", "true");
      const bar = document.createElement("span");
      bar.style.width = `${minutes / totalMinutes * 100}%`;
      track.append(bar);
      group.append(label, value, track);
      groups.append(group);
    });
    reportGroups.replaceChildren(groups);
    demo.querySelector("[data-demo-report-total]").textContent = duration(totalMinutes);
    demo.querySelector(".demo-report-empty").hidden = filtered.length > 0;
  }

  form.addEventListener("change", render);
  form.addEventListener("submit", (event) => event.preventDefault());
  demo.querySelector("[data-demo-reset]").addEventListener("click", () => {
    form.reset();
    render();
  });
  document.addEventListener("portfolio:languagechange", render);

  render();
  demo.querySelector("fieldset").disabled = false;
  demo.querySelector(".demo-results").hidden = false;
  demo.querySelector(".demo-fallback").hidden = true;
})();
