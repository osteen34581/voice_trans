# Security Specification & Firestore Rules Test Plan

## 1. Core Data Invariants
1. **Strict Ownership Isolation**: Every student-owned collection (`studentUnits`, `lectures`, `transcripts`, `generatedNotes`, `documents`, `documentVersions`, `resourceBookmarks`, `aiMaterials`, `documentChunks`, `aiConversations`, `aiMessages`, `flashcards`, `quizzes`, `quizAttempts`, `notifications`, `studyReminders`) requires `userId == request.auth.uid` on both read/list and write.
2. **PII Isolation**: Student email addresses and private preferences live in `users/{userId}/private/{docId}` and `users/{userId}` restricts `get` and `list` strictly to `isOwner(userId)` or `isAdmin()`. No blanket `isSignedIn()` read exists on user profiles.
3. **Immutable Ownership & Timestamps**: `userId` and `createdAt` are immutable after document creation (`incoming().userId == existing().userId && incoming().createdAt == existing().createdAt`). Creation timestamps must equal `request.time` and updates must set `updatedAt == request.time`.
4. **Role-Based Access Control (No Self-Escalation)**: Students cannot create or update `/admins/{adminId}`, `/universities`, `/courses`, `/auditLogs`, or `/systemSettings`, nor set `suspended` on their own profile.
5. **Moderation Gate for Revision Library**: Students creating a resource in `/resources/{resourceId}` MUST set `status == 'pending'` and `submittedBy == request.auth.uid`; only `isAdmin()` can set `status == 'approved'` or `'rejected'`.
6. **Verified Identity**: All mutations require `request.auth != null && request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Identity Spoofing on Lecture Create**: Student A attempts to create `/lectures/lec1` with `userId: "studentB"`. -> **DENIED**.
2. **Shadow Field Injection on Profile Update**: Student A updates `/users/studentA` including an undocumented `isAdmin: true` or `role: "admin"` field. -> **DENIED** by `hasOnly` and `affectedKeys().hasOnly()`.
3. **Unverified Email Bypass**: User with `email_verified: false` (even matching admin email) attempts to write `/systemSettings/global`. -> **DENIED** by `email_verified == true`.
4. **PII Blanket Read**: Student A attempts `list` on `/users` or `get` on `/users/studentB/private/settings`. -> **DENIED**.
5. **ID Poisoning**: Attacker attempts to create `/lectures/../../invalid$id` or a 1.5KB ID string. -> **DENIED** by `isValidId()`.
6. **Privilege Escalation on Suspended Flag**: Suspended student attempts to set `suspended: false` on `/users/studentA`. -> **DENIED** by `affectedKeys().hasOnly()`.
7. **Auto-Approving Library Submission**: Student creates `/resources/res1` with `status: "approved"`. -> **DENIED** (non-admins can only create `status: "pending"`).
8. **Ownership Hijack on Document Update**: Student A updates `/documents/doc1` changing `userId` to `"studentB"`. -> **DENIED** by immutable `userId` rule.
9. **Timestamp Backdating**: Student creates `/lectures/lec2` with `createdAt` set to a past timestamp instead of `request.time`. -> **DENIED**.
10. **Query Trust Bypass**: Student A runs an unfiltered `list` query on `/lectures` without `where('userId', '==', uid)`. -> **DENIED** by rule evaluating `resource.data.userId == request.auth.uid`.
11. **Transcript Overwrite Tampering**: Client tries to overwrite `rawText` on a `Transcript` update or exceed string size bounds. -> **DENIED** by `affectedKeys().hasOnly(['editedText', 'updatedAt'])`.
12. **Audit Log Forgery**: Non-admin attempts to read or delete `/auditLogs/log1`. -> **DENIED** by `isAdmin()`.
