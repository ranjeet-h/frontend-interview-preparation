# Guess the Output: `this`

`this` is decided at the call site, never at the definition site. Method call, plain call, nested function, arrow, extraction, and `bind` each answer "who is the receiver?" differently, and one bound-constructor question tests the special `new`-ignores-the-bound-receiver rule.
