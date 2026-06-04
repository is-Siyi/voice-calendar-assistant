const STORAGE_KEY = "voice-calendar-events";

const commandInput = document.querySelector("#commandInput");
const voiceButton = document.querySelector("#voiceButton");
const runButton = document.querySelector("#runButton");
const clearButton = document.querySelector("#clearButton");
const showAllButton = document.querySelector("#showAllButton");
const eventList = document.querySelector("#eventList");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const message = document.querySelector("#message");

const intentValue = document.querySelector("#intentValue");
const dateValue = document.querySelector("#dateValue");
const timeValue = document.querySelector("#timeValue");
const titleValue = document.querySelector("#titleValue");

let events = loadEvents();
let activeFilterDate = null;

renderEvents();
setupSpeechRecognition();

runButton.addEventListener("click", () => handleCommand(commandInput.value));
clearButton.addEventListener("click", () => {
  commandInput.value = "";
  updateParsedView();
  setMessage("已清空输入。");
});
showAllButton.addEventListener("click", () => {
  activeFilterDate = null;
  renderEvents();
  setMessage("已显示全部日程。", "success");
});

document.querySelectorAll(".hint-list span").forEach((item) => {
  item.addEventListener("click", () => {
    commandInput.value = item.textContent;
    handleCommand(commandInput.value);
  });
});

function setupSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButton.textContent = "语音不可用";
    setMessage("当前浏览器不支持语音识别，可以直接输入文字指令体验。");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = false;
  recognition.continuous = false;

  voiceButton.addEventListener("click", () => {
    statusDot.classList.add("active");
    statusText.textContent = "正在聆听";
    setMessage("请开始说话，例如：明天下午三点提醒我开会。");
    recognition.start();
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    commandInput.value = transcript;
    handleCommand(transcript);
  });

  recognition.addEventListener("end", () => {
    statusDot.classList.remove("active");
    statusText.textContent = "等待指令";
  });

  recognition.addEventListener("error", () => {
    statusDot.classList.remove("active");
    statusText.textContent = "识别失败";
    setMessage("语音识别失败，请检查麦克风权限，或改用文字输入。", "error");
  });
}

function handleCommand(rawCommand) {
  const command = normalize(rawCommand);

  if (!command) {
    updateParsedView();
    setMessage("请先输入或说出一条指令。", "error");
    return;
  }

  const parsed = parseCommand(command);
  updateParsedView(parsed);

  if (parsed.intent === "add") {
    addEvent(parsed);
    return;
  }

  if (parsed.intent === "view") {
    activeFilterDate = parsed.date || null;
    renderEvents();
    setMessage(
      parsed.date ? `已筛选 ${formatDate(parsed.date)} 的日程。` : "已显示全部日程。",
      "success"
    );
    return;
  }

  if (parsed.intent === "delete") {
    deleteEvent(parsed);
    return;
  }

  setMessage("暂时没有理解这条指令，请换一种说法。", "error");
}

function parseCommand(command) {
  const intent = getIntent(command);
  const date = parseDate(command);
  const time = parseTime(command);
  const title = parseTitle(command, intent);

  return { intent, date, time, title, raw: command };
}

function getIntent(command) {
  if (/删除|取消|移除/.test(command)) return "delete";
  if (/查看|看看|查询|显示|安排/.test(command) && !/提醒我/.test(command)) {
    return "view";
  }
  if (/提醒我|添加|新增|创建|安排/.test(command)) return "add";
  return "unknown";
}

function parseDate(command) {
  const today = new Date();
  const offsetMap = [
    { keyword: "后天", offset: 2 },
    { keyword: "明天", offset: 1 },
    { keyword: "今天", offset: 0 },
  ];

  const relative = offsetMap.find((item) => command.includes(item.keyword));
  if (relative) return toDateKey(addDays(today, relative.offset));

  const monthDayMatch = command.match(/(\\d{1,2})月(\\d{1,2})(日|号)?/);
  if (monthDayMatch) {
    const date = new Date(today.getFullYear(), Number(monthDayMatch[1]) - 1, Number(monthDayMatch[2]));
    return toDateKey(date);
  }

  return toDateKey(today);
}

function parseTime(command) {
  const timeMatch = command.match(/(凌晨|早上|上午|中午|下午|晚上)?(\\d{1,2})点(半|\\d{1,2}分?)?/);
  if (!timeMatch) return "";

  const period = timeMatch[1] || "";
  let hour = Number(timeMatch[2]);
  let minute = 0;

  if (timeMatch[3] === "半") {
    minute = 30;
  } else if (timeMatch[3]) {
    minute = Number(timeMatch[3].replace("分", ""));
  }

  if ((period === "下午" || period === "晚上") && hour < 12) {
    hour += 12;
  }

  if (period === "中午" && hour < 11) {
    hour += 12;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTitle(command, intent) {
  let title = command
    .replace(/^(请|帮我|麻烦)?/, "")
    .replace(/(今天|明天|后天)/g, "")
    .replace(/\\d{1,2}月\\d{1,2}(日|号)?/g, "")
    .replace(/(凌晨|早上|上午|中午|下午|晚上)?\\d{1,2}点(半|\\d{1,2}分?)?/g, "")
    .replace(/提醒我|添加|新增|创建|安排|查看|看看|查询|显示|删除|取消|移除/g, "")
    .replace(/的安排|日程|提醒/g, "")
    .trim();

  if (!title && intent === "view") return "查看日程";
  if (!title && intent === "delete") return "";
  return title || "未命名事项";
}

function addEvent(parsed) {
  if (!parsed.time) {
    setMessage("添加日程时需要包含时间，例如：明天下午三点提醒我开会。", "error");
    return;
  }

  const event = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: parsed.title,
    date: parsed.date,
    time: parsed.time,
    createdAt: new Date().toISOString(),
  };

  events.push(event);
  saveEvents();
  activeFilterDate = null;
  renderEvents();
  setMessage(`已添加：${formatDate(event.date)} ${event.time} ${event.title}`, "success");
}

function deleteEvent(parsed) {
  const beforeCount = events.length;
  events = events.filter((event) => {
    const dateMatches = !parsed.date || event.date === parsed.date;
    const timeMatches = !parsed.time || event.time === parsed.time;
    const titleMatches = !parsed.title || event.title.includes(parsed.title);
    return !(dateMatches && timeMatches && titleMatches);
  });

  const removedCount = beforeCount - events.length;
  saveEvents();
  renderEvents();

  if (removedCount > 0) {
    setMessage(`已删除 ${removedCount} 条匹配日程。`, "success");
  } else {
    setMessage("没有找到匹配的日程，请说得更具体一些。", "error");
  }
}

function renderEvents() {
  const visibleEvents = events
    .filter((event) => !activeFilterDate || event.date === activeFilterDate)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  eventList.innerHTML = "";

  if (visibleEvents.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = activeFilterDate
      ? `${formatDate(activeFilterDate)} 暂无日程。`
      : "暂无日程，试试说：明天下午三点提醒我开会。";
    eventList.appendChild(empty);
    return;
  }

  visibleEvents.forEach((event) => {
    const item = document.createElement("li");
    item.className = "event-item";

    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = `${formatDate(event.date)} ${event.time}`;

    const title = document.createElement("span");
    title.className = "event-title";
    title.textContent = event.title;

    const button = document.createElement("button");
    button.className = "delete-button";
    button.type = "button";
    button.textContent = "删除";
    button.addEventListener("click", () => {
      events = events.filter((item) => item.id !== event.id);
      saveEvents();
      renderEvents();
      setMessage(`已删除：${event.title}`, "success");
    });

    item.append(time, title, button);
    eventList.appendChild(item);
  });
}

function updateParsedView(parsed = {}) {
  intentValue.textContent = intentLabel(parsed.intent);
  dateValue.textContent = parsed.date ? formatDate(parsed.date) : "-";
  timeValue.textContent = parsed.time || "-";
  titleValue.textContent = parsed.title || "-";
}

function intentLabel(intent) {
  const labels = {
    add: "添加日程",
    view: "查看日程",
    delete: "删除日程",
    unknown: "未识别",
  };
  return labels[intent] || "-";
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function normalize(text) {
  return String(text || "")
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\\s+/g, "")
    .trim();
}

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}
