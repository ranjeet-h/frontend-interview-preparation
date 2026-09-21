# Coding Practice

Rust-specific implementation tasks. Each snippet is a minimal complete pattern
you should be able to reproduce from memory. Run with `cargo run` (Tokio tasks
need `tokio = { version = "1", features = ["full"] }`).

## Struct / Enum / Trait basics (Q121–Q127)

### Q121 — Struct with constructor and methods

```rust
struct User {
    id: u64,
    name: String,
}

impl User {
    fn new(id: u64, name: &str) -> Self {
        Self { id, name: name.to_owned() }
    }
    fn greet(&self) -> String {
        format!("hi, {} (#{})", self.name, self.id)
    }
}

fn main() {
    let u = User::new(1, "asha");
    println!("{}", u.greet());
}
```

### Q122 — Enum + `match`

```rust
enum Payment {
    Cash(u32),
    Card { last4: u16, amount: u32 },
}

fn describe(p: &Payment) -> String {
    match p {
        Payment::Cash(n) => format!("cash {n}"),
        Payment::Card { last4, amount } => format!("card *{last4}: {amount}"),
    }
}

fn main() {
    println!("{}", describe(&Payment::Card { last4: 4242, amount: 99 }));
}
```

### Q123 — Custom trait for multiple structs

```rust
trait Summary {
    fn summarize(&self) -> String;
}

struct Article { title: String }
struct Tweet { text: String }

impl Summary for Article {
    fn summarize(&self) -> String { format!("article: {}", self.title) }
}
impl Summary for Tweet {
    fn summarize(&self) -> String { format!("tweet: {}", self.text) }
}

fn main() {
    println!("{}", Article { title: "rust".into() }.summarize());
    println!("{}", Tweet { text: "hi".into() }.summarize());
}
```

### Q124 — Generic function with trait bounds

```rust
fn largest<T: PartialOrd>(a: T, b: T) -> T {
    if a >= b { a } else { b }
}

fn main() {
    println!("{}", largest(3, 7));
    println!("{}", largest(3.5, 2.5));
}
```

### Q125 — Accept both `String` and `&str`

```rust
fn greet(name: &str) -> String {
    format!("hi {name}")
}

fn main() {
    let owned = String::from("asha");
    println!("{}", greet(&owned)); // no clone
    println!("{}", greet("sam"));  // literal works
}
```

### Q126 — Return a borrowed value with lifetimes

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() >= y.len() { x } else { y }
}

fn main() {
    println!("{}", longest("abc", "de"));
}
```

### Q127 — Struct containing `&str`

```rust
struct Excerpt<'a> {
    text: &'a str,
}

fn main() {
    let book = String::from("rust book text");
    let e = Excerpt { text: &book };
    println!("{}", e.text);
}
```

## Collections & iterators (Q128–Q133)

### Q128 — Word frequencies with `HashMap`

```rust
use std::collections::HashMap;

fn word_freq(words: &[&str]) -> HashMap<&str, usize> {
    let mut m = HashMap::new();
    for w in words {
        *m.entry(*w).or_insert(0) += 1;
    }
    m
}

fn main() {
    println!("{:?}", word_freq(&["a", "b", "a"]));
}
```

### Q129 — Remove duplicates from a `Vec`

```rust
fn dedup(mut v: Vec<i32>) -> Vec<i32> {
    v.sort_unstable();
    v.dedup();
    v
}

fn main() {
    println!("{:?}", dedup(vec![3, 1, 2, 1, 3])); // [1, 2, 3]
}
```

### Q130 — Group values with `HashMap`

```rust
use std::collections::HashMap;

fn group_by_len(words: &[&str]) -> HashMap<usize, Vec<&str>> {
    let mut m: HashMap<usize, Vec<&str>> = HashMap::new();
    for w in words {
        m.entry(w.len()).or_default().push(w);
    }
    m
}

fn main() {
    println!("{:?}", group_by_len(&["a", "bb", "cc", "ddd"]));
}
```

### Q131 — Transform with iterators, not loops

```rust
fn main() {
    let v = vec![1, 2, 3, 4];
    let doubled: Vec<i32> = v.iter().map(|x| x * 2).collect();
    println!("{doubled:?}");
}
```

### Q132 — `map` + `filter` + `collect`

```rust
fn main() {
    let v = vec![1, 2, 3, 4, 5];
    let out: Vec<i32> = v
        .iter()
        .filter(|x| *x % 2 == 0)
        .map(|x| x * x)
        .collect();
    println!("{out:?}"); // [4, 16]
}
```

### Q133 — `Vec<String>` without unnecessary clones

```rust
fn shout(names: &[String]) -> Vec<String> {
    names.iter().map(|s| s.to_uppercase()).collect()
    // iterate by reference; allocate only the outputs
}

fn main() {
    let names = vec!["asha".to_owned(), "sam".to_owned()];
    println!("{:?}", shout(&names));
    println!("{:?}", names); // still usable: no move
}
```

## Errors (Q134–Q136)

### Q134 — Parse input, return `Result`

```rust
fn parse_age(s: &str) -> Result<u8, String> {
    s.trim().parse::<u8>().map_err(|e| format!("bad age: {e}"))
}

fn main() {
    println!("{:?}", parse_age("42"));
    println!("{:?}", parse_age("abc"));
}
```

### Q135 — Custom error type

```rust
use std::fmt;

#[derive(Debug)]
enum AppError {
    Missing(String),
    Invalid(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Missing(k) => write!(f, "missing field: {k}"),
            AppError::Invalid(m) => write!(f, "invalid: {m}"),
        }
    }
}
impl std::error::Error for AppError {}

fn get_name(name: Option<&str>) -> Result<String, AppError> {
    match name {
        Some(n) if !n.is_empty() => Ok(n.to_owned()),
        _ => Err(AppError::Missing("name".to_owned())),
    }
}

fn main() {
    println!("{:?}", get_name(Some("asha")));
    println!("{:?}", get_name(None));
}
```

### Q136 — Read a file with `?`

```rust
use std::fs;

fn read_config(path: &str) -> Result<String, Box<dyn std::error::Error>> {
    let text = fs::read_to_string(path)?; // io error auto-converts
    if text.trim().is_empty() {
        return Err("empty config".into());
    }
    Ok(text)
}

fn main() {
    match read_config("Cargo.toml") {
        Ok(t) => println!("{} bytes", t.len()),
        Err(e) => eprintln!("config error: {e}"),
    }
}
```

## Owned structures (Q137–Q140)

### Q137 — Generic stack with `Vec<T>`

```rust
struct Stack<T> {
    items: Vec<T>,
}

impl<T> Stack<T> {
    fn new() -> Self {
        Self { items: Vec::new() }
    }
    fn push(&mut self, v: T) {
        self.items.push(v);
    }
    fn pop(&mut self) -> Option<T> {
        self.items.pop()
    }
    fn peek(&self) -> Option<&T> {
        self.items.last()
    }
}

fn main() {
    let mut s = Stack::new();
    s.push(1);
    s.push(2);
    println!("{:?} {:?}", s.peek(), s.pop());
}
```

### Q138 — Linked list with `Box`

```rust
enum List {
    Cons(i32, Box<List>),
    Nil,
}

impl List {
    fn len(&self) -> usize {
        match self {
            List::Nil => 0,
            List::Cons(_, next) => 1 + next.len(),
        }
    }
}

fn main() {
    let l = List::Cons(1, Box::new(List::Cons(2, Box::new(List::Nil))));
    println!("len {}", l.len());
}
```

### Q139 — Shared ownership with `Rc`

```rust
use std::rc::Rc;

fn main() {
    let shared = Rc::new(vec![1, 2, 3]);
    let a = Rc::clone(&shared);
    let b = Rc::clone(&shared);
    println!("{} {} strong={}", a.len(), b.len(), Rc::strong_count(&shared));
}
```

### Q140 — Shared mutable state with `Rc<RefCell<T>>`

```rust
use std::cell::RefCell;
use std::rc::Rc;

fn main() {
    let shared = Rc::new(RefCell::new(vec![1]));
    let w1 = Rc::clone(&shared);
    let w2 = Rc::clone(&shared);
    w1.borrow_mut().push(2);
    w2.borrow_mut().push(3);
    println!("{:?}", shared.borrow()); // [1, 2, 3]
}
```

## Threads & channels (Q141–Q144)

### Q141 — Counter with `Arc<Mutex<T>>`

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = Vec::new();
    for _ in 0..8 {
        let c = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            for _ in 0..1_000 {
                *c.lock().unwrap() += 1;
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    println!("{}", counter.lock().unwrap()); // 8000
}
```

### Q142 — Spawn threads and join all

```rust
use std::thread;

fn main() {
    let handles: Vec<_> = (0..4)
        .map(|i| thread::spawn(move || format!("task-{i}")))
        .collect();
    for h in handles {
        println!("{}", h.join().unwrap());
    }
}
```

### Q143 — Send data with channels

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        for i in 0..3 {
            tx.send(i).unwrap();
        }
    });
    for msg in rx {
        println!("got {msg}");
    }
}
```

### Q144 — Producer-consumer with channels

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel::<String>();
    let producers: Vec<_> = (0..2)
        .map(|id| {
            let tx = tx.clone();
            thread::spawn(move || {
                for i in 0..3 {
                    tx.send(format!("p{id}-{i}")).unwrap();
                    thread::sleep(Duration::from_millis(10));
                }
            })
        })
        .collect();
    drop(tx); // close extra sender so rx ends
    for msg in rx {
        println!("consumed {msg}");
    }
    for p in producers {
        p.join().unwrap();
    }
}
```

## Async / Tokio (Q145–Q150)

> Run these with `#[tokio::main]`.

### Q145 — Concurrent async functions

```rust
async fn fetch_user(id: u64) -> String {
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    format!("user-{id}")
}

#[tokio::main]
async fn main() {
    let (a, b) = tokio::join!(fetch_user(1), fetch_user(2));
    println!("{a} {b}");
}
```

### Q146 — Spawn multiple Tokio tasks

```rust
#[tokio::main]
async fn main() {
    let mut handles = Vec::new();
    for i in 0..3 {
        handles.push(tokio::spawn(async move { format!("task-{i}") }));
    }
    for h in handles {
        println!("{}", h.await.unwrap());
    }
}
```

### Q147 — `join!` two operations

```rust
async fn a() -> u32 {
    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    1
}
async fn b() -> u32 {
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    2
}

#[tokio::main]
async fn main() {
    let (x, y) = tokio::join!(a(), b());
    println!("{x} {y}"); // waits for both
}
```

### Q148 — Race with `select!`

```rust
#[tokio::main]
async fn main() {
    tokio::select! {
        _ = tokio::time::sleep(std::time::Duration::from_millis(10)) => {
            println!("fast wins");
        }
        _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {
            println!("slow wins");
        }
    }
}
```

### Q149 — Timeout on async work

```rust
use std::time::Duration;

async fn slow() -> String {
    tokio::time::sleep(Duration::from_millis(200)).await;
    "done".to_owned()
}

#[tokio::main]
async fn main() {
    match tokio::time::timeout(Duration::from_millis(50), slow()).await {
        Ok(v) => println!("{v}"),
        Err(_) => println!("timed out"),
    }
}
```

### Q150 — Blocking work off the executor

```rust
#[tokio::main]
async fn main() {
    // CPU work on the blocking pool, not an async worker:
    let sum = tokio::task::spawn_blocking(|| (0..1_000_000u64).sum::<u64>())
        .await
        .unwrap();
    println!("{sum}");

    // For async file reads use tokio::fs, not std::fs:
    let bytes = tokio::fs::read("Cargo.toml").await.unwrap();
    println!("{} bytes", bytes.len());
}
```
