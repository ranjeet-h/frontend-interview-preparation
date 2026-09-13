# `Union` and Sum Types in Python: `A | B` Syntax, Discriminated Unions, and Pattern Matching (`match`)

## 1. Why This Exists — The Problem First

Imagine you run the payment backend for an e-commerce platform. Your checkout service receives payment requests from multiple sources: credit cards, bank direct debits, digital wallets, and crypto payments. Each payment method has completely different required fields. A credit card needs a sixteen-digit PAN, CVV, and expiration date. A bank transfer needs a routing number and account number. A crypto payment needs a transaction hash and wallet address.

In early Python backends, developers handled this by accepting a raw dictionary or a generic data object and writing a maze of defensive lookups:

```python
def process_payment(data: dict):
    if "card_number" in data:
        charge_card(data["card_number"], data["cvv"], data["exp"])
    elif "routing_number" in data:
        transfer_bank(data["routing_number"], data["account_number"])
    elif "tx_hash" in data:
        verify_crypto(data["tx_hash"], data["wallet_address"])
    else:
        raise ValueError("Unknown payment payload")
```

This pattern causes three catastrophic production failures:

First, subtle typos like `data.get("card_numbr")` evaluate to `None`, silently bypassing the right handler and crashing downstream with a 2 AM `KeyError` or `AttributeError`. 

Second, static type checkers like mypy and pyright are completely blind. A `dict[str, Any]` tells your IDE nothing about whether `cvv` is present, whether `routing_number` is an integer or a string, or whether you misspelled a key.

Third, and worst of all, is the unhandled variant bug. Six months later, the business adds `ApplePay`. You add the model in the ingestion webhook, but you forget to update the reconciliation worker and the refund pipeline. Because Python does not force you to handle every possible shape, your code silently falls through into the `else` branch or returns `None`, quietly dropping transactions in production.

Python solves this with **Union types (`A | B`)**, **Discriminated Unions (Sum Types)**, and **Structural Pattern Matching (`match/case`) with exhaustiveness checking**. Together, they turn polymorphic runtime guesswork into strict, compile-time verified contracts.

## 2. The Analogy — Make It Obvious

Think of an international postal sorting facility handling incoming parcels.

If citizens drop unlabelled items into a general drop box, the mail sorter must open every box, inspect the contents, sniff the powders, and test the materials just to figure out what it is and where it goes. This is slow, dangerous, and error-prone. That is naive dictionary parsing.

A standard **Union (`A | B`)** is like a package marked with a label that says: *"This envelope contains either a Passport OR a Driver's License."* The sorter knows the package is guaranteed to hold one of those two valid identity documents. However, before the sorter can stamp a visa or log driving points, they must open the envelope and inspect which document is actually inside. This inspection step is **Type Narrowing**.

A **Discriminated Union (Tagged Union)** is much smarter. The sender places an official, standardized sticker on the outside of the envelope: `TYPE: "PASSPORT"` or `TYPE: "DRIVERS_LICENSE"`. The high-speed optical scanner reads that single tag instantly. It never has to guess or probe internal fields.

**Structural Pattern Matching (`match/case`) with an exhaustiveness check** is the master triage SOP on the sorting floor. When a package arrives, the scanner routes it through designated chutes based on its tag. If head office introduces a new package type (`TYPE: "NATIONAL_ID"`) and you forget to build a chute for it, the master checklist halts the entire conveyor system at startup and refuses to run until every single valid tag has an explicit, designated processing chute.

## 3. How It Actually Works — The Full Explanation

Let us break down how Python models unions, how type checkers narrow them, and how production frameworks like Pydantic process them under the hood.

**The Evolution: `typing.Union[A, B]` to Modern `A | B` (PEP 604)**

Prior to Python 3.10, multi-type annotations required importing `Union` from the `typing` module:

```python
from typing import Union

def parse_id(val: Union[int, str]) -> str:
    return str(val)
```

Behind the scenes, `Union[int, str]` instantiates a `_UnionGenericAlias` object in the typing module. It flattens nested unions automatically (`Union[int, Union[str, bool]]` becomes `Union[int, str, bool]`) and removes duplicate entries (`Union[int, int]` becomes `int`).

Python 3.10 introduced **PEP 604**, which overloaded the bitwise OR operator (`|`) directly on Python type objects. Now, writing `int | str` creates a lightweight `types.UnionType` object directly in the CPython runtime. It requires no imports, reads cleanly, and simplifies nullable types: `Optional[str]` is now written as `str | None`.

**Type Narrowing (Control Flow Analysis)**

When a variable has a union type like `x: int | str`, you cannot immediately call `x.upper()` or `x.bit_length()`. The type checker will block you because neither method exists on both types.

To use `x`, you must perform **Type Narrowing** using runtime guards like `isinstance()`:

```python
def process(x: int | str) -> str:
    if isinstance(x, str):
        # The type checker narrows x to 'str' inside this block
        return x.upper()
    # In the else/fallthrough branch, the type checker narrows x to 'int'
    return f"Number: {x + 1}"
```

Static analysis tools (mypy, pyright) perform control flow analysis. Inside the `if` block, the type checker subtracts `int` from the union, leaving only `str`. Past the return statement, it subtracts `str`, leaving only `int`.

**Discriminated Unions (Sum Types)**

When handling complex domain objects instead of primitive types, basic unions struggle. If you have two dataclasses with overlapping attributes (for instance, both have `id` and `timestamp`), checking attributes with `hasattr()` is fragile and messy.

A **Discriminated Union** (also called a **Tagged Union** or **Algebraic Sum Type**) solves this by giving every variant a shared literal field that acts as the tag:

```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class CardPayment:
    type: Literal["card"]
    card_number: str
    cvv: str

@dataclass
class BankPayment:
    type: Literal["bank"]
    routing_number: str
    account_number: str

Payment = CardPayment | BankPayment
```

The field `type` is typed with `typing.Literal`. When code checks `if payment.type == "card":`, the type checker immediately narrows the entire object to `CardPayment`, unlocking safe access to `card_number` and `cvv`.

**Structural Pattern Matching (PEP 634) and Exhaustiveness Checking**

Python 3.10 added the `match/case` statement. Unlike basic switch statements in C or Java, Python pattern matching performs type checking, value matching, and variable destructuring in one unified step:

```python
def execute_payment(payment: Payment) -> None:
    match payment:
        case CardPayment(card_number=num, cvv=cvv):
            charge_credit_card(num, cvv)
        case BankPayment(routing_number=rt, account_number=acc):
            debit_bank_account(rt, acc)
```

To guarantee that every possible union variant is handled, Python 3.11 provides `typing.assert_never()` (or `typing_extensions.assert_never` for older versions). If you add a fallback `case _ as unreachable:` and pass `unreachable` to `assert_never()`, the type checker validates that the code can never reach that point. If a developer adds `CryptoPayment` to the `Payment` union but forgets to add a `case CryptoPayment:`, the type checker flags an immediate build error before the code ever runs:

```python
from typing import assert_never

def execute_payment(payment: Payment) -> None:
    match payment:
        case CardPayment():
            ...
        case BankPayment():
            ...
        case _ as unreachable:
            assert_never(unreachable)  # Fails type check if any variant is unhandled
```

**Pydantic V2 Discriminated Unions vs Pydantic V1 Traps**

In API frameworks like FastAPI, unions are heavily used to parse incoming JSON payloads into validated models.

In **Pydantic V1**, untagged unions used a naive "left-to-right trial" strategy. If you wrote `Union[CardPayment, BankPayment]`, Pydantic would attempt to validate the raw JSON against `CardPayment` first. If `CardPayment` had fields with default values or coercible types, Pydantic would greedily coerce a bank transfer into an invalid card model. Worse, if validation failed on all types, Pydantic generated massive, confusing error trees trying to explain why the payload failed every single union candidate.

In **Pydantic V2**, discriminated unions are first-class primitives configured with `Field(discriminator='type')` and `Annotated`. When a JSON payload arrives, Pydantic inspects the `type` tag first, performs an `O(1)` hash map lookup to select the exact target schema, and validates only against that model. If the tag is invalid, it raises a clean, precise error in microseconds.

## 4. Real Code — See It Working

Here is a complete, runnable, production-ready implementation showcasing modern `A | B` syntax, Discriminated Unions with Dataclasses, Structural Pattern Matching with `assert_never`, and Pydantic V2 discriminated deserialization.

```python
from dataclasses import dataclass
from typing import Annotated, Literal, Union, assert_never
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

# =====================================================================
# 1. Domain Modeling with Discriminated Unions (Dataclasses + Literal)
# =====================================================================

@dataclass(frozen=True)
class CreditCardEvent:
    type: Literal["card"]
    card_number: str
    amount_cents: int

@dataclass(frozen=True)
class BankTransferEvent:
    type: Literal["bank"]
    routing_number: str
    account_number: str
    amount_cents: int

@dataclass(frozen=True)
class CryptoEvent:
    type: Literal["crypto"]
    wallet_address: str
    tx_hash: str
    amount_cents: int

# The Sum Type: an Event can ONLY be one of these three exact shapes
PaymentEvent = CreditCardEvent | BankTransferEvent | CryptoEvent


# =====================================================================
# 2. Exhaustive Pattern Matching with assert_never
# =====================================================================

def dispatch_payment_event(event: PaymentEvent) -> str:
    # Pattern matching unpacks attributes and narrows types simultaneously
    match event:
        case CreditCardEvent(card_number=pan, amount_cents=cents):
            masked = f"****-****-****-{pan[-4:]}"
            return f"Processed card {masked} for ${cents / 100:.2f}"

        case BankTransferEvent(routing_number=rt, amount_cents=cents):
            return f"Initiated ACH debit via routing {rt} for ${cents / 100:.2f}"

        case CryptoEvent(wallet_address=addr, tx_hash=tx, amount_cents=cents):
            return f"Verified on-chain tx {tx[:8]}... to {addr[:6]}... for ${cents / 100:.2f}"

        # If a developer adds 'ApplePayEvent' to PaymentEvent but misses a case here,
        # mypy/pyright will flag assert_never(unreachable) as a type check error!
        case _ as unreachable:
            assert_never(unreachable)


# =====================================================================
# 3. Pydantic V2 High-Performance Discriminated Union Deserialization
# =====================================================================

class CardPayload(BaseModel):
    payment_method: Literal["credit_card"]
    pan: str
    cvv: str

class BankPayload(BaseModel):
    payment_method: Literal["bank_wire"]
    iban: str
    swift: str

# Annotated with Field(discriminator=...) tells Pydantic to do O(1) tag routing
PolymorphicPayment = Annotated[
    Union[CardPayload, BankPayload],
    Field(discriminator="payment_method")
]

# TypeAdapter allows validating top-level Union structures directly
payment_parser = TypeAdapter(PolymorphicPayment)


# =====================================================================
# Execution & Verification
# =====================================================================

if __name__ == "__main__":
    # Test 1: Dataclass pattern matching
    card_ev = CreditCardEvent(type="card", card_number="4111222233334444", amount_cents=4999)
    bank_ev = BankTransferEvent(type="bank", routing_number="121000358", account_number="987654321", amount_cents=15000)
    crypto_ev = CryptoEvent(type="crypto", wallet_address="0x71C...897", tx_hash="0xabc123456789", amount_cents=250000)

    print(dispatch_payment_event(card_ev))
    print(dispatch_payment_event(bank_ev))
    print(dispatch_payment_event(crypto_ev))

    # Test 2: Pydantic V2 tag-based parsing
    raw_json = {"payment_method": "credit_card", "pan": "4111222233334444", "cvv": "123"}
    parsed_model = payment_parser.validate_python(raw_json)
    print(f"Pydantic parsed model: {type(parsed_model).__name__} -> {parsed_model}")

    # Test 3: Invalid tag rejection
    try:
        payment_parser.validate_python({"payment_method": "cash_on_delivery"})
    except ValidationError as err:
        print(f"Pydantic rejected invalid tag cleanly: {err.errors()[0]['msg']}")
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between `typing.Union[A, B]` and Python 3.10's `A | B` syntax?**

At runtime, `typing.Union[A, B]` creates an instance of `typing._UnionGenericAlias`, whereas `A | B` creates an instance of `types.UnionType` using Python's built-in bitwise OR operator protocol (`__or__` / `__ror__`).

Functionally, they represent the exact same type system concept to static type checkers. However, `A | B` (PEP 604) provides four major benefits:
1. No imports required from the `typing` module.
2. Cleaner syntax for nullable types (`str | None` instead of `Optional[str]`).
3. Works directly inside `isinstance(val, int | str)` in Python 3.10+, eliminating the need to pass tuples like `isinstance(val, (int, str))`.
4. Lower import overhead and faster module startup time because fewer typing classes are instantiated.

**Q: What is a Discriminated Union (Sum Type), and why is it superior to an untagged Union for domain modeling?**

An untagged union (`A | B`) says a value can be of type `A` or type `B`. If `A` and `B` have distinct structural properties, you must inspect their fields manually using `hasattr()` or `isinstance()`. If their fields overlap or if you are parsing raw untyped JSON, deciding which type it represents requires guessing or sequential trial validation.

A Discriminated Union explicitly binds a shared, single-value tag field (typically `type: Literal["variant_name"]`) across all members of the union. This gives three architectural advantages:
1. **O(1) Deserialization:** Serializers and validation libraries (like Pydantic V2) check the tag first and immediately route the payload to the correct validator without trial-and-error.
2. **Deterministic Type Narrowing:** Checking `if item.type == "card"` narrows the type instantly without needing class-level `isinstance()` checks, making it work seamlessly over serializable dicts and typed data objects.
3. **Safe Evolution:** Adding a new tag ensures that any unhandled branch can be caught statically during CI.

**Q: How do you achieve compile-time exhaustiveness checking in Python?**

Python is dynamically typed and does not natively halt runtime execution if a `match/case` statement fails to match all union members. To enforce compile-time exhaustiveness:

1. Use `typing.assert_never` (Python 3.11+) or `typing_extensions.assert_never`.
2. In your `match/case` or `if/elif` block, add a wildcard fallback branch: `case _ as unreachable: assert_never(unreachable)`.
3. The function `assert_never(arg: Never) -> NoReturn` accepts only the bottom type `Never`.
4. If your pattern matching handles every member of the union, the type checker narrows the type of `unreachable` to `Never`, and type checking passes.
5. If you add a new variant to your union and forget to add a `case` for it, the type of `unreachable` will be that unhandled variant. The type checker detects that you passed a real type to a function expecting `Never`, and throws a static build error.

**Q: Why did Pydantic V1 struggle with `Union` validation, and how does Pydantic V2 fix it?**

In Pydantic V1, when a field was typed as `Union[ModelA, ModelB, ModelC]`, Pydantic used sequential left-to-right trial validation. It attempted to parse the input dictionary against `ModelA`. If `ModelA` had default fields, type coercions (like turning a string into an integer), or optional attributes, the payload might match `ModelA` even if the client intended `ModelB`. Furthermore, if the payload was completely invalid, Pydantic generated an enormous error trace attempting to list every validation error across all three models.

In Pydantic V2 (powered by its Rust core, `pydantic-core`), you declare discriminated unions using `Annotated[Union[ModelA, ModelB], Field(discriminator="type")]` or `Discriminator`. Pydantic creates a direct hash map of tag values to model schemas. It reads the discriminator key from the incoming JSON in `O(1)` time, picks the exact model, and runs validation only once. If the tag is unknown, it produces a single, readable error: `Input tag 'unknown' is not a valid discriminator`.

**Q: What is the difference between Structural Pattern Matching (`match/case`) and cascading `if/elif isinstance()`?**

While `if/elif isinstance()` only checks the class type of an object, Python's `match/case` (PEP 634) combines three operations in a single declarative syntax:
1. **Type Checking:** `case CardPayment():` verifies the instance type.
2. **Attribute & Structural Destructuring:** `case CardPayment(card_number=num, cvv=cvv):` extracts internal attributes into local variables in one step without manual lookups (`num = event.card_number`).
3. **Value Filtering & Guards:** You can combine structural matching with conditional guard clauses: `case CardPayment(amount_cents=cents) if cents > 100_000:`.

`match/case` provides cleaner readability for complex polymorphic branching and integrates directly with static exhaustiveness checking.

## 6. The Traps — What Goes Wrong

**Trap 1: The Greedy Deserialization Bug in Untagged Unions**

When using untagged unions in data validation libraries or custom parsers, union order matters dangerously if types are coercible.

```python
from pydantic import BaseModel

class FuzzySearch(BaseModel):
    query: int | str  # Python will try validating as int first!

# If a user passes query="12345", Pydantic might coerce it to integer 12345.
# If the user passes query="01234" (a zip code), coercing to int turns it into 1234, destroying leading zeros!
```

*The Fix:* Always put stricter, more specific types before broader types, or use a Discriminated Union where every variant declares its exact contract. For identifiers like postal codes or phone numbers, never use `int | str`; use strict `str`.

**Trap 2: Running `isinstance()` with Subscripted `typing.Union` in Older Python Versions**

In Python 3.9 and earlier, writing `isinstance(x, Union[int, str])` raises an immediate runtime exception:

```python
# In Python 3.9:
from typing import Union

x = 10
isinstance(x, Union[int, str])
# TypeError: Subscripted generics cannot be used with class and instance checks
```

*The Fix:* In Python 3.9 and earlier, use a tuple of types: `isinstance(x, (int, str))`. In Python 3.10+, you can use the pipe syntax directly: `isinstance(x, int | str)`.

**Trap 3: False Sense of Exhaustiveness Without `assert_never`**

Developers often assume that Python's `match/case` statement will throw an exception if an incoming object does not match any `case` block.

In reality, Python simply falls through the `match` block without doing anything and continues executing the rest of the function, silently returning `None`.

```python
def handle(event: CardEvent | BankEvent):
    match event:
        case CardEvent():
            return "card"
        # Missing BankEvent!

# If you call handle(BankEvent()), it silently returns None instead of raising an error.
```

*The Fix:* Always attach a default `case _ as unreachable: assert_never(unreachable)` branch so your CI type checker fails if a variant is omitted.

**Trap 4: Subclass Shadowing in Union Branches**

Because `isinstance()` and class pattern matching evaluate truthiness hierarchically based on inheritance, placing a parent class before a child class in your `if/elif` or `match/case` branches will starve the child class handler.

```python
class BaseUser:
    pass

class SuperAdmin(BaseUser):
    pass

def route_user(user: SuperAdmin | BaseUser):
    match user:
        case BaseUser():
            # SuperAdmin is a subclass of BaseUser, so ALL SuperAdmins match here!
            return "Standard Dashboard"
        case SuperAdmin():
            # DEAD CODE: Can never be reached
            return "Admin Dashboard"
```

*The Fix:* Order your checks from the most specific subclass to the most general base class, or avoid inheritance entirely in favor of tagged dataclasses with `Literal` discriminators.

**Trap 5: Union Proliferation as an Anti-Pattern ("The Kitchen Sink Function")**

When developers discover Union types, they sometimes use them to patch poorly designed functions that do too many unrelated things:

```python
# AVOID THIS:
def fetch_data(param: int | str | list[str] | dict[str, Any] | None) -> User | list[Item] | dict | bool:
    ...
```

If a function accepts five different types and returns four different types, `Union` is not solving your problem—it is hiding architectural coupling. Every caller must write four `isinstance()` checks just to consume the return value.

*The Fix:* Split the function into distinct, single-purpose functions (`fetch_user_by_id`, `fetch_items_by_tags`), or return a dedicated Result object.

## 7. Compare With Related Concepts

| Concept | Key Mechanic | When to Use |
| :--- | :--- | :--- |
| **`Union[A, B]` (`A \| B`)** | Static declaration that a value is one of several types. | When a function legitimately accepts or returns multiple distinct types (e.g., `id: int \| str`). |
| **`Optional[T]` (`T \| None`)** | Shorthand specialization of `Union[T, None]`. | When a value can be present or absent/null. Modern code should prefer `T \| None`. |
| **Discriminated Union (Sum Type)** | A Union where every variant shares a common `Literal` tag field (`type: Literal['tag']`). | Modeling polymorphic domain events, API request/response payloads, and state machines. |
| **OOP Inheritance (Subtyping)** | A base class with virtual methods overridden by subclasses (`Animal.speak()`). | When behavior is packaged with the data and variants share extensive common implementation code. |
| **Intersection / Protocols (`Protocol`)** | Static duck typing requiring an object to implement specific methods (`Drawable & Serializable`). | When you care about what an object *can do* (its capabilities), not *what it is* (its exact type). |
| **`typing.Any`** | Turns off static type checking completely for that value. | Escape hatch during legacy migrations; avoid in production domain models. |

**Quick Selection Rules:**
- If a value can be missing: use **`T | None`**.
- If a value can be one of several unrelated primitive types: use **`A | B`**.
- If you are modeling distinct domain objects or JSON payloads with different schemas: use a **Discriminated Union with `Literal` tags**.
- If you want polymorphism where objects execute their own internal logic: use **Class Inheritance or Protocols**.

## 8. 🧠 The Memory Hook

A standard **Union (`A | B`)** is an unlabeled parcel that holds one of several valid items—you must open and inspect it (**Type Narrowing**) before using it. A **Discriminated Union** slaps a bright **`Literal` tag** on the outside so both Pydantic and your IDE can route it in `O(1)` time, while **`match/case` with `assert_never`** locks the factory floor if any tag is missing a handler.
