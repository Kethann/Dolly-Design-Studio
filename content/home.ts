// ─────────────────────────────────────────────────────────────────────────────
// HOME PAGE TEXT — every section, in the order it appears on the page.
// (Projects, services and clients have their own files: projects.ts,
// services.ts, clients.ts. Contact details live in site.ts.)
// ─────────────────────────────────────────────────────────────────────────────

export const home = {
  // 1. Top of the page, under the logo.
  hero: {
    disciplines: ["Posters", "Title Design", "Typography", "Logos"],
    /** Read out by screen readers and search engines as the page's main heading, after the studio name. */
    screenReaderHeading: "film posters, title design, typography and logos",
  },

  // 2. The big statement that lights up word by word.
  manifesto: {
    label: "Manifesto",
    /** Words wrapped in *asterisks* are set in gold italic. */
    statement: "Let us be the cover page of your beautiful book called *‘Cinema’.*",
    body: "We design the first thing an audience ever sees of a film — the poster, the title, the type — and make sure it is impossible to look away.",
  },

  // 3. Featured posters (pick which ones with `featured: true` in projects.ts).
  gallery: {
    label: "The Gallery of Light",
    title: "Selected work",
    viewAllLink: "View full gallery →",
  },

  // 4. "How a poster is built" — uses the first four images of the showcase project.
  process: {
    label: "From Spark to Sheet",
    title: "How a poster is built",
    /** Which project (its `slug` in projects.ts) illustrates the stages. */
    showcaseSlug: "dacoit",
    /** Shown as: "<introBefore> <project title> <introAfter>" */
    introBefore: "Using",
    introAfter: "as a showcase — every campaign moves through the same stages, from first brief to the art that fills a billboard.",
    stages: [
      { title: "Brief", body: "Betrayal, vengeance, romance — the studio sets the tone and the key emotion to chase." },
      { title: "Character studies", body: "Each lead is explored in isolation: expression, light, grain, and mood." },
      { title: "Composite", body: "The ensemble comes together — staging, colour grade and type start to lock." },
      { title: "Final release art", body: "Title, credits and release details are set for the finished campaign." },
    ],
  },

  // 5. The numbered services list (the services themselves are in services.ts).
  services: {
    label: "The Programme",
    title: "Services",
  },

  // 6. Scrolling client names and the count-up numbers (names are in clients.ts).
  clients: {
    label: "Clients & Collaborations",
    /** Read out by screen readers before the list of names. */
    screenReaderIntro: "Clients and collaborators:",
    stats: [
      { value: 4, suffix: "+", label: "Years of experience" },
      { value: 10, suffix: "+", label: "Feature films" },
      { value: 10, suffix: "+", label: "Happy clients" },
    ],
  },

  // 7. Contact section and enquiry form.
  contact: {
    label: "Curtain Call",
    headline: "Let’s create something cinematic.",
    availability: "Available for feature films, OTT originals & campaign launches",
    whatsappLabel: "WhatsApp",
    form: {
      nameLabel: "Name",
      emailLabel: "Email",
      companyLabel: "Company / Production",
      projectTypeLabel: "Project type",
      budgetLabel: "Budget range",
      timelineLabel: "Timeline",
      messageLabel: "Message",
      selectPlaceholder: "Select one",
      submitButton: "Send message",
      sendingButton: "Sending…",
      successMessage: "Thank you — we’ll be in touch.",
      projectTypes: [
        "Theatrical poster campaign",
        "First-look / motion poster",
        "Title logo design",
        "Typography",
        "Campaign & social kit",
        "Re-release artwork",
        "Something else",
      ],
      budgets: ["Under ₹1L", "₹1L – ₹3L", "₹3L – ₹6L", "₹6L+", "Not sure yet"],
      timelines: ["Under 2 weeks", "2 – 4 weeks", "1 – 3 months", "Flexible"],
      errors: {
        generic: "Something went wrong.",
        missingFields: "Please fill in your name, a valid email, project type and message.",
        tooManyRequests: "Too many requests. Please try again later.",
        sendFailed: "Could not send your message right now. Please email us directly.",
        badRequest: "Invalid request body.",
      },
    },
  },
} as const;
