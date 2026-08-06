# How do you display upload progress

## Detailed explanation

How do you display upload progress is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you display upload progress affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you track upload progress in React?
- **The Engine Mechanism (Why it behaves this way):** Upload progress is tracked using the `XMLHttpRequest.upload` API or Axios's `onUploadProgress` callback, both of which fire `ProgressEvent` objects with `loaded` (bytes sent) and `total` (total bytes) properties. The percentage is `(loaded / total) * 100`. React state stores the progress value and re-renders a progress bar component. fetch does NOT support upload progress — only download progress via ReadableStream.
- **The Unforgettable Mental Model:** The **Fuel Gauge**. As you drive (upload), the gauge shows exactly how much fuel you've used (bytes sent) vs the tank capacity (total bytes). You always know how far you've come and how far is left.
- **The Trap:** Using fetch for upload progress. fetch only supports download progress through response body streaming. For upload progress, you must use Axios or raw XMLHttpRequest.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I track upload progress using Axios's `onUploadProgress` callback, which fires periodically with `loaded` and `total` bytes. I calculate the percentage and store it in React state to update a progress bar. If I'm using fetch, I switch to XMLHttpRequest for upload progress since fetch doesn't support it. I also handle the case where `total` is 0 (server doesn't send Content-Length) by showing an indeterminate spinner instead of a percentage."

#### How do you show progress for multiple simultaneous uploads?
- **The Engine Mechanism (Why it behaves this way):** Each upload maintains its own progress state in a map keyed by file ID or index. The UI renders a progress bar per file. An aggregate progress bar shows the overall batch progress: `(sum of all loaded bytes) / (sum of all total bytes) * 100`. React state stores an array or map of upload objects: `{ id, fileName, progress, status }`.
- **The Unforgettable Mental Model:** The **Multi-Lane Highway**. Each car (file) has its own speed and position (individual progress). The highway dashboard shows both each car's position and the average position of all cars (aggregate progress).
- **The Trap:** Showing only aggregate progress without per-file progress. If one file is 90% done and another is 10%, the aggregate might show 50%, but the user doesn't know which file is stuck.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I maintain a progress map in React state, keyed by file ID, with each entry tracking `{ fileName, progress, status }`. Each file gets its own progress bar. I also calculate aggregate progress as total loaded bytes divided by total bytes across all files. I limit concurrent uploads to 3-5 to avoid overwhelming the network, queuing the rest. When a file completes or fails, its status updates and the aggregate recalculates."

#### How do you handle upload progress when the total size is unknown?
- **The Engine Mechanism (Why it behaves this way):** When the server doesn't provide a Content-Length or the upload is streamed, the `total` property in ProgressEvent is 0 or null. In this case, you can't show a percentage. Instead, show an indeterminate progress indicator (animated spinner or pulsing bar) and optionally display the bytes sent so far. Some implementations estimate total time based on upload speed and show an ETA.
- **The Unforgettable Mental Model:** The **Foggy Road**. You're driving but can't see the destination (unknown total). You know you're moving (bytes sent increasing), but you don't know how far is left. The best you can do is show that you're still moving (indeterminate spinner).
- **The Trap:** Showing 0% or NaN% when total is unknown. This confuses users into thinking the upload isn't working. An indeterminate indicator is more honest and less confusing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: When the total size is unknown (ProgressEvent.total is 0), I switch from a percentage progress bar to an indeterminate spinner. I also display the bytes uploaded so far (e.g., '2.3 MB uploaded') so the user sees activity. For a better UX, I can estimate the upload speed from recent progress events and show an estimated time remaining, though I clearly label it as an estimate since network conditions change."

#### How do you implement a progress bar component for uploads?
- **The Engine Mechanism (Why it behaves this way):** A progress bar component receives a `progress` prop (0-100) and renders a visual indicator. The bar has a background track and a filled portion whose width is `progress%`. For accessibility, it includes `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, and `aria-valuemax="100"`. For indeterminate state, it uses CSS animation (sliding gradient or pulsing) instead of a fixed width.
- **The Unforgettable Mental Model:** The **Battery Indicator**. The empty battery outline is the track, the filled portion shows charge level (progress). When charging status is unknown, it shows a pulsing animation (indeterminate).
- **The Trap:** Not making the progress bar accessible. Screen readers need `role="progressbar"` and ARIA attributes to announce progress to visually impaired users. Without them, the progress is invisible to assistive technology.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I build a progress bar component that accepts a `progress` prop (0-100) and renders a track with a filled portion at `width: ${progress}%`. For accessibility, I use `role='progressbar'` with `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`. For indeterminate state, I use a CSS-animated sliding gradient. I also include a text label with the percentage for screen readers. The component is purely presentational — it receives progress from the parent and doesn't manage upload logic."

#### How do you handle upload cancellation with progress?
- **The Engine Mechanism (Why it behaves this way):** Upload cancellation uses `AbortController`. The controller's signal is passed to Axios or XMLHttpRequest. Calling `controller.abort()` cancels the upload mid-progress. The UI should show a "Cancel" button during upload, update progress to show "Cancelled" status on abort, and clean up the abort controller to prevent memory leaks.
- **The Unforgettable Mental Model:** The **Emergency Stop Button**. The train (upload) is moving along the track (progress). The emergency stop button (AbortController) halts it immediately at its current position. The station display (UI) updates to show "Stopped" instead of the destination.
- **The Trap:** Not cleaning up the AbortController after the upload completes or is cancelled. An abandoned controller reference can cause memory leaks, especially in React components that mount and unmount frequently.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement cancellation using AbortController. I create an AbortController when the upload starts, pass its signal to Axios, and store a reference to call `abort()` when the user clicks Cancel. On abort, I catch the AbortError, update the upload status to 'Cancelled', and clean up the controller reference. I also handle component unmount — if the component unmounts during upload, I abort the request to prevent state updates on unmounted components."

#### How do you test upload progress functionality?
- **The Engine Mechanism (Why it behaves this way):** Testing upload progress requires mocking the progress events. With Jest, you can mock Axios's `onUploadProgress` callback to fire with simulated `loaded` and `total` values. With React Testing Library, you assert that the progress bar updates correctly at each simulated progress step. You also test edge cases: total is 0 (indeterminate), upload completes (100%), upload fails (error state), and upload is cancelled.
- **The Unforgettable Mental Model:** The **Treadmill Test**. Instead of running outdoors (real upload), you run on a treadmill (mocked progress) where you control the speed (progress values) and can simulate any condition (completion, failure, cancellation).
- **The Trap:** Testing upload progress with real file uploads. This is slow, flaky, and depends on network conditions. Mock the progress callback for deterministic, fast tests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test upload progress by mocking Axios's `onUploadProgress` callback. I simulate progress events with controlled `loaded` and `total` values and assert that the progress bar renders the correct percentage. I test edge cases: total=0 (indeterminate spinner), 100% (success state), error (failure message), and cancellation (aborted state). I use React Testing Library to verify the UI updates at each step. Tests are fast and deterministic since they don't involve real network requests."

#### What would you monitor for upload progress in production?
- **The Engine Mechanism (Why it behaves this way):** Upload progress monitoring tracks upload completion rate, average upload speed, cancellation rate, and the frequency of indeterminate uploads (unknown total). These metrics reveal whether uploads are completing successfully, whether users are cancelling due to slow speeds, and whether the server is properly reporting Content-Length.
- **The Unforgettable Mental Model:** The **Delivery Speed Tracker**. It tracks how many packages reached their destination (completion rate), how fast they traveled (upload speed), how many were returned to sender (cancellation rate), and how many had unknown destinations (indeterminate uploads).
- **The Trap:** Not monitoring cancellation rate. A high cancellation rate indicates uploads are too slow or the UX is confusing — users give up before completion.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor upload completion rate, average upload speed by file size, cancellation rate, and the frequency of indeterminate progress (unknown total). A high cancellation rate signals slow uploads or poor UX. A high indeterminate rate means the server isn't reporting Content-Length correctly. I also track upload latency percentiles to identify slow uploads that might indicate network issues or server-side processing bottlenecks."

## 8. Active recall test

1. **How do you track upload progress in React?**
   - **Explanation:** Use Axios's `onUploadProgress` callback or XMLHttpRequest's `upload.addEventListener('progress', ...)`. Both fire ProgressEvent with `loaded` and `total` bytes. Calculate percentage as `(loaded / total) * 100` and store in React state. fetch does NOT support upload progress.

2. **How do you show progress for multiple simultaneous uploads?**
   - **Explanation:** Maintain a progress map in React state keyed by file ID, with each entry tracking `{ fileName, progress, status }`. Render individual progress bars per file. Calculate aggregate progress as total loaded bytes / total bytes across all files. Limit concurrent uploads to 3-5.

3. **What do you show when the upload total size is unknown?**
   - **Explanation:** Switch from a percentage progress bar to an indeterminate spinner (animated/pulsing). Display bytes uploaded so far (e.g., "2.3 MB uploaded") to show activity. Optionally estimate upload speed and show an ETA, clearly labeled as an estimate.

4. **How do you make a progress bar accessible?**
   - **Explanation:** Use `role="progressbar"` with `aria-valuenow` (current progress), `aria-valuemin="0"`, and `aria-valuemax="100"`. Include a text label with the percentage for screen readers. For indeterminate state, use `aria-valuetext="Loading"` or similar.

5. **How do you implement upload cancellation?**
   - **Explanation:** Use AbortController. Create it when upload starts, pass its signal to Axios, and call `controller.abort()` on cancel. Catch the AbortError, update status to 'Cancelled', and clean up the controller reference. Also abort on component unmount.

6. **How do you test upload progress without real network requests?**
   - **Explanation:** Mock Axios's `onUploadProgress` callback with Jest. Simulate progress events with controlled `loaded` and `total` values. Assert that the progress bar renders correct percentages. Test edge cases: total=0, 100%, error, and cancellation.

7. **What metric indicates upload UX problems?**
   - **Explanation:** Cancellation rate. A high rate means users are giving up on uploads before completion — either because uploads are too slow, the progress feedback is unclear, or the UX is confusing. This directly signals a need for optimization or UX improvement.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you display upload progress in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you display upload progress in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
