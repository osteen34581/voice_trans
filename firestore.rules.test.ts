import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');

describe('Firestore Security Rules & Blueprint Invariants', () => {
  const rules = fs.readFileSync(rulesPath, 'utf-8');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));

  it('enforces default-deny global fallback at the root', () => {
    expect(rules).toMatch(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  });

  it('isolates PII under /users/{userId}/private and restricts user listing to admins', () => {
    expect(rules).toMatch(/match \/users\/\{userId\}[\s\S]*allow list: if isAdmin\(\);/);
    expect(rules).toMatch(/match \/private\/\{docId\}/);
  });

  it('enforces email verification for student data writes', () => {
    expect(rules).toMatch(/function isVerified\(\)\s*\{\s*return isSignedIn\(\) && request\.auth\.token\.email_verified == true;/);
  });

  it('enforces moderation gate on Revision Library submissions (pending status for non-admins)', () => {
    expect(rules).toMatch(/\(isAdmin\(\) \|\| incoming\(\)\.status == 'pending'\)/);
  });

  it('protects immutable transcript rawText on update', () => {
    expect(rules).toMatch(/incoming\(\)\.rawText == existing\(\)\.rawText/);
  });

  it('defines rules for every top-level collection declared in firebase-blueprint.json', () => {
    const collections = Object.keys(blueprint.firestore || {}).map((p) => p.split('/')[1]);
    for (const col of collections) {
      expect(rules).toContain(`match /${col}/`);
    }
  });
});
