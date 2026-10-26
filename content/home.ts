// ─────────────────────────────────────────────────────────────────────────────
// HOME PAGE TEXT — every section, in the order it appears on the page.
// (Projects, services and clients have their own files: projects.ts,
// services.ts, clients.ts. Contact details live in site.ts.)
// ─────────────────────────────────────────────────────────────────────────────

export const home = {
  // 1. INTRO — top of the page, under the logo.
  hero: {
    disciplines: ["Posters", "Title Design", "Typography", "Logos"],
    /** Read out by screen readers and search engines as the page's main heading, after the studio name. */
    screenReaderHeading: "film posters, title design, typography and logos",
  },

  // 2. BASIC INFO ABOUT THE AGENCY — the statement that lights up word by word…
  manifesto: {
    label: "The Agency",
    /** Words wrapped in *asterisks* are set in gold italic. */
    statement: "Let us be the cover page of your beautiful book called *‘Cinema’.*",
    body: "We design the first thing an audience ever sees of a film — the poster, the title, the type — and make sure it is impossible to look away.",
  },
  // …followed by what the agency does (the services themselves are in services.ts).
  services: {
    label: "What We Do",
    title: "Services",
  },

  // 3. OUR PROJECTS — every project, with language (Telugu / Kannada) and type filters.
  gallery: {
    label: "Our Projects",
    title: "Telugu & Kannada cinema",
    intro: "Posters, title designs and campaigns — choose a language, then a type.",
    viewAllLink: "Open the full gallery →",
  },

  // 4. HOW WE WORK — uses the first four images of the showcase project.
  process: {
    label: "How We Work",
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

  // 5. BTS / MAKING STILLS — the stills themselves are listed in bts.ts.
  making: {
    label: "Behind the Scenes",
    title: "Making stills",
    intro: "From the shoot floor to the design desk — how the art comes together.",
    /** Shown while bts.ts has no stills yet. */
    empty: "Stills from our shoots and design desk are on their way.",
  },

  // 6. ABOUT US — the studio, its founder, and the numbers.
  about: {
    label: "About Us",
    title: "The studio",
    /** [CLIENT TO CONFIRM] Add a founder bio and photo when ready. */
    paragraphs: [
      "Dolly Design Studio is a creative collective based in Bangalore, specialising in film publicity and title design for Telugu and Kannada cinema.",
      "We blend artistry with strategy — posters, title logos, typography and full campaigns — to craft identities that elevate films and leave a lasting mark.",
    ],
    founderLabel: "Founded by",
    stats: [
      { value: 4, suffix: "+", label: "Years of experience" },
      { value: 10, suffix: "+", label: "Feature films" },
      { value: 10, suffix: "+", label: "Happy clients" },
    ],
  },

  // 7. OUR CLIENTS — scrolling names (they're in clients.ts).
  clients: {
    label: "Our Clients",
    title: "Clients & collaborations",
    /** Read out by screen readers before the list of names. */
    screenReaderIntro: "Clients and collaborators:",
  },

  // 8. CONTACT US — the enquiry form.
  contact: {
    label: "Contact Us",
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
