# Shared UI & Design Guidelines

This document serves as the single source of truth for the visual design of all 3 applications (`admin-saas`, `main-local`, `billing-client`). 

Based on the core design requirements, the applications must share a uniform, minimalist, high-contrast aesthetic.

---

## 1. The Core Aesthetic
*   **Style**: Clean, Minimalist, High-Contrast (Black & White).
*   **Inspiration**: The reference login screen features a pure white background, crisp borders, and solid black primary buttons.
*   **Shadcn Theme**: We are using the default **"Zinc"** or **"Neutral"** Shadcn base theme with a slight adjustment for higher contrast on inputs and buttons.
*   **Typography**: Inter or Geist (sans-serif, highly legible).

---

## 2. Shadcn UI Configuration (`globals.css` / `index.css`)

To achieve the exact look across all 3 apps, every agent MUST apply the following CSS variables to their root styling file.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;

    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;

    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;

    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;

    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;

    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;

    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;

    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;

    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;

    --radius: 0.5rem;
  }

  /* Optional Dark Mode if needed later, but primary focus is the crisp light theme */
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    /* ... (Standard Shadcn dark variables) */
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

---

## 3. Specific Component Guidelines

To match the reference screenshot exactly, adhere to these explicit component rules:

### Cards & Layouts
*   Use the generic Shadcn `Card` component for central focal points (like Login or dialogs).
*   Ensure shadows are subtle. Do not use heavy drop shadows. (`shadow-sm` is preferred over `shadow-lg`).

### Inputs & Forms
*   Inputs must have a very subtle border (`border-zinc-200` equivalent).
*   **Focus State (Crucial)**: When an input is focused, it MUST have a high-contrast ring or a thicker black border. Standard Shadcn achieves this out of the box with `focus-visible:ring-ring` (which is mapped to solid black/zinc-900 above).
*   Labels should be small, bold or semi-bold (`text-sm font-medium`).
*   Hint text should be muted (`text-sm text-muted-foreground`).

### Buttons
*   Primary buttons must be solid black (`bg-primary text-primary-foreground`).
*   No gradients. No rounded-full pills unless explicitly requested. Use standard `rounded-md` (`--radius: 0.5rem`).

---

## 4. Electron Layouts (App B & App C)
*   The main application window should render a clean title bar (using Electron's frameless window or hidden title bar style), matching the Mac-style window controls seen in the reference screenshot natively where possible.
