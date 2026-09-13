# How do you handle optimistic updates

## Detailed explanation

How do you handle optimistic updates is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Make frontend and backend agree on auth, data contracts, errors, retries, and state.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define frontend-backend contract.
- Handle auth, cookies/tokens, CORS, and errors.
- Prevent duplicate or stale requests.
- Map backend validation to frontend UX.
- Keep contracts versioned and testable.

## 4. Visual / analogy

```txt
React UI -> API client -> backend endpoint -> response/error contract -> UI state
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply full-stack integration rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle optimistic updates affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is an optimistic update?
- **The Engine Mechanism (Why it behaves this way):** An optimistic update applies the expected result of a mutation to the UI immediately, before the server confirms it. Instead of waiting for the API response (pessimistic update), the frontend assumes the request will succeed and updates the UI instantly. If the request fails, the UI is rolled back to the previous state. This makes the app feel instant since there's no loading state for the mutation.
- **The Unforgettable Mental Model:** The **Restaurant Pre-Order**. When you order at a fast-food counter, they hand you the food immediately (optimistic update) before the payment processes. If the payment fails, they ask for the food back (rollback). You get instant gratification.
- **The Trap:** Using optimistic updates for critical operations. Creating an order, processing a payment, or deleting important data should use pessimistic updates — wait for server confirmation before showing success. Optimistic updates are best for non-critical UI changes like likes, toggles, and reordering.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An optimistic update applies the expected result to the UI immediately, before the server confirms. This eliminates the loading state and makes the app feel instant. If the server request fails, I roll back to the previous state and show an error. I use optimistic updates for low-risk operations (likes, toggles, sorting) and pessimistic updates for critical operations (payments, order creation, deletions) where correctness matters more than speed."

#### How do you implement optimistic updates with TanStack Query?
- **The Engine Mechanism (Why it behaves this way):** TanStack Query's `useMutation` supports optimistic updates through `onMutate`, `onError`, and `onSettled` callbacks. In `onMutate`, you cancel outgoing refetches, snapshot the current cached data, and update the cache with the optimistic value. In `onError`, you roll back to the snapshot. In `onSettled`, you invalidate the query to refetch the authoritative server data. This pattern ensures the UI is instant but eventually consistent.
- **The Unforgettable Mental Model:** The **Save Game System**. Before making a risky move (mutation), you save your game (snapshot cache). If the move works, great — you continue. If it fails, you reload the save (rollback). Either way, you eventually sync with the official leaderboard (invalidate and refetch).
- **The Trap:** Not canceling outgoing refetches in `onMutate`. If a refetch is in progress when you apply the optimistic update, the refetch's response will overwrite your optimistic value, causing a flash of old data.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: With TanStack Query, I use the `onMutate` callback to cancel outgoing refetches, snapshot the current cache, and apply the optimistic update. In `onError`, I roll back to the snapshot. In `onSettled`, I invalidate the query to refetch server data. The pattern is: `onMutate` = apply optimistic + snapshot, `onError` = rollback, `onSettled` = invalidate. This gives instant UI with eventual consistency and automatic rollback on failure."

#### How do you handle rollback when an optimistic update fails?
- **The Engine Mechanism (Why it behaves this way):** Rollback requires saving the pre-mutation state (snapshot) before applying the optimistic update. When the mutation fails, the snapshot is restored to the cache or state. The UI reverts to the pre-mutation appearance, and an error message is shown. The snapshot must include enough context to fully restore the previous state — not just the changed field, but the entire affected data structure.
- **The Unforgettable Mental Model:** The **Undo Button**. You make a change (optimistic update), realize it was wrong (server error), and hit undo (rollback). The document returns to exactly how it was before the change.
- **The Trap:** Partial rollback — only reverting the changed field without restoring related state. If the mutation affects multiple fields or related data, all of them must be rolled back to maintain consistency.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle rollback by snapshotting the entire affected cache entry before applying the optimistic update. When the mutation fails, I restore the full snapshot — not just the changed field, but the entire data structure. This ensures complete consistency. I also show an error toast explaining what failed and why, so the user understands the revert. For complex mutations affecting multiple queries, I snapshot and rollback all affected cache entries."

#### When should you NOT use optimistic updates?
- **The Engine Mechanism (Why it behaves this way):** Optimistic updates are inappropriate for operations where the server might reject the request with high probability, where the result significantly impacts the user or business, or where the server response contains data the frontend can't predict. Examples: payment processing (server validates card, checks fraud), order creation (server checks inventory, calculates pricing), user registration (server checks email uniqueness), and file uploads (server validates content).
- **The Unforgettable Mental Model:** The **Casino Bet**. You can optimistically update a like button (low stakes, predictable outcome). But you can't optimistically update a bank balance after a bet (high stakes, unpredictable outcome — the house might reject it).
- **The Trap:** Using optimistic updates for form submissions with server-side validation. If the server rejects the submission (validation error, duplicate entry), the rollback creates a jarring UX where data appears then disappears.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I avoid optimistic updates for: payment processing (server validates card and fraud), order creation (inventory and pricing checks), user registration (uniqueness validation), and any operation where the server response contains unpredictable data. I also avoid them for form submissions with complex server-side validation, since rollbacks create jarring UX. Optimistic updates are best for low-risk, predictable operations: likes, toggles, reordering, and status changes where the server is unlikely to reject."

#### How do you handle optimistic updates with concurrent mutations?
- **The Engine Mechanism (Why it behaves this way):** When multiple mutations target the same data concurrently (e.g., rapidly toggling a switch), each mutation's optimistic update builds on the previous one. The challenge is that rollbacks must be applied in reverse order — the last mutation's rollback shouldn't undo an earlier successful mutation. TanStack Query handles this by queuing mutations and processing them sequentially. Custom implementations need a mutation queue or version tracking.
- **The Unforgettable Mental Model:** The **Stack of Transparent Sheets**. Each optimistic update is a transparent sheet placed on top. When one fails, you remove only its sheet (rollback), not the sheets below it. The order matters — you remove from the top down.
- **The Trap:** Not handling concurrent mutations sequentially. If two mutations fire simultaneously, their optimistic updates and rollbacks can interfere, leaving the UI in an inconsistent state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For concurrent mutations, I ensure they're processed sequentially — each mutation waits for the previous one to settle before applying its optimistic update. TanStack Query handles this automatically with its mutation queue. For custom implementations, I use a mutation queue or version tracking to ensure rollbacks are applied in reverse order. The key principle: never apply a new optimistic update while a previous mutation is still pending on the same data."

#### How do you test optimistic updates?
- **The Engine Mechanism (Why it behaves this way):** Testing optimistic updates involves three scenarios: (1) successful mutation — verify optimistic update appears immediately, then server data replaces it after refetch, (2) failed mutation — verify optimistic update appears, then rolls back to previous state with error message, (3) concurrent mutations — verify sequential processing and correct rollback ordering. Tests mock the API response to simulate success and failure, and assert on UI state at each step.
- **The Unforgettable Mental Model:** The **Stunt Double Rehearsal**. You rehearse the stunt three ways: the perfect take (success), the failed take with safety net (rollback), and the rapid-fire sequence (concurrent). Each rehearsal verifies the safety systems work.
- **The Trap:** Only testing the success path. The rollback path is where most bugs live — incorrect snapshot restoration, partial rollbacks, and race conditions only surface when testing failures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test optimistic updates in three scenarios: success (optimistic update appears, then server data replaces it), failure (optimistic update appears, then rolls back with error), and concurrent mutations (sequential processing, correct rollback order). I mock API responses to simulate success and failure, and use React Testing Library to assert on UI state at each step. I specifically test that the rollback restores the exact previous state, not just a partial revert."

#### What would you monitor for optimistic updates in production?
- **The Engine Mechanism (Why it behaves this way):** Optimistic update monitoring tracks mutation failure rates, rollback frequency, the time between optimistic update and server confirmation, and user re-tries after rollback. These metrics reveal whether optimistic updates are appropriate (high rollback rate means the server rejects often) and whether the UX is smooth (long confirmation time means users see stale optimistic data).
- **The Unforgettable Mental Model:** The **Weather Forecast Accuracy**. The forecast (optimistic update) predicts sunshine. How often is it wrong (rollback rate)? How long until the actual weather arrives (confirmation time)? If the forecast is wrong too often, people stop trusting it.
- **The Trap:** Not monitoring rollback frequency. A high rollback rate means optimistic updates are being used for operations the server frequently rejects, creating a poor UX where changes appear then disappear.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor mutation failure rates (which trigger rollbacks), rollback frequency per operation type, the time between optimistic update and server confirmation, and user retry rates after rollback. A high rollback rate for a specific operation means I should switch from optimistic to pessimistic updates for that operation. I also monitor the confirmation latency — if it's too long, users see stale optimistic data for an extended period, which is confusing."

## 8. Active recall test

1. **What is an optimistic update?**
   - **Explanation:** Applying the expected result of a mutation to the UI immediately, before the server confirms. If the server request fails, the UI is rolled back to the previous state. This eliminates loading states and makes the app feel instant.

2. **What are the three TanStack Query callbacks for optimistic updates?**
   - **Explanation:** `onMutate`: cancel outgoing refetches, snapshot current cache, apply optimistic update. `onError`: rollback to snapshot. `onSettled`: invalidate query to refetch server data. This pattern gives instant UI with eventual consistency.

3. **Why must you cancel outgoing refetches in onMutate?**
   - **Explanation:** If a refetch is in progress when you apply the optimistic update, the refetch's response will overwrite your optimistic value, causing a flash of old data. Canceling ensures the optimistic update remains visible until the mutation settles.

4. **When should you NOT use optimistic updates?**
   - **Explanation:** For critical operations (payments, order creation, deletions), operations with high server rejection probability (form validation, registration), and operations where the server response contains unpredictable data. Use pessimistic updates for these cases.

5. **How do you handle concurrent mutations with optimistic updates?**
   - **Explanation:** Process mutations sequentially — each waits for the previous one to settle before applying its optimistic update. TanStack Query handles this with its mutation queue. Rollbacks must be applied in reverse order to avoid undoing successful mutations.

6. **What is the most important test case for optimistic updates?**
   - **Explanation:** The failure/rollback path. Test that the optimistic update appears immediately, then rolls back to the exact previous state (not partial) when the mutation fails, with an appropriate error message. This is where most bugs live.

7. **What metric indicates optimistic updates are being misused?**
   - **Explanation:** Rollback frequency per operation type. A high rollback rate means the server frequently rejects the mutation, making optimistic updates inappropriate for that operation. Users see changes appear then disappear, creating a jarring experience.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle optimistic updates in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle optimistic updates in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
