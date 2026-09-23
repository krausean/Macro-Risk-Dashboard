# Macro Risk Dashboard — flat GitHub upload version

This package is intentionally FLAT: there are no folders to upload.

## Upload
1. Create an empty public GitHub repository.
2. Extract this ZIP on your computer.
3. In GitHub choose Add file → Upload files.
4. Select ALL the files in the extracted folder and upload them.
5. Commit the upload.

You should see `index.html`, `update_data.py`, `dashboard.json`, etc. directly on the repository home page.

## One manual step: create the workflow
GitHub Actions requires a special path named `.github/workflows/dashboard.yml`.
Rather than relying on your browser to upload that hidden folder:

1. Click the repository's **Actions** tab.
2. Click **set up a workflow yourself**.
3. Change the filename to `dashboard.yml`.
   GitHub will automatically place it under `.github/workflows/`.
4. Delete the sample text.
5. Open `WORKFLOW-TO-PASTE.txt` from your repository, copy all of it, and paste it into the workflow editor.
6. Click **Commit changes**.

Then:
- Settings → Pages
- Source → GitHub Actions
- Actions → Refresh and deploy dashboard

No local install, API key, or secret is required.

## Sources
The dashboard uses only the official-source set chosen for the conservative version:
U.S. Treasury, U.S. BLS, Federal Reserve Board, and Bank of Canada.

See `legal.html` for source-use notes.
