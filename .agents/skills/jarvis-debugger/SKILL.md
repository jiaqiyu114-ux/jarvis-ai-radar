# jarvis-debugger

Debug code errors, dependency issues, build failures, TypeScript errors, and Next.js problems in J.A.R.V.I.S.

## Trigger

Use when:
- `pnpm dev` or `pnpm build` fails
- TypeScript compilation errors
- shadcn/ui component import errors
- Tailwind CSS not applying styles
- Next.js routing errors
- Dependency version conflicts
- Runtime errors in browser console

## Debugging Protocol

### Step 1: Read the error message completely
- Do NOT start fixing before reading the full error
- Note: file path, line number, error type, error message
- Note: is this a compile error, runtime error, or type error?

### Step 2: Locate the root cause
- Trace the error to the originating file/line
- Check if it's a missing import, wrong type, or missing dependency
- Check if it's a configuration issue (next.config.ts, tsconfig.json)

### Step 3: State the fix plan before touching files
- Which files will be changed?
- What specifically will be changed?
- Why will this fix the problem?

### Step 4: Fix, then verify
- Apply the minimal fix
- State the test command
- Do NOT blindly add more changes if the first fix works

## Common J.A.R.V.I.S. Issues

### Tailwind v4 + shadcn/ui
- shadcn v4 uses CSS variables in `globals.css`, not `tailwind.config.js`
- The `@theme` block in globals.css defines design tokens
- If shadcn components look unstyled: check CSS variable definitions in globals.css
- Do NOT create `tailwind.config.js` for a v4 project

### TypeScript 6 compatibility
- Some packages may have peer dep warnings with TS6
- This is usually non-fatal; only escalate if types are broken
- Check tsconfig.json `target` and `lib` settings if TS errors appear in standard code

### Next.js 16 App Router
- Server components cannot use browser APIs (window, localStorage)
- Mark client-only components with `"use client"` at top of file
- Data fetching in server components uses `async/await` directly
- Route groups use `(groupname)` folder syntax, not reflected in URL

### shadcn/ui import paths
- Components are in `src/components/ui/`
- Import: `import { Button } from "@/components/ui/button"`
- If component missing: run `pnpm dlx shadcn@latest add <component-name>`

### pnpm dependency issues
- Lock file conflict: `pnpm install --frozen-lockfile=false`
- Peer dep errors: read carefully, most are warnings not errors
- Do NOT run `rm -rf node_modules && pnpm install` as first step
- Only reinstall if you've confirmed a corruption or lock file issue

## Checklist Before Reinstalling Dependencies

- [ ] Is the error a missing module? → `pnpm add <package>`
- [ ] Is the error a type error? → Fix the TypeScript, not the deps
- [ ] Is the error a config error? → Fix the config file
- [ ] Is the error a version conflict? → Read the exact conflict first
- [ ] Only then consider `pnpm install` or cleaning node_modules

## Files Commonly Involved in J.A.R.V.I.S. Errors

| File | Common Issues |
|------|--------------|
| `src/app/globals.css` | Tailwind imports, CSS variables missing |
| `src/app/layout.tsx` | Missing `"use client"`, wrong font setup |
| `next.config.ts` | Incorrect config options for Next.js 16 |
| `tsconfig.json` | Path aliases not set up (`@/` mapping) |
| `components.json` | shadcn config, wrong paths |
| Any `page.tsx` | Server/client component boundary violations |

## Test Commands

After any fix, run in this order:
1. `pnpm build` — catches type errors and build failures
2. `pnpm dev` — confirms runtime works
3. Open browser at localhost:3000 — confirms UI renders
