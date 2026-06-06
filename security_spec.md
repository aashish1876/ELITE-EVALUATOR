# Security Specification & "Dirty Dozen" Payload Tests

This document defines the zero-trust data invariants and security policy for the **Developer Evaluation Panel** Firestore database.

## 1. Core Data Invariants

1. **User Profiling Isolation**: A user's profile (`users/{userId}`) can only be read, created, or updated by the matching authenticated Google User. Users are forbidden from editing or spoofing other profiles.
2. **Evaluation Ownership Ownership**: Users can only access, create, or read their own evaluation history (`users/{userId}/evaluations/{evalId}`). No user can ever query or fetch another user's evaluation report.
3. **Immutability of Key Meta fields**: Key metadata fields like `createdAt`, `userId`, `id` in `evaluations` and `searches` are permanently locked at creation and cannot be changed during updates.
4. **Search Log Protection**: Search logs (`users/{userId}/searches/{searchId}`) are write-only upon create (no updates allowed) and can only be queried/read by the owner.

---

## 2. The "Dirty Dozen" Attack Vectors (Malicious Payloads)

Here are the 12 specific attack payloads that must be blocked securely by our Firestore rules.

### Case 1: Profiling & Identity Spoofing (Attacking User Profiles)
1. **The Profiler Overwrite**: An authenticated user `user_A` attempts to write directly to `users/user_B` to take control of their panel settings or credentials.
2. **Shadow Admin Escalation**: An authenticated user attempts to write a field `isAdmin: true` into `users/user_A` to escalate database permissions.
3. **Verification Bypass**: A logged-in user with an unverified email (`email_verified == false`) attempts to register a profile when email verification is strictly required.

### Case 2: Path Variable ID Poisoning & Injection
4. **ID Buffer Overflow**: A malicious user tries to write a document using an excessively long string identifier as the ID `users/user_A/evaluations/extremely_long_junk_ID_poisoning_payload_12345678...` to cause denial of wallet.
5. **Path Spec Injection**: A user tries to create a document with illegal directory/path traversal characters in the ID (e.g., `users/user_A/searches/..%2F..%2Fsys`).

### Case 3: History & Search Spoofing
6. **Cross-User Snoop**: An authenticated user `user_A` tries to perform a list query on `users/user_B/evaluations` to scrape their developer rating scores.
7. **Malicious Score Injector**: A user attempts to update their own evaluation scores `users/user_A/evaluations/eval_123` with hardcoded clean `10/10` values, bypassing AI evaluator logic.
8. **Evaluation Alteration**: A user updates the `userId` of an existing evaluation from `user_A` to `user_B` to orphan the record.
9. **Backdated Search Entry**: A user attempts to create a search query log with a hardcoded historic `createdAt` timestamp (e.g., in 2020) instead of the mandatory server-generated timestamp.

### Case 4: Resource Attacks & Type Poisoning
10. **JSON Binary Poison**: A user tries to store a nested list containing raw binary or extremely large strings inside the `query` field of `users/user_A/searches/search_123` to inflate storage billing.
11. **Type Distortion**: A user attempts to write a string value to a field defined as a primitive number inside scores (e.g., `{ "Code Quality": "Excellent" }` instead of `{ "Code Quality": 9.2 }`).
12. **Malicious Zero-Size Arrays**: An attacker uploads empty and useless indices to consume indexing blocks.

---

## 3. Test Verification Rules

Our Cloud Firestore Security Rules are mathematically framed and structured to reject all of these "Dirty Dozen" payloads deterministically.
All verified write operations require `request.auth.token.email_verified == true`.
All update actions require precise key mapping using `.diff().affectedKeys().hasOnly()`.
