# WRITE.

A daily journal. Rate the day from one to ten stars, write down what happened and what's bugging you, and watch how your days go over time. One entry per day, editable any time. One page, your words in your own Supabase database.

## What's on the page

- **Today's entry** at the top: ten stars and a text box. Save with the button or Cmd/Ctrl+Enter. Use the arrows to go back and write up a day you missed. The page warns you before you leave unsaved writing.
- **This week's average**, your streak of consecutive days, total entries, your best day, and total words written.
- **How your days went**: a line of your ratings over 30 days, 90 days or a year. Days you skipped leave a gap rather than a slope. Hover a point for the first line of that entry; click it to open the day.
- **Spread**: how often each rating from one to ten comes up.
- **Entries**: every past entry, newest first, with search.

## Set up (about 10 minutes)

1. **Supabase.** Create a project at supabase.com (or reuse one you already have). In **SQL Editor**, paste the contents of [setup.sql](setup.sql) and click **Run**. Do this once.
2. **A login.** In **Authentication → Users**, click **Add user**, enter your email and a password, and tick **Auto confirm**. Skip if you already have a user on this project.
3. **Vercel.** Import this repository at vercel.com → Add New → Project. Framework preset **Other**, no build command, root directory blank.
4. **Two environment variables** on that Vercel screen, both from your Supabase project's **Connect** dialog:
   - `SUPABASE_URL` → your project URL
   - `SUPABASE_PUBLISHABLE_KEY` → the key starting `sb_publishable_`
5. **Deploy.** Open the URL Vercel gives you, click **Sign in**, rate today, and write.

Vercel redeploys on every push to `main`.

## Run locally

```
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node dev.js
```

Then open http://localhost:8801.

## What's in it

- `index.html` — the page and its styles
- `write.js` — sign-in, loading, the editor, charts, and the entries list
- `quote-of-day.js` — a quote that changes at local midnight
- `api/config.js` — hands the two public Supabase settings to the page
- `setup.sql` — the `journal_entries` table, one row per day, locked to each user by row-level security

## Add to your iPhone home screen

Open the site in Safari, tap Share, then **Add to Home Screen**.
