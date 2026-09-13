# React Practical Questions (50 Interview Builds)

> Simple, beginner-friendly React solutions for all 50 practical UI problems listed in your prompt.
>  
> Format for every problem:
> 1. **What to build**
> 2. **Simple approach**
> 3. **Code**
> 4. **Why this works / interview takeaway**

---

## Beginner-friendly questions (1-10)

### 1. Accordion

**What to build:** Vertically stacked sections. Click title to expand/collapse content.

**Simple approach:** Keep one `openIndex` in state.

```jsx
import { useState } from "react";

const items = [
  { title: "HTML", content: "Structure of web pages." },
  { title: "CSS", content: "Styling and layout." },
  { title: "JavaScript", content: "Behavior and interactivity." },
];

export default function Accordion() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div>
      {items.map((item, index) => (
        <section key={item.title}>
          <button onClick={() => setOpenIndex(openIndex === index ? -1 : index)}>
            {item.title}
          </button>
          {openIndex === index && <p>{item.content}</p>}
        </section>
      ))}
    </div>
  );
}
```

**Why this works:** The UI is fully derived from one piece of state (`openIndex`), so behavior stays predictable.

### 2. Contact Form

**What to build:** Name, email, message fields. Submit to backend API.

**Simple approach:** Controlled inputs + async submit handler.

```jsx
import { useState } from "react";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("idle");

  async function onSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setStatus(res.ok ? "sent" : "error");
  }

  return (
    <form onSubmit={onSubmit}>
      <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <textarea placeholder="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      <button type="submit" disabled={status === "sending"}>Send</button>
      <p>{status === "sent" ? "Thanks! Feedback sent." : status === "error" ? "Failed. Try again." : ""}</p>
    </form>
  );
}
```

**Interview takeaway:** Mention validation, loading state, and error state clearly.

### 3. Holy Grail Layout

**What to build:** Header, left sidebar, center content, right sidebar, footer.

**Simple approach:** CSS Grid template areas.

```jsx
export default function HolyGrail() {
  return (
    <div className="layout">
      <header>Header</header>
      <aside className="left">Left Sidebar</aside>
      <main>Main Content</main>
      <aside className="right">Right Sidebar</aside>
      <footer>Footer</footer>
    </div>
  );
}
```

```css
.layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px 1fr 220px;
  grid-template-rows: 64px 1fr 64px;
  grid-template-areas:
    "header header header"
    "left main right"
    "footer footer footer";
}
header { grid-area: header; }
.left { grid-area: left; }
main { grid-area: main; }
.right { grid-area: right; }
footer { grid-area: footer; }
```

**Why this works:** Grid gives clean, explicit placement and responsive control.

### 4. Progress Bars (list, fill after adding)

**What to build:** Each click adds a new bar that animates from 0% to 100%.

**Simple approach:** Add bar with `value: 0`, then set to `100` in `setTimeout` so CSS transition runs.

```jsx
import { useState } from "react";

export default function ProgressBars() {
  const [bars, setBars] = useState([]);

  function addBar() {
    const id = crypto.randomUUID();
    setBars((prev) => [...prev, { id, value: 0 }]);
    setTimeout(() => {
      setBars((prev) => prev.map((bar) => (bar.id === id ? { ...bar, value: 100 } : bar)));
    }, 50);
  }

  return (
    <div>
      <button onClick={addBar}>Add</button>
      {bars.map((bar) => (
        <div key={bar.id} className="track">
          <div className="fill" style={{ width: `${bar.value}%` }} />
        </div>
      ))}
    </div>
  );
}
```

```css
.track { height: 12px; background: #eee; margin-top: 8px; border-radius: 999px; overflow: hidden; }
.fill { height: 100%; background: #22c55e; transition: width 2s linear; }
```

**Interview takeaway:** Explain why animation needs two renders (initial + updated width).

### 5. Mortgage Calculator

**What to build:** Monthly payment from principal, annual interest, years.

**Simple approach:** Use standard EMI/mortgage formula.

```jsx
import { useMemo, useState } from "react";

export default function MortgageCalculator() {
  const [principal, setPrincipal] = useState(300000);
  const [annualRate, setAnnualRate] = useState(7);
  const [years, setYears] = useState(30);

  const monthly = useMemo(() => {
    const r = annualRate / 12 / 100;
    const n = years * 12;
    if (!r) return principal / n;
    return (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  }, [principal, annualRate, years]);

  return (
    <div>
      <input type="number" value={principal} onChange={(e) => setPrincipal(Number(e.target.value))} />
      <input type="number" value={annualRate} onChange={(e) => setAnnualRate(Number(e.target.value))} />
      <input type="number" value={years} onChange={(e) => setYears(Number(e.target.value))} />
      <h3>Monthly: ${monthly.toFixed(2)}</h3>
    </div>
  );
}
```

**Interview takeaway:** Discuss edge case when interest rate is 0.

### 6. Flight Booker

**What to build:** One-way and return booking with date validation.

**Simple approach:** State for trip type, start date, end date; disable submit if invalid.

```jsx
import { useMemo, useState } from "react";

export default function FlightBooker() {
  const [type, setType] = useState("one-way");
  const [start, setStart] = useState("2026-05-01");
  const [end, setEnd] = useState("2026-05-02");

  const isValid = useMemo(() => {
    if (type === "one-way") return !!start;
    return !!start && !!end && new Date(end) >= new Date(start);
  }, [type, start, end]);

  return (
    <div>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="one-way">One-way</option>
        <option value="return">Return</option>
      </select>
      <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={type === "one-way"} />
      <button disabled={!isValid}>Book</button>
    </div>
  );
}
```

**Why this works:** Validation is derived, not manually synchronized.

### 7. Generate Table

**What to build:** Table of numbers from provided rows and columns.

**Simple approach:** Build a 2D array in render.

```jsx
import { useState } from "react";

export default function GenerateTable() {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(4);

  return (
    <div>
      <input type="number" min="1" value={rows} onChange={(e) => setRows(Number(e.target.value))} />
      <input type="number" min="1" value={cols} onChange={(e) => setCols(Number(e.target.value))} />
      <table border="1">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>{r * cols + c + 1}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Interview takeaway:** Mention rendering performance if rows/cols become very large.

### 8. Progress Bar (single component)

**What to build:** Reusable progress bar for any percentage.

**Simple approach:** Clamp value between 0 and 100.

```jsx
export default function ProgressBar({ value }) {
  const safe = Math.max(0, Math.min(100, value));

  return (
    <div className="track" aria-label="Progress">
      <div className="fill" style={{ width: `${safe}%` }} />
      <span>{safe}%</span>
    </div>
  );
}
```

```css
.track { position: relative; height: 20px; background: #e5e7eb; border-radius: 999px; overflow: hidden; }
.fill { height: 100%; background: #3b82f6; transition: width 300ms ease; }
.track span { position: absolute; inset: 0; display: grid; place-items: center; font-size: 12px; }
```

**Interview takeaway:** Accessibility: announce progress with `role="progressbar"` + value attrs in advanced version.

### 9. Temperature Converter

**What to build:** Celsius ↔ Fahrenheit converter.

**Simple approach:** Track active input so conversion does not loop endlessly.

```jsx
import { useState } from "react";

export default function TemperatureConverter() {
  const [source, setSource] = useState("c");
  const [celsius, setCelsius] = useState("0");

  const c = Number(celsius || 0);
  const f = (c * 9) / 5 + 32;

  return (
    <div>
      <input
        value={source === "c" ? celsius : ((Number(celsius || 0) - 32) * 5) / 9}
        onChange={(e) => {
          setSource("c");
          setCelsius(e.target.value);
        }}
      />
      <input
        value={source === "f" ? f : ((Number(celsius || 0) * 9) / 5 + 32)}
        onChange={(e) => {
          setSource("f");
          const nextC = ((Number(e.target.value || 0) - 32) * 5) / 9;
          setCelsius(String(nextC));
        }}
      />
    </div>
  );
}
```

**Interview takeaway:** Show clean formula handling and input parsing.

### 10. Tweet UI

**What to build:** A UI card similar to a Tweet.

**Simple approach:** Create reusable `TweetCard` with props.

```jsx
function TweetCard({ name, handle, text, time }) {
  return (
    <article className="tweet">
      <img alt="" src="https://i.pravatar.cc/48" />
      <div>
        <p><strong>{name}</strong> @{handle} · {time}</p>
        <p>{text}</p>
        <div>💬 12 &nbsp; 🔁 4 &nbsp; ❤️ 31</div>
      </div>
    </article>
  );
}

export default function App() {
  return <TweetCard name="Ranjeet" handle="ranjeet" text="Building interview UIs today!" time="2h" />;
}
```

**Interview takeaway:** Focus on component composition and semantic HTML.

---

## Intermediate questions (11-41)

### 11. Tabs

**What to build:** One visible panel at a time.

**Simple approach:** Keep `activeTab` in state.

```jsx
import { useState } from "react";

const tabs = [
  { id: "html", label: "HTML", content: "Markup language." },
  { id: "css", label: "CSS", content: "Style sheets." },
  { id: "js", label: "JS", content: "Programming language." },
];

export default function Tabs() {
  const [active, setActive] = useState(tabs[0].id);
  const panel = tabs.find((t) => t.id === active);

  return (
    <div>
      {tabs.map((t) => <button key={t.id} onClick={() => setActive(t.id)}>{t.label}</button>)}
      <div>{panel.content}</div>
    </div>
  );
}
```

**Interview takeaway:** Mention controlled vs uncontrolled tabs.

### 12. Data Table (pagination)

**What to build:** Users table with page controls.

**Simple approach:** Slice data with `page` and `pageSize`.

```jsx
import { useMemo, useState } from "react";

export default function DataTable({ users }) {
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const totalPages = Math.ceil(users.length / pageSize);

  const visible = useMemo(() => {
    const start = (page - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, page]);

  return (
    <div>
      <table>
        <tbody>{visible.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td></tr>)}</tbody>
      </table>
      <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Prev</button>
      <span>{page}/{totalPages}</span>
      <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}>Next</button>
    </div>
  );
}
```

**Interview takeaway:** Frontend pagination is easy; server-side pagination scales better.

### 13. Dice Roller

**What to build:** Roll N six-sided dice.

**Simple approach:** Generate random integers from 1 to 6.

```jsx
import { useState } from "react";

export default function DiceRoller() {
  const [count, setCount] = useState(2);
  const [rolls, setRolls] = useState([1, 1]);

  function roll() {
    setRolls(Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1));
  }

  return (
    <div>
      <input type="number" min="1" max="10" value={count} onChange={(e) => setCount(Number(e.target.value))} />
      <button onClick={roll}>Roll</button>
      <p>{rolls.join(" , ")} (sum: {rolls.reduce((a, b) => a + b, 0)})</p>
    </div>
  );
}
```

### 14. File Explorer

**What to build:** Expand/collapse folders in tree structure.

**Simple approach:** Recursive component + `Set` of open folder IDs.

```jsx
import { useState } from "react";

function Node({ node, open, toggle }) {
  if (node.type === "file") return <div style={{ paddingLeft: 16 }}>📄 {node.name}</div>;
  const isOpen = open.has(node.id);
  return (
    <div>
      <button onClick={() => toggle(node.id)}>{isOpen ? "📂" : "📁"} {node.name}</button>
      {isOpen && node.children.map((child) => <Node key={child.id} node={child} open={open} toggle={toggle} />)}
    </div>
  );
}

export default function FileExplorer({ tree }) {
  const [open, setOpen] = useState(new Set());
  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  return <Node node={tree} open={open} toggle={toggle} />;
}
```

### 15. Like Button

**What to build:** Button toggles like/unlike state.

**Simple approach:** Optimistic UI with local state.

```jsx
import { useState } from "react";

export default function LikeButton() {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(10);

  function toggle() {
    setLiked((v) => !v);
    setCount((c) => c + (liked ? -1 : 1));
  }

  return <button onClick={toggle}>{liked ? "❤️ Liked" : "🤍 Like"} ({count})</button>;
}
```

**Interview takeaway:** Mention optimistic update rollback for API failures.

### 16. Modal Dialog

**What to build:** Reusable open/close dialog.

**Simple approach:** Conditional render + overlay.

```jsx
import { useState } from "react";

export default function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Simple modal</h3>
            <p>Hello from modal body.</p>
            <button onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 17. Star Rating

**What to build:** Select rating by clicking stars.

**Simple approach:** Keep `value` and `hover`.

```jsx
import { useState } from "react";

export default function StarRating({ max = 5 }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => setValue(n)}
          style={{ color: n <= active ? "#f59e0b" : "#cbd5e1" }}
        >
          ★
        </button>
      ))}
      <p>{value}/{max}</p>
    </div>
  );
}
```

### 18. Todo List

**What to build:** Add and delete tasks.

**Simple approach:** Keep array of todos in state.

```jsx
import { useState } from "react";

export default function TodoList() {
  const [text, setText] = useState("");
  const [todos, setTodos] = useState([]);

  function addTodo() {
    if (!text.trim()) return;
    setTodos((prev) => [...prev, { id: crypto.randomUUID(), text }]);
    setText("");
  }

  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={addTodo}>Add</button>
      <ul>
        {todos.map((t) => (
          <li key={t.id}>{t.text} <button onClick={() => setTodos((p) => p.filter((x) => x.id !== t.id))}>Delete</button></li>
        ))}
      </ul>
    </div>
  );
}
```

### 19. Traffic Light

**What to build:** Green → Yellow → Red loop.

**Simple approach:** Cycle index with timer.

```jsx
import { useEffect, useState } from "react";

const steps = [
  { color: "green", ms: 3000 },
  { color: "yellow", ms: 1000 },
  { color: "red", ms: 3000 },
];

export default function TrafficLight() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setI((v) => (v + 1) % steps.length), steps[i].ms);
    return () => clearTimeout(t);
  }, [i]);

  return (
    <div>
      {steps.map((s, idx) => (
        <div key={s.color} style={{ width: 60, height: 60, borderRadius: "50%", background: idx === i ? s.color : "#ddd" }} />
      ))}
    </div>
  );
}
```

### 20. Digital Clock (7-segment style)

**What to build:** Live time with segment-like digits.

**Simple approach:** Update time every second and render each digit from segment map.

```jsx
import { useEffect, useState } from "react";

const map = {
  "0": [1,1,1,1,1,1,0], "1": [0,1,1,0,0,0,0], "2": [1,1,0,1,1,0,1],
  "3": [1,1,1,1,0,0,1], "4": [0,1,1,0,0,1,1], "5": [1,0,1,1,0,1,1],
  "6": [1,0,1,1,1,1,1], "7": [1,1,1,0,0,0,0], "8": [1,1,1,1,1,1,1], "9": [1,1,1,1,0,1,1],
};

function SegDigit({ d }) {
  return <pre>{JSON.stringify(map[d])}</pre>; // replace with styled segments in UI
}

export default function DigitalClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const text = now.toLocaleTimeString("en-GB", { hour12: false });
  return <div>{text.split("").map((ch, i) => (ch === ":" ? <span key={i}>:</span> : <SegDigit key={i} d={ch} />))}</div>;
}
```

**Interview takeaway:** Start simple (text clock), then incrementally improve to true segment UI.

### 21. Tic-tac-toe

**What to build:** 2-player 3x3 game with winner detection.

**Simple approach:** 9-cell array + current player.

```jsx
import { useState } from "react";

const lines = [
  [0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6],
];

function winner(board) {
  for (const [a, b, c] of lines) if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  return null;
}

export default function TicTacToe() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [xTurn, setXTurn] = useState(true);
  const w = winner(board);

  function move(i) {
    if (board[i] || w) return;
    const next = [...board];
    next[i] = xTurn ? "X" : "O";
    setBoard(next);
    setXTurn((v) => !v);
  }

  return (
    <div>
      {board.map((v, i) => <button key={i} onClick={() => move(i)}>{v || "-"}</button>)}
      <p>{w ? `Winner: ${w}` : `Turn: ${xTurn ? "X" : "O"}`}</p>
    </div>
  );
}
```

### 22. Image Carousel

**What to build:** Show one image at a time with next/prev.

**Simple approach:** Keep current index with wrap-around.

```jsx
import { useState } from "react";

export default function ImageCarousel({ images }) {
  const [i, setI] = useState(0);
  const prev = () => setI((v) => (v - 1 + images.length) % images.length);
  const next = () => setI((v) => (v + 1) % images.length);

  return (
    <div>
      <img src={images[i]} alt={`Slide ${i + 1}`} width="320" />
      <div>
        <button onClick={prev}>Prev</button>
        <button onClick={next}>Next</button>
      </div>
    </div>
  );
}
```

### 23. Job Board (Hacker News)

**What to build:** Show latest jobs from HN API.

**Simple approach:** Fetch job IDs, then fetch item details.

```jsx
import { useEffect, useState } from "react";

export default function JobBoard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const ids = await fetch("https://hacker-news.firebaseio.com/v0/jobstories.json").then((r) => r.json());
      const top = ids.slice(0, 10);
      const items = await Promise.all(
        top.map((id) => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.json()))
      );
      setJobs(items);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p>Loading...</p>;
  return <ul>{jobs.map((j) => <li key={j.id}><a href={j.url}>{j.title}</a></li>)}</ul>;
}
```

**Interview takeaway:** Mention request batching, caching, and error handling.

### 24. Stopwatch

**What to build:** Start, stop, reset elapsed time.

**Simple approach:** Keep `running`, `elapsedMs`, and start timestamp.

```jsx
import { useEffect, useRef, useState } from "react";

export default function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now() - elapsed;
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 50);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div>
      <h3>{(elapsed / 1000).toFixed(2)}s</h3>
      <button onClick={() => setRunning(true)}>Start</button>
      <button onClick={() => setRunning(false)}>Stop</button>
      <button onClick={() => { setRunning(false); setElapsed(0); }}>Reset</button>
    </div>
  );
}
```

### 25. Transfer List

**What to build:** Move items between left and right lists.

**Simple approach:** Track selected IDs and two arrays.

```jsx
import { useState } from "react";

export default function TransferList() {
  const [left, setLeft] = useState(["HTML", "CSS", "JS"]);
  const [right, setRight] = useState(["React"]);
  const [selected, setSelected] = useState(new Set());

  const moveRight = () => {
    const picked = left.filter((x) => selected.has(x));
    setLeft((prev) => prev.filter((x) => !selected.has(x)));
    setRight((prev) => [...prev, ...picked]);
    setSelected(new Set());
  };

  const moveLeft = () => {
    const picked = right.filter((x) => selected.has(x));
    setRight((prev) => prev.filter((x) => !selected.has(x)));
    setLeft((prev) => [...prev, ...picked]);
    setSelected(new Set());
  };

  return (
    <div style={{ display: "flex", gap: 16 }}>
      {[left, right].map((list, idx) => (
        <ul key={idx}>{list.map((item) => <li key={item}><label><input type="checkbox" checked={selected.has(item)} onChange={() => {
          setSelected((prev) => {
            const next = new Set(prev);
            next.has(item) ? next.delete(item) : next.add(item);
            return next;
          });
        }} />{item}</label></li>)}</ul>
      ))}
      <div>
        <button onClick={moveRight}>{">>"}</button>
        <button onClick={moveLeft}>{"<<"}</button>
      </div>
    </div>
  );
}
```

### 26. Accordion II (ARIA)

**What to build:** Accessible accordion with ARIA roles/states.

**Simple approach:** Add `aria-expanded`, `aria-controls`, `id`.

```jsx
import { useState } from "react";

const items = [
  { id: 1, title: "Section 1", content: "Content 1" },
  { id: 2, title: "Section 2", content: "Content 2" },
];

export default function AccordionA11y() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div>
      {items.map((item, i) => {
        const open = i === openIndex;
        const btnId = `acc-btn-${item.id}`;
        const panelId = `acc-panel-${item.id}`;
        return (
          <section key={item.id}>
            <h3>
              <button
                id={btnId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? -1 : i)}
              >
                {item.title}
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={btnId} hidden={!open}>
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

**Interview takeaway:** Accessibility is not optional in reusable components.

### 27. Accordion III (keyboard support)

**What to build:** Full keyboard navigation for accordion headers.

**Simple approach:** Roving focus with arrow keys + Home/End.

```jsx
import { useRef, useState } from "react";

const items = [
  { id: "a", title: "HTML", content: "Markup" },
  { id: "b", title: "CSS", content: "Styling" },
  { id: "c", title: "JS", content: "Logic" },
];

export default function AccordionKeyboard() {
  const [openIndex, setOpenIndex] = useState(0);
  const refs = useRef(items.map(() => null));

  function onKeyDown(e, i) {
    const total = items.length;
    if (e.key === "ArrowDown") refs.current[(i + 1) % total]?.focus();
    if (e.key === "ArrowUp") refs.current[(i - 1 + total) % total]?.focus();
    if (e.key === "Home") refs.current[0]?.focus();
    if (e.key === "End") refs.current[total - 1]?.focus();
    if (e.key === "Enter" || e.key === " ") setOpenIndex(openIndex === i ? -1 : i);
  }

  return (
    <div>
      {items.map((item, i) => {
        const open = i === openIndex;
        const btnId = `btn-${item.id}`;
        const panelId = `panel-${item.id}`;
        return (
          <section key={item.id}>
            <h3>
              <button
                ref={(el) => (refs.current[i] = el)}
                id={btnId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? -1 : i)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                {item.title}
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={btnId} hidden={!open}>
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

**Why this works:** Matches common ARIA Authoring Practices behavior.

### 28. Analog Clock

**What to build:** Real-time analog clock hands.

**Simple approach:** Compute hand angles from current time every second.

```jsx
import { useEffect, useState } from "react";

export default function AnalogClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const s = now.getSeconds();
  const m = now.getMinutes();
  const h = now.getHours() % 12;

  const secDeg = s * 6;
  const minDeg = m * 6 + s * 0.1;
  const hourDeg = h * 30 + m * 0.5;

  return (
    <div className="clock">
      <div className="hand hour" style={{ transform: `rotate(${hourDeg}deg)` }} />
      <div className="hand minute" style={{ transform: `rotate(${minDeg}deg)` }} />
      <div className="hand second" style={{ transform: `rotate(${secDeg}deg)` }} />
    </div>
  );
}
```

### 29. Data Table II (sorting)

**What to build:** Sort users by selected column.

**Simple approach:** Keep `sortKey` and `direction`.

```jsx
import { useMemo, useState } from "react";

export default function SortableTable({ users }) {
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const sorted = useMemo(() => {
    const arr = [...users];
    arr.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x < y) return sort.dir === "asc" ? -1 : 1;
      if (x > y) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [users, sort]);

  function toggle(key) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  }

  return (
    <table>
      <thead><tr><th onClick={() => toggle("name")}>Name</th><th onClick={() => toggle("age")}>Age</th></tr></thead>
      <tbody>{sorted.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.age}</td></tr>)}</tbody>
    </table>
  );
}
```

### 30. File Explorer II (semi-accessible)

**What to build:** Tree with basic ARIA tree semantics.

**Simple approach:** `role="tree"`, `role="treeitem"`, `aria-expanded`.

```jsx
import { useState } from "react";

function TreeNode({ node, level = 1 }) {
  const [open, setOpen] = useState(false);
  const isFolder = node.type === "folder";

  return (
    <div role="treeitem" aria-level={level} aria-expanded={isFolder ? open : undefined}>
      {isFolder ? (
        <button onClick={() => setOpen((v) => !v)}>{open ? "📂" : "📁"} {node.name}</button>
      ) : (
        <span>📄 {node.name}</span>
      )}
      {isFolder && open && (
        <div role="group">
          {node.children.map((child) => <TreeNode key={child.id} node={child} level={level + 1} />)}
        </div>
      )}
    </div>
  );
}

export default function FileExplorerA11y({ tree }) {
  return (
    <div role="tree" aria-label="Files">
      <TreeNode node={tree} />
    </div>
  );
}
```

### 31. File Explorer III (flat DOM)

**What to build:** File explorer using flat list, not deep nested DOM.

**Simple approach:** Flatten visible nodes with DFS and `depth` metadata.

```jsx
import { useMemo, useState } from "react";

function flattenVisible(node, openSet, depth = 1, out = []) {
  out.push({ id: node.id, name: node.name, type: node.type, depth, children: node.children || [] });
  if (node.type === "folder" && openSet.has(node.id)) {
    node.children.forEach((child) => flattenVisible(child, openSet, depth + 1, out));
  }
  return out;
}

export default function FlatFileExplorer({ tree }) {
  const [openSet, setOpenSet] = useState(new Set([tree.id]));
  const rows = useMemo(() => flattenVisible(tree, openSet), [tree, openSet]);

  function toggle(id) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div role="tree">
      {rows.map((row) => (
        <div key={row.id} role="treeitem" style={{ paddingLeft: row.depth * 12 }}>
          {row.type === "folder" ? (
            <button onClick={() => toggle(row.id)}>{openSet.has(row.id) ? "📂" : "📁"} {row.name}</button>
          ) : (
            <span>📄 {row.name}</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

**Interview takeaway:** Flat DOM scales better for large trees and virtualization.

### 32. Grid Lights

**What to build:** Activate cells on click. Deactivate in reverse order.

**Simple approach:** Keep activation stack; on completion, pop in interval.

```jsx
import { useState } from "react";

export default function GridLights({ size = 3 }) {
  const total = size * size;
  const [on, setOn] = useState(new Set());
  const [order, setOrder] = useState([]);

  function activate(i) {
    if (on.has(i)) return;
    setOn((prev) => new Set(prev).add(i));
    setOrder((prev) => [...prev, i]);
  }

  function deactivateReverse() {
    let idx = order.length - 1;
    const id = setInterval(() => {
      if (idx < 0) return clearInterval(id);
      setOn((prev) => {
        const next = new Set(prev);
        next.delete(order[idx]);
        return next;
      });
      idx -= 1;
    }, 300);
  }

  return (
    <div>
      <button onClick={deactivateReverse} disabled={order.length !== total}>Deactivate</button>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${size}, 48px)`, gap: 8 }}>
        {Array.from({ length: total }, (_, i) => (
          <button key={i} onClick={() => activate(i)} style={{ height: 48, background: on.has(i) ? "#22c55e" : "#e5e7eb" }} />
        ))}
      </div>
    </div>
  );
}
```

### 33. Modal Dialog II (semi-accessible)

**What to build:** Modal with ARIA labels.

**Simple approach:** Add `role="dialog"` and labeling.

```jsx
import { useState } from "react";

export default function ModalA11yDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)}>Delete item</button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby="modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-title">Delete item?</h2>
            <p id="modal-desc">This action cannot be undone.</p>
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button onClick={() => setOpen(false)}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 34. Modal Dialog III (common close interactions)

**What to build:** Close via close button, backdrop click, Escape key.

**Simple approach:** Attach keydown listener only while modal is open.

```jsx
import { useEffect } from "react";

function Modal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
```

### 35. Progress Bars II (sequential)

**What to build:** Bars fill one by one, not all together.

**Simple approach:** Queue bars and run one active bar at a time.

```jsx
import { useEffect, useState } from "react";

export default function SequentialBars() {
  const [bars, setBars] = useState([]);
  const [activeId, setActiveId] = useState(null);

  function addBar() {
    const id = crypto.randomUUID();
    setBars((prev) => [...prev, { id, value: 0, done: false }]);
  }

  useEffect(() => {
    if (activeId) return;
    const next = bars.find((b) => !b.done && b.value === 0);
    if (!next) return;
    setActiveId(next.id);
    setBars((prev) => prev.map((b) => (b.id === next.id ? { ...b, value: 100 } : b)));
    const t = setTimeout(() => {
      setBars((prev) => prev.map((b) => (b.id === next.id ? { ...b, done: true } : b)));
      setActiveId(null);
    }, 2000);
    return () => clearTimeout(t);
  }, [bars, activeId]);

  return (
    <div>
      <button onClick={addBar}>Add Bar</button>
      {bars.map((b) => <div key={b.id} className="fill" style={{ width: `${b.value}%`, transition: "width 2s linear" }} />)}
    </div>
  );
}
```

### 36. Tabs II (semi-accessible ARIA)

**What to build:** Tabs with proper tab semantics.

**Simple approach:** Use roles and linking ids.

```jsx
import { useState } from "react";

const tabs = [
  { id: "profile", label: "Profile", content: "Profile content" },
  { id: "settings", label: "Settings", content: "Settings content" },
  { id: "billing", label: "Billing", content: "Billing content" },
];

export default function TabsA11y() {
  const [active, setActive] = useState(tabs[0].id);
  const panel = tabs.find((t) => t.id === active);

  return (
    <div>
      <div role="tablist" aria-label="Account tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {panel.content}
      </div>
    </div>
  );
}
```

### 37. Tabs III (keyboard support)

**What to build:** Fully accessible tabs with arrow keys, Home, End.

**Simple approach:** Roving focus and keyboard event handling.

```jsx
import { useRef, useState } from "react";

const tabs = [
  { id: "a", label: "Overview", content: "Overview panel" },
  { id: "b", label: "Details", content: "Details panel" },
  { id: "c", label: "Reviews", content: "Reviews panel" },
];

export default function TabsKeyboard() {
  const [active, setActive] = useState(tabs[0].id);
  const refs = useRef(tabs.map(() => null));

  function moveFocus(i) {
    refs.current[i]?.focus();
    setActive(tabs[i].id);
  }

  function onKeyDown(e, i) {
    const total = tabs.length;
    if (e.key === "ArrowRight") moveFocus((i + 1) % total);
    if (e.key === "ArrowLeft") moveFocus((i - 1 + total) % total);
    if (e.key === "Home") moveFocus(0);
    if (e.key === "End") moveFocus(total - 1);
  }

  const panel = tabs.find((t) => t.id === active);
  return (
    <div>
      <div role="tablist" aria-label="Keyboard tabs">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{panel.content}</div>
    </div>
  );
}
```

**Interview takeaway:** Keyboard support is usually what separates “works” from “production-ready”.

### 38. Progress Bars III (concurrent, max 3)

**What to build:** Multiple bars animate concurrently but max 3 at a time.

**Simple approach:** Queue + `runningCount`.

```jsx
import { useEffect, useState } from "react";

export default function ConcurrentBars() {
  const [bars, setBars] = useState([]);
  const limit = 3;

  function add() {
    setBars((p) => [...p, { id: crypto.randomUUID(), status: "queued", value: 0 }]);
  }

  useEffect(() => {
    const running = bars.filter((b) => b.status === "running").length;
    const slots = limit - running;
    if (slots <= 0) return;
    const toStart = bars.filter((b) => b.status === "queued").slice(0, slots);
    if (!toStart.length) return;
    setBars((prev) => prev.map((b) => toStart.some((x) => x.id === b.id) ? { ...b, status: "running", value: 100 } : b));
    toStart.forEach((bar) => {
      setTimeout(() => {
        setBars((prev) => prev.map((b) => b.id === bar.id ? { ...b, status: "done" } : b));
      }, 2000);
    });
  }, [bars]);

  return (
    <div>
      <button onClick={add}>Add</button>
      {bars.map((b) => <div key={b.id} style={{ width: `${b.value}%`, transition: "width 2s linear", height: 10, background: "#3b82f6", marginTop: 6 }} />)}
    </div>
  );
}
```

### 39. Birth Year Histogram

**What to build:** Fetch birth years and display frequency bars.

**Simple approach:** Count years with object map.

```jsx
import { useEffect, useMemo, useState } from "react";

export default function BirthYearHistogram() {
  const [years, setYears] = useState([]);

  useEffect(() => {
    fetch("/api/birth-years").then((r) => r.json()).then(setYears);
  }, []);

  const counts = useMemo(() => {
    return years.reduce((acc, y) => {
      acc[y] = (acc[y] || 0) + 1;
      return acc;
    }, {});
  }, [years]);

  const entries = Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0]));
  const max = Math.max(1, ...entries.map(([, c]) => c));

  return (
    <div>
      {entries.map(([year, c]) => (
        <div key={year} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>{year}</span>
          <div style={{ width: `${(c / max) * 240}px`, height: 16, background: "#6366f1" }} />
          <span>{c}</span>
        </div>
      ))}
    </div>
  );
}
```

### 40. Connect Four

**What to build:** 7x6 grid; drop discs by column; detect winner.

**Simple approach:** Store board matrix and simulate gravity.

```jsx
import { useState } from "react";

const ROWS = 6, COLS = 7;
const empty = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

export default function ConnectFour() {
  const [board, setBoard] = useState(empty);
  const [turn, setTurn] = useState("R");

  function drop(col) {
    setBoard((prev) => {
      const next = prev.map((r) => [...r]);
      for (let row = ROWS - 1; row >= 0; row--) {
        if (!next[row][col]) {
          next[row][col] = turn;
          setTurn((t) => (t === "R" ? "Y" : "R"));
          break;
        }
      }
      return next;
    });
  }

  return (
    <div>
      <div>{Array.from({ length: COLS }, (_, c) => <button key={c} onClick={() => drop(c)}>Drop {c + 1}</button>)}</div>
      {board.map((row, r) => <div key={r}>{row.map((cell, c) => <span key={c}>{cell || "·"} </span>)}</div>)}
    </div>
  );
}
```

**Interview note:** Explain winner-checking in 4 directions (horizontal, vertical, 2 diagonals).

### 41. Image Carousel II (smooth transition)

**What to build:** Smooth animated slide change.

**Simple approach:** Put all slides in one row and animate `transform`.

```jsx
import { useState } from "react";

export default function SmoothCarousel({ images }) {
  const [i, setI] = useState(0);
  return (
    <div style={{ width: 320, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          transform: `translateX(-${i * 320}px)`,
          transition: "transform 300ms ease",
        }}
      >
        {images.map((src) => <img key={src} src={src} width="320" alt="" />)}
      </div>
      <button onClick={() => setI((v) => (v - 1 + images.length) % images.length)}>Prev</button>
      <button onClick={() => setI((v) => (v + 1) % images.length)}>Next</button>
    </div>
  );
}
```

---

## Advanced questions (42-50)

### 42. Nested Checkboxes

**What to build:** Parent-child selection with indeterminate state.

**Simple approach:** Recursive update + derive parent status from children.

```jsx
function mark(node, checked) {
  return {
    ...node,
    checked,
    children: node.children?.map((c) => mark(c, checked)) ?? [],
  };
}

function compute(node) {
  if (!node.children?.length) return node;
  const children = node.children.map(compute);
  const all = children.every((c) => c.checked);
  const none = children.every((c) => !c.checked && !c.indeterminate);
  return { ...node, children, checked: all, indeterminate: !all && !none };
}
```

**Interview takeaway:** Parent state should be derived, not manually toggled with fragile logic.

### 43. Auth Code Input (6-digit OTP)

**What to build:** 6 input boxes, auto-advance, backspace navigation, paste support.

**Simple approach:** Store array of 6 chars + refs.

```jsx
import { useRef, useState } from "react";

export default function OtpInput() {
  const [digits, setDigits] = useState(Array(6).fill(""));
  const refs = useRef(Array.from({ length: 6 }, () => null));

  function update(i, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < 5) refs.current[i + 1].focus();
  }

  return (
    <div>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          maxLength={1}
          onChange={(e) => update(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1].focus();
          }}
        />
      ))}
      <p>Code: {digits.join("")}</p>
    </div>
  );
}
```

### 44. Progress Bars IV (concurrent + pause/resume)

**What to build:** Same as #38 but bars can be paused and resumed.

**Simple approach:** Track each bar status (`queued`, `running`, `paused`, `done`) and current percent.

```jsx
import { useEffect, useState } from "react";

export default function ProgressBarsPauseResume() {
  const [bars, setBars] = useState([]);
  const limit = 3;

  function addBar() {
    setBars((prev) => [...prev, { id: crypto.randomUUID(), value: 0, status: "queued" }]);
  }

  useEffect(() => {
    const id = setInterval(() => {
      setBars((prev) => {
        let running = prev.filter((b) => b.status === "running").length;
        const next = prev.map((bar) => {
          if (bar.status === "running") {
            const value = Math.min(100, bar.value + 5);
            return { ...bar, value, status: value === 100 ? "done" : "running" };
          }
          if (bar.status === "queued" && running < limit) {
            running += 1;
            return { ...bar, status: "running" };
          }
          return bar;
        });
        return next;
      });
    }, 120);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <button onClick={addBar}>Add Bar</button>
      {bars.map((bar) => (
        <div key={bar.id} style={{ marginTop: 8 }}>
          <div style={{ height: 10, background: "#e5e7eb" }}>
            <div style={{ width: `${bar.value}%`, height: "100%", background: "#2563eb" }} />
          </div>
          <button onClick={() => setBars((p) => p.map((b) => b.id === bar.id ? { ...b, status: b.status === "running" ? "paused" : b.status === "paused" ? "queued" : b.status } : b))}>
            {bar.status === "running" ? "Pause" : bar.status === "paused" ? "Resume" : "Idle"}
          </button>
          <span> {bar.status} ({bar.value}%)</span>
        </div>
      ))}
    </div>
  );
}
```

**Interview takeaway:** This is a scheduling/state-machine question. Communicate your state transitions first.

### 45. Data Table III (generalized table)

**What to build:** Reusable table with column config, sorting, pagination.

**Simple approach:** Accept `columns` metadata and `rows` data.

```jsx
import { useMemo, useState } from "react";

export default function DataTable({ columns, rows, pageSize = 10 }) {
  const [sort, setSort] = useState({ key: columns[0].key, dir: "asc" });
  const [page, setPage] = useState(1);

  const processed = useMemo(() => {
    const out = [...rows].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x < y) return sort.dir === "asc" ? -1 : 1;
      if (x > y) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [rows, sort]);

  const start = (page - 1) * pageSize;
  const visible = processed.slice(start, start + pageSize);

  return (
    <div>
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "asc" ? "desc" : "asc" }))}>{c.label}</th>)}</tr>
        </thead>
        <tbody>{visible.map((row, i) => <tr key={i}>{columns.map((c) => <td key={c.key}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
```

### 46. Modal Dialog IV (fully accessible)

**What to build:** Focus trap + restore previous focus + keyboard interactions.

**Simple approach:** On open: save focused element, focus first element in modal. Trap Tab. Restore on close.

```jsx
import { useEffect, useRef } from "react";

function AccessibleModal({ open, onClose, children }) {
  const ref = useRef(null);
  const prevFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    const focusables = ref.current.querySelectorAll("button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])");
    focusables[0]?.focus();

    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return <div role="dialog" aria-modal="true" ref={ref}>{children}</div>;
}
```

### 47. Selectable Cells (drag selection)

**What to build:** Drag mouse across grid to select multiple cells.

**Simple approach:** On mouse down start selection mode; on enter add cell; on mouse up stop.

```jsx
import { useState } from "react";

export default function SelectableCells({ rows = 6, cols = 8 }) {
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const key = (r, c) => `${r}-${c}`;

  return (
    <div onMouseUp={() => setDragging(false)}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: "flex" }}>
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              onMouseDown={() => { setDragging(true); setSelected((p) => new Set(p).add(key(r, c))); }}
              onMouseEnter={() => dragging && setSelected((p) => new Set(p).add(key(r, c)))}
              style={{ width: 28, height: 28, border: "1px solid #ccc", background: selected.has(key(r, c)) ? "#93c5fd" : "white" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

### 48. Wordle

**What to build:** Guess 5-letter word in limited attempts with color hints.

**Simple approach:** Keep guesses array + current input; evaluate each guess against target.

```jsx
import { useState } from "react";

const TARGET = "REACT";

function score(guess) {
  return guess.split("").map((ch, i) => (ch === TARGET[i] ? "green" : TARGET.includes(ch) ? "yellow" : "gray"));
}

export default function Wordle() {
  const [current, setCurrent] = useState("");
  const [guesses, setGuesses] = useState([]);

  function submit() {
    if (current.length !== 5) return;
    setGuesses((g) => [...g, { word: current.toUpperCase(), marks: score(current.toUpperCase()) }]);
    setCurrent("");
  }

  return (
    <div>
      <input maxLength={5} value={current} onChange={(e) => setCurrent(e.target.value)} />
      <button onClick={submit}>Guess</button>
      {guesses.map((g, i) => <p key={i}>{g.word} - {g.marks.join(", ")}</p>)}
    </div>
  );
}
```

**Interview takeaway:** Explain scoring carefully (exact matches first, then partials with frequency handling in full solution).

### 49. Tic-tac-toe II (N x N, M to win)

**What to build:** Configurable board size and win length.

**Simple approach:** Generalize winner-check by scanning directions from each cell.

```jsx
import { useState } from "react";

function hasWinner(board, m) {
  const n = board.length;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const player = board[r][c];
      if (!player) continue;
      for (const [dr, dc] of dirs) {
        let ok = true;
        for (let k = 1; k < m; k++) {
          const nr = r + dr * k, nc = c + dc * k;
          if (nr < 0 || nr >= n || nc < 0 || nc >= n || board[nr][nc] !== player) {
            ok = false;
            break;
          }
        }
        if (ok) return player;
      }
    }
  }
  return null;
}

export default function TicTacToeNxN({ n = 5, m = 4 }) {
  const [board, setBoard] = useState(Array.from({ length: n }, () => Array(n).fill(null)));
  const [xTurn, setXTurn] = useState(true);
  const winner = hasWinner(board, m);

  function play(r, c) {
    if (winner || board[r][c]) return;
    setBoard((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = xTurn ? "X" : "O";
      return next;
    });
    setXTurn((v) => !v);
  }

  return (
    <div>
      {board.map((row, r) => (
        <div key={r}>
          {row.map((cell, c) => <button key={c} onClick={() => play(r, c)}>{cell || "-"}</button>)}
        </div>
      ))}
      <p>{winner ? `Winner: ${winner}` : `Turn: ${xTurn ? "X" : "O"}`}</p>
    </div>
  );
}
```

**Interview takeaway:** Show how your solution scales with `N` and `M`.

### 50. Image Carousel III (smooth + minimal DOM)

**What to build:** Smooth infinite carousel with minimal nodes.

**Simple approach:** Render only 3 slides (`prev`, `current`, `next`) and swap indexes after transition.

```jsx
import { useState } from "react";

export default function MinimalCarousel({ images }) {
  const [i, setI] = useState(0);
  const prev = (i - 1 + images.length) % images.length;
  const next = (i + 1) % images.length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
        <img src={images[prev]} alt="" />
        <img src={images[i]} alt="" />
        <img src={images[next]} alt="" />
      </div>
      <button onClick={() => setI(prev)}>Prev</button>
      <button onClick={() => setI(next)}>Next</button>
    </div>
  );
}
```

**Interview takeaway:** Reduced DOM footprint improves performance for very large image sets.

---

## Teaching methodology and detailed explanations (Q1-Q50)

Use this process for every practical interview problem:

1. **Clarify behavior first:** what user can do, what should happen, what errors to handle.
2. **Design state shape:** smallest possible state; derive everything else.
3. **Ship baseline first:** make it work in simple version before accessibility/performance.
4. **Harden second pass:** keyboard support, ARIA, loading/error, edge cases.
5. **Explain trade-offs:** client vs server pagination, recursion vs flat list, etc.

### Beginner (Q1-Q10)

#### Q1 Accordion
- **How to think:** One source of truth (`openIndex`) controls all panels.
- **Common mistakes:** Separate boolean per panel leads to hard-to-maintain logic.
- **Complexity:** Toggle O(1), render O(n).

#### Q2 Contact Form
- **How to think:** Controlled inputs + explicit submit states (`idle`, `sending`, `sent`, `error`).
- **Common mistakes:** Submitting empty fields, no loading lock, no API error UI.
- **Complexity:** Input updates O(1), submit O(1) client-side.

#### Q3 Holy Grail
- **How to think:** This is primarily a layout/CSS problem, not a React state problem.
- **Common mistakes:** Using many nested wrappers instead of Grid/Flex primitives.
- **Complexity:** No algorithmic complexity; static layout.

#### Q4 Progress Bars (list)
- **How to think:** Each bar is an entity with `id` + `value`; animate by updating value.
- **Common mistakes:** Trying to animate on first render without a second state update.
- **Complexity:** Add bar O(1), update bars O(n).

#### Q5 Mortgage Calculator
- **How to think:** Derived value from three inputs; use formula, avoid extra state for result.
- **Common mistakes:** Incorrect monthly rate conversion, divide-by-zero on 0% interest.
- **Complexity:** O(1).

#### Q6 Flight Booker
- **How to think:** Validation depends on trip type; derive `isValid`.
- **Common mistakes:** Allowing return date before departure.
- **Complexity:** O(1).

#### Q7 Generate Table
- **How to think:** Nested iteration (rows × columns).
- **Common mistakes:** Off-by-one numbering and unstable keys.
- **Complexity:** O(rows × cols).

#### Q8 Progress Bar (single)
- **How to think:** Input contract is `%` between 0-100; clamp aggressively.
- **Common mistakes:** Letting negative or >100 values break UI.
- **Complexity:** O(1).

#### Q9 Temperature Converter
- **How to think:** Keep one canonical temperature and convert for display.
- **Common mistakes:** Two independent states that desync.
- **Complexity:** O(1).

#### Q10 Tweet
- **How to think:** Presentational component with props and semantic tags.
- **Common mistakes:** Hard-coding data everywhere; inaccessible image alt text.
- **Complexity:** O(1).

### Intermediate (Q11-Q41)

#### Q11 Tabs
- **How to think:** Active tab id + lookup panel content.
- **Common mistakes:** Keeping duplicate panel state.
- **Complexity:** Tab switch O(1), render O(n tabs).

#### Q12 Data Table (pagination)
- **How to think:** `page`, `pageSize`, computed slice.
- **Common mistakes:** Wrong start index and page bounds.
- **Complexity:** Slice O(pageSize), metadata O(1).

#### Q13 Dice Roller
- **How to think:** Simulate N random values and compute aggregate.
- **Common mistakes:** Not constraining dice count.
- **Complexity:** O(n dice).

#### Q14 File Explorer
- **How to think:** Recursive UI matches recursive tree data.
- **Common mistakes:** Mutating tree object directly.
- **Complexity:** O(visible nodes).

#### Q15 Like Button
- **How to think:** Optimistic local update; API sync later.
- **Common mistakes:** Wrong count update due stale value.
- **Complexity:** O(1).

#### Q16 Modal Dialog
- **How to think:** Boolean open state + conditional portal/overlay render.
- **Common mistakes:** Not preventing click propagation from modal body.
- **Complexity:** O(1).

#### Q17 Star Rating
- **How to think:** Separate committed rating (`value`) from transient hover.
- **Common mistakes:** Using one state for both click and hover.
- **Complexity:** O(stars).

#### Q18 Todo List
- **How to think:** Immutable add/delete operations by id.
- **Common mistakes:** Index as key, no empty input guard.
- **Complexity:** Add O(1), delete O(n).

#### Q19 Traffic Light
- **How to think:** Finite state machine with timed transitions.
- **Common mistakes:** Leaking timers on rerender/unmount.
- **Complexity:** O(1) per tick.

#### Q20 Digital Clock
- **How to think:** Time is external state updated every second.
- **Common mistakes:** Incorrect interval cleanup.
- **Complexity:** O(digits) per render.

#### Q21 Tic-tac-toe
- **How to think:** Board array + line-check function.
- **Common mistakes:** Allowing moves after game end.
- **Complexity:** Move O(1), winner check O(1) for fixed 3×3.

#### Q22 Image Carousel
- **How to think:** Index with modulo wrap-around.
- **Common mistakes:** Negative index bug on Prev.
- **Complexity:** O(1).

#### Q23 Job Board
- **How to think:** Fetch list ids first, then batch-fetch item details.
- **Common mistakes:** Triggering N sequential network requests unnecessarily.
- **Complexity:** Network-bound, UI render O(items).

#### Q24 Stopwatch
- **How to think:** `elapsed` + `running`; derive display value.
- **Common mistakes:** Reset logic not clearing running timer.
- **Complexity:** O(1) per tick.

#### Q25 Transfer List
- **How to think:** Two collections + selected subset.
- **Common mistakes:** Forgetting to clear selection after transfer.
- **Complexity:** Transfer O(n).

#### Q26 Accordion II (ARIA)
- **How to think:** Link trigger and panel with id relationships.
- **Common mistakes:** Missing `aria-expanded` updates.
- **Complexity:** Same as basic accordion.

#### Q27 Accordion III (keyboard)
- **How to think:** Focus management problem, not just toggle problem.
- **Common mistakes:** Arrow keys move selection but not focus.
- **Complexity:** Key handling O(1).

#### Q28 Analog Clock
- **How to think:** Convert time units to degrees.
- **Common mistakes:** Hour hand not accounting for minutes.
- **Complexity:** O(1).

#### Q29 Data Table II (sorting)
- **How to think:** Keep `sortKey/sortDir`, sort derived copy.
- **Common mistakes:** Sorting original array (mutation bug).
- **Complexity:** O(n log n).

#### Q30 File Explorer II (semi-accessible)
- **How to think:** Tree semantics (`tree`, `treeitem`, `group`) for assistive tech.
- **Common mistakes:** Missing `aria-expanded` only on folders.
- **Complexity:** O(visible nodes).

#### Q31 File Explorer III (flat DOM)
- **How to think:** Flatten visible subtree for better scaling/virtualization.
- **Common mistakes:** Recomputing flatten incorrectly when open set changes.
- **Complexity:** Flatten O(visible nodes).

#### Q32 Grid Lights
- **How to think:** Activation stack records order; pop to reverse.
- **Common mistakes:** Capturing stale order in interval closure.
- **Complexity:** Activate O(1), full reverse O(n).

#### Q33 Modal Dialog II (semi-accessible)
- **How to think:** Correct role + title/description mapping.
- **Common mistakes:** Missing `aria-modal=true`.
- **Complexity:** O(1).

#### Q34 Modal Dialog III (close interactions)
- **How to think:** Multiple close channels should call same `onClose`.
- **Common mistakes:** Escape works only sometimes due bad listener lifecycle.
- **Complexity:** O(1).

#### Q35 Progress Bars II (sequential)
- **How to think:** Queue scheduler with at most one active job.
- **Common mistakes:** Starting all bars at once by accident.
- **Complexity:** O(n) scheduler pass.

#### Q36 Tabs II (semi-accessible)
- **How to think:** Correct tab roles/attrs first, keyboard later.
- **Common mistakes:** Panel not linked with `aria-labelledby`.
- **Complexity:** O(n tabs).

#### Q37 Tabs III (keyboard)
- **How to think:** Roving focus and selected tab sync.
- **Common mistakes:** Focus moves but active panel does not update.
- **Complexity:** O(1) key handling.

#### Q38 Progress Bars III (concurrent max 3)
- **How to think:** Queue + worker slot count pattern.
- **Common mistakes:** Race conditions when starting queued bars.
- **Complexity:** O(n) per scheduling cycle.

#### Q39 Birth Year Histogram
- **How to think:** Frequency map + normalized bar widths.
- **Common mistakes:** Sorting years lexicographically, not numerically.
- **Complexity:** Count O(n), render O(uniqueYears).

#### Q40 Connect Four
- **How to think:** Matrix board + gravity insertion + directional win check.
- **Common mistakes:** Not blocking drops into full column.
- **Complexity:** Drop O(rows), winner check O(rows × cols × directions) if full scan.

#### Q41 Image Carousel II (smooth)
- **How to think:** Animate transform on track container.
- **Common mistakes:** Transitioning `left` instead of transform (less performant).
- **Complexity:** O(1).

### Advanced (Q42-Q50)

#### Q42 Nested Checkboxes
- **How to think:** Downward propagation and upward aggregation.
- **Common mistakes:** Manual parent toggles without recomputing children.
- **Complexity:** Update O(size of affected subtree).

#### Q43 Auth Code Input
- **How to think:** Small state machine around cursor/focus movement.
- **Common mistakes:** Not handling paste and backspace navigation.
- **Complexity:** O(length of code), usually O(6).

#### Q44 Progress Bars IV (pause/resume)
- **How to think:** Explicit status enum (`queued/running/paused/done`) and scheduler.
- **Common mistakes:** Resume directly to `running` and breaking concurrency cap.
- **Complexity:** O(n) per tick.

#### Q45 Data Table III (generalized)
- **How to think:** Separate table engine (sort/paginate) from cell rendering config.
- **Common mistakes:** Hard-coding columns and losing reusability.
- **Complexity:** Sort O(n log n), paginate O(pageSize).

#### Q46 Modal Dialog IV (fully accessible)
- **How to think:** Focus trap, focus restore, Escape handling, proper labels.
- **Common mistakes:** Not restoring previously focused trigger element.
- **Complexity:** O(focusableElements) for trap operations.

#### Q47 Selectable Cells
- **How to think:** Pointer-drag selection mode and set-based membership.
- **Common mistakes:** Dragging continues after mouseup outside grid.
- **Complexity:** O(number of visited cells during drag).

#### Q48 Wordle
- **How to think:** Guess evaluation with exact matches then partial matches.
- **Common mistakes:** Incorrect duplicate-letter scoring.
- **Complexity:** O(wordLength) per guess.

#### Q49 Tic-tac-toe II (N x N, M to win)
- **How to think:** Generic directional streak check from each occupied cell.
- **Common mistakes:** Boundary errors while scanning diagonals.
- **Complexity:** Worst-case O(n² × 4 × m).

#### Q50 Image Carousel III (minimal DOM)
- **How to think:** Windowed rendering (`prev/current/next`) instead of all slides.
- **Common mistakes:** Broken wrap-around index math.
- **Complexity:** Render O(1) visible slides.

---

## Detailed per-problem notes (logic + CSS + React concepts)

This section gives a **teaching-first explanation for every problem**: exactly how the logic works, what CSS/layout ideas are used, and which React concepts the interviewer expects.

### Beginner deep-dive (Q1-Q10)

#### Q1 Accordion
- **Logic:** Store `openIndex`. Clicking a header compares current index and either opens it or collapses (`-1`).
- **CSS/layout concepts:** Vertical stack (`display: block` or column flex), clear click target (`button` full width), optional expand animation using `max-height` + `overflow: hidden`.
- **React concepts:** Single source of truth, conditional rendering, list rendering with stable keys.

#### Q2 Contact Form
- **Logic:** Controlled fields (`name/email/message`) + submit workflow (`idle -> sending -> sent/error`), then lock button during request.
- **CSS/layout concepts:** Form grid/column spacing, visible error/success text styles, focus outline for keyboard users.
- **React concepts:** Controlled components, async event handler, status-driven UI.

#### Q3 Holy Grail
- **Logic:** No complex state; it is structural composition (header/sidebar/main/footer).
- **CSS/layout concepts:** CSS Grid areas are best here because the page has named regions and predictable rows/columns.
- **React concepts:** Component composition and semantic structure (`header/main/aside/footer`).

#### Q4 Progress Bars (list)
- **Logic:** New bar starts at `0`, then scheduled update to `100` triggers animation. Each bar has `id/value`.
- **CSS/layout concepts:** Track + fill pattern, rounded track, `transition: width ...` for smooth growth.
- **React concepts:** Immutable array updates, staged state updates, mapping dynamic lists.

#### Q5 Mortgage Calculator
- **Logic:** Parse principal/rate/years, compute monthly EMI using formula; special-case zero interest.
- **CSS/layout concepts:** Numeric inputs aligned consistently, right-aligned output for readability.
- **React concepts:** Derived/computed values from state, memoization for expensive math (optional but good practice).

#### Q6 Flight Booker
- **Logic:** Trip type controls whether return date is enabled; validity derived from date ordering.
- **CSS/layout concepts:** Disable styles for inactive return input, helper text for invalid ranges.
- **React concepts:** Derived validation state, conditional UI based on mode.

#### Q7 Generate Table
- **Logic:** Double loop (`rows x cols`) to generate sequential values.
- **CSS/layout concepts:** Basic table borders, fixed cell sizing for clean grid output.
- **React concepts:** Nested list rendering, deterministic key usage.

#### Q8 Progress Bar (single)
- **Logic:** Receive `value`, clamp between 0 and 100, render width accordingly.
- **CSS/layout concepts:** Absolute text label centered over fill, smooth width transition.
- **React concepts:** Reusable presentational component with prop contract.

#### Q9 Temperature Converter
- **Logic:** Keep one canonical value and convert the opposite field from it; avoid circular updates.
- **CSS/layout concepts:** Side-by-side inputs with unit labels (`°C`, `°F`) and numeric alignment.
- **React concepts:** Input normalization/parsing, avoiding duplicated state.

#### Q10 Tweet UI
- **Logic:** Pure display component with props for user data and engagement values.
- **CSS/layout concepts:** Media object layout (avatar + content), typography hierarchy, icon-row spacing.
- **React concepts:** Stateless components, prop-driven rendering, semantic content structure.

### Intermediate deep-dive (Q11-Q41)

#### Q11 Tabs
- **Logic:** Keep `activeTabId`; clicking tab updates id and panel is selected by lookup.
- **CSS/layout concepts:** Active tab style (underline/color), panel container with spacing.
- **React concepts:** Controlled tab state, declarative panel rendering.

#### Q12 Data Table (pagination)
- **Logic:** Compute `start = (page - 1) * pageSize`; show `slice(start, start + pageSize)`.
- **CSS/layout concepts:** Table readability (zebra rows, compact cells), pagination controls alignment.
- **React concepts:** Derived arrays, memoized pagination slice, controlled page state.

#### Q13 Dice Roller
- **Logic:** Generate `count` random numbers from 1-6 and optionally compute sum.
- **CSS/layout concepts:** Grid/flex dice layout; each dice tile visually distinct.
- **React concepts:** Event-driven state updates, array generation via `Array.from`.

#### Q14 File Explorer
- **Logic:** Recursive node rendering; open folders tracked by state (Set or per-node local state).
- **CSS/layout concepts:** Indentation by depth, folder/file iconography, hover states for rows.
- **React concepts:** Recursive components, tree data rendering.

#### Q15 Like Button
- **Logic:** Toggle liked flag; adjust count based on previous state.
- **CSS/layout concepts:** Distinct liked vs unliked visual state (color, fill icon).
- **React concepts:** Functional state updates to avoid stale closures.

#### Q16 Modal Dialog
- **Logic:** `open` boolean controls mount/unmount; close via button/backdrop.
- **CSS/layout concepts:** Fixed full-screen overlay, centered panel, backdrop dimming.
- **React concepts:** Conditional rendering, click event propagation control.

#### Q17 Star Rating
- **Logic:** `hover` gives temporary preview, `value` stores final rating on click.
- **CSS/layout concepts:** Interactive icon states (inactive/hover/selected), pointer cursor.
- **React concepts:** Managing transient vs committed UI state.

#### Q18 Todo List
- **Logic:** Add immutable todo objects, delete by id filter.
- **CSS/layout concepts:** Clear hit targets for delete action, readable list spacing.
- **React concepts:** Immutable list operations and controlled text input.

#### Q19 Traffic Light
- **Logic:** Finite-state cycle with durations; timer advances index.
- **CSS/layout concepts:** Circular bulbs, inactive dimmed style, active glow effect.
- **React concepts:** Timed side effects, cleanup to avoid timer leaks.

#### Q20 Digital Clock
- **Logic:** Read current time every second and render digit representation.
- **CSS/layout concepts:** 7-segment look using segment bars or pseudo-elements, monospace spacing.
- **React concepts:** Real-time updates with intervals, formatting time output.

#### Q21 Tic-tac-toe
- **Logic:** Write move to board if empty; recompute winner from known winning lines.
- **CSS/layout concepts:** 3x3 equal cells, current turn/winner status display.
- **React concepts:** Immutable matrix updates, derived winner state.

#### Q22 Image Carousel
- **Logic:** Index navigation with modulo wrap-around.
- **CSS/layout concepts:** Fixed viewport size, image fit/crop behavior.
- **React concepts:** Controlled index state and event handlers.

#### Q23 Job Board
- **Logic:** Fetch ids, then fetch top job items, render title links.
- **CSS/layout concepts:** Loading skeleton/text, list spacing, link hover/readability.
- **React concepts:** Async data loading lifecycle, loading/error states.

#### Q24 Stopwatch
- **Logic:** Track elapsed ms and running state; interval updates while running.
- **CSS/layout concepts:** Prominent time typography, grouped control buttons.
- **React concepts:** Refs for timestamps, interval cleanup, derived formatted time.

#### Q25 Transfer List
- **Logic:** Two arrays + selected set; move selected items across lists.
- **CSS/layout concepts:** Two-panel layout, clear move buttons, selected row highlights.
- **React concepts:** Set operations, immutable filtering/appending.

#### Q26 Accordion II (ARIA)
- **Logic:** Same toggle model as Q1, plus explicit relationships between trigger/panel.
- **CSS/layout concepts:** Keep semantic heading + button pattern; visual open/closed indicator.
- **React concepts:** Accessibility attributes (`aria-expanded`, `aria-controls`, `role=region`).

#### Q27 Accordion III (keyboard)
- **Logic:** Arrow/Home/End keys move focus among headers; Enter/Space toggles panel.
- **CSS/layout concepts:** Visible focus ring and keyboard-friendly hit area.
- **React concepts:** Ref arrays for roving focus, keyboard event handling.

#### Q28 Analog Clock
- **Logic:** Convert hour/minute/second to rotation angles and update every second.
- **CSS/layout concepts:** Clock face center point; transform-origin at hand base.
- **React concepts:** Derived style values from date state.

#### Q29 Data Table II (sorting)
- **Logic:** Sort copied array by active key/direction; toggle direction on repeated header click.
- **CSS/layout concepts:** Sort indicator arrows and clickable header affordance.
- **React concepts:** `useMemo` for sorted view, avoid mutating input array.

#### Q30 File Explorer II (semi-accessible)
- **Logic:** Tree open/close behavior plus ARIA tree semantics.
- **CSS/layout concepts:** Depth-based indentation and row-level interaction styles.
- **React concepts:** Recursive rendering with accessibility roles.

#### Q31 File Explorer III (flat DOM)
- **Logic:** Flatten visible tree into row list; render one-level DOM list with depth padding.
- **CSS/layout concepts:** Depth padding replaces nested wrappers; easier virtualization styling.
- **React concepts:** Derived data transformation (`tree -> visible rows`) with memoization.

#### Q32 Grid Lights
- **Logic:** Record activation order; once full, remove lights in reverse order with timer.
- **CSS/layout concepts:** Fixed square grid with active/inactive contrast.
- **React concepts:** Stack-like behavior in UI state, interval-driven sequence updates.

#### Q33 Modal Dialog II (semi-accessible)
- **Logic:** Open/close flow with semantic dialog metadata.
- **CSS/layout concepts:** Overlay stacking (`z-index`), centered modal card.
- **React concepts:** ARIA labeling (`aria-labelledby`, `aria-describedby`, `aria-modal`).

#### Q34 Modal Dialog III (close interactions)
- **Logic:** Single close handler reused for button, backdrop, and Escape.
- **CSS/layout concepts:** Backdrop click area and explicit close affordance.
- **React concepts:** Window key listener lifecycle and cleanup.

#### Q35 Progress Bars II (sequential)
- **Logic:** Queue bars and process next only when current is done.
- **CSS/layout concepts:** Uniform spacing between bars, progress transition timing.
- **React concepts:** Scheduler pattern in component state.

#### Q36 Tabs II (semi-accessible)
- **Logic:** Active tab drives panel; role links connect tab and panel.
- **CSS/layout concepts:** Strong active-state cues, hidden/inactive panel behavior.
- **React concepts:** ARIA tab semantics (`tablist/tab/tabpanel`).

#### Q37 Tabs III (keyboard)
- **Logic:** Roving focus among tabs with arrow keys and instant activation.
- **CSS/layout concepts:** Focus visibility and active/hover differentiation.
- **React concepts:** Focus refs + keyboard navigation state.

#### Q38 Progress Bars III (concurrent max 3)
- **Logic:** Queue starts new bars only when active count < 3.
- **CSS/layout concepts:** Status color coding can show queued/running/done.
- **React concepts:** Concurrency-slot scheduler in UI state.

#### Q39 Birth Year Histogram
- **Logic:** Count occurrences per year then scale each bar width/height by max count.
- **CSS/layout concepts:** Axis labels, proportional bars, consistent bar gap.
- **React concepts:** Aggregation with `reduce`, numeric sorting.

#### Q40 Connect Four
- **Logic:** Drop token to lowest empty cell in selected column; check 4-direction wins.
- **CSS/layout concepts:** Board grid styling, token colors, hover preview for selected column.
- **React concepts:** Matrix state updates, turn-based game loop.

#### Q41 Image Carousel II (smooth)
- **Logic:** Translate slide track by index and animate transition.
- **CSS/layout concepts:** `overflow: hidden` viewport + `transform: translateX` + transition easing.
- **React concepts:** Controlled animation state from index changes.

### Advanced deep-dive (Q42-Q50)

#### Q42 Nested Checkboxes
- **Logic:** Parent toggle applies to descendants; parent state recalculated from children (checked/indeterminate).
- **CSS/layout concepts:** Tree indentation and indeterminate visual state.
- **React concepts:** Recursive state transforms and derived aggregate state.

#### Q43 Auth Code Input
- **Logic:** One char per box; auto-forward on input, auto-back on backspace, optional paste fan-out.
- **CSS/layout concepts:** Equal-width input boxes, center text, strong focus ring.
- **React concepts:** Ref-based focus control, guarded numeric input handling.

#### Q44 Progress Bars IV (pause/resume)
- **Logic:** State machine per bar (`queued/running/paused/done`) with global concurrency limiter.
- **CSS/layout concepts:** Visual paused/running styles and progress snapshots.
- **React concepts:** Tick-based scheduler, status transitions, immutable updates.

#### Q45 Data Table III (generalized)
- **Logic:** Generic column config + sort + paginate pipeline.
- **CSS/layout concepts:** Reusable table shell, responsive overflow handling.
- **React concepts:** Headless component pattern (`columns` config with optional renderers).

#### Q46 Modal Dialog IV (fully accessible)
- **Logic:** Trap focus within modal, close on Escape, restore focus to opener on close.
- **CSS/layout concepts:** Prevent background scroll and maintain visible focus indicators.
- **React concepts:** Focus management with refs and side-effect lifecycle.

#### Q47 Selectable Cells
- **Logic:** Drag-select by toggling selection mode on mousedown and collecting visited cells on mouseenter.
- **CSS/layout concepts:** Selected state color fill, grid hit-area consistency.
- **React concepts:** Pointer-driven interaction model with set-based selected ids.

#### Q48 Wordle
- **Logic:** Evaluate guess in passes (exact matches then partial matches) to handle duplicate letters correctly.
- **CSS/layout concepts:** Tile state colors (correct/present/absent), keyboard color sync.
- **React concepts:** Turn-based state progression, input normalization.

#### Q49 Tic-tac-toe II (N x N, M to win)
- **Logic:** Generalized directional streak check from each placed cell.
- **CSS/layout concepts:** Dynamic grid sizing and readable cell dimensions for larger N.
- **React concepts:** Parametric game logic (`n`, `m`) with reusable winner function.

#### Q50 Image Carousel III (minimal DOM)
- **Logic:** Render only neighboring slides (`prev/current/next`) and update window around index.
- **CSS/layout concepts:** Lightweight slide window layout with smooth transition hints.
- **React concepts:** Windowed rendering strategy for performance and lower DOM cost.

---

## Final preparation tips for these 50 problems

1. **First talk, then code:** State your data model and component state before typing.
2. **Solve in layers:** Basic functionality first, then accessibility, then performance.
3. **Use predictable state:** Prefer derived values over duplicated state.
4. **Name trade-offs clearly:** Example: “I used client-side pagination here; server-side is better for large data.”
5. **Practice time-boxing:** 15-25 minutes per problem in mock interviews.
