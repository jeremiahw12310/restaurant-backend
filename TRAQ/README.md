# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Firestore security rules

This repo includes Firestore rules in `firestore.rules` and a minimal `firebase.json` that points to them.

- **Task completions (`days/{dateKey}/windows/{windowKey}/tasks/{taskId}`)**:
  - Anyone can **read**.
  - Anyone can **create** a completion **only if it doesn’t already exist** (enforces **block second claim**).
  - **Update/delete requires Firebase Auth + custom claim** `admin: true` (optional; see `isAdmin()` in rules).

- **Legacy task blob (`taskState/current`)**:
  - Read-only (migration reads it once to move data).

To deploy rules (from a machine with Firebase CLI configured for your project):

```bash
firebase deploy --only firestore:rules
```

## Time Off request emails (manager notification)

When a new Firestore document is created in `timeOffRequests/{requestId}`, a Firebase Cloud Function will send an email to **`jeremiahw12310@gmail.com`**.

- **Function code**: `functions/src/index.ts` (`emailManagerOnTimeOffRequestCreated`)
- **Trigger**: Firestore onCreate of `timeOffRequests/{requestId}`
- **Email provider**: Gmail SMTP (requires a Gmail **App Password**)
 - **Implementation note**: this is deployed as a **1st-gen Firestore trigger** to avoid Eventarc trigger issues with Firestore multi-region (`nam5`).

### Setup (one-time)

1. **Enable Blaze** for the Firebase project (needed for Cloud Functions).
2. In your Google account for the sender Gmail, enable **2FA** and create an **App Password**.
3. Set secrets (these are stored in Google Secret Manager):

```bash
firebase functions:secrets:set GMAIL_USER
firebase functions:secrets:set GMAIL_APP_PASSWORD
```

When prompted, set:
- `GMAIL_USER` = the sender Gmail address (**`bonfirehermitagetn@gmail.com`**)
- `GMAIL_APP_PASSWORD` = the generated app password (not your normal password)

### Deploy

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

Notes:
- Firebase Functions deploy requires **Node.js 20** runtime (set in `functions/package.json`).
