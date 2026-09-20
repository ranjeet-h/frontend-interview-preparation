# Event Emitter & Pub-Sub

An event emitter is the smallest useful observer system: a map from event name to a list of listeners. It is a favourite because one class exercises `Map`/`Set`, closures, `once` wrappers, safe iteration while mutating, and error isolation. The follow-ups (namespaces, wildcards) test API design.
