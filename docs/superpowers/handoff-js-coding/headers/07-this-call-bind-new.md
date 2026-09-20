# this, call, apply, bind & new

Everything about `this` is decided at the call site, and these problems make you implement that call-site machinery from scratch. The honest caveat runs through the whole page: `call`/`apply` cannot be perfectly polyfilled in JavaScript, so the interview is about naming the contract and reaching for `Reflect.apply` rather than faking it.
