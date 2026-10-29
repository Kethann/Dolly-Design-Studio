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
    label: "About Our Agency",
    /** Words wrapped in *asterisks* are set in gold italic. */
    statement: "Let us be the cover page of your beautiful book called *‘Cinema’.*",
    body: "Dolly Design Studio is a creative collection specializing in film publicity and title design. We blend artistry with strategy to craft unforgettable identities that elevate films and leave a lasting mark.",
  },
  // …followed by what the agency does (the services themselves are in services.ts).
  services: {
    label: "What We Do",
    title: "Our Services",
  },

  // 3. OUR PROJECTS — every project, with type filters.
  gallery: {
    label: "Project Gallery",
    title: "Posters, titles & campaigns",
    intro: "Posters, title designs and campaigns — pick a type to filter.",
    viewAllLink: "Open the full gallery →",
  },

  // 4. HOW WE WORK — four simple cards in a single row, each with a line icon (sketch, camera, pipeline, layers).
  process: {
    label: "How We Work",
    title: "From first sketch to final art",
    intro: "Every project moves through the same four steps, so you always know what comes next.",
    cards: [
      { title: "Sketchboards", note: "Ideas on paper", body: "We sketch layouts and lettering first, so you see the direction early.", icon: "sketch", opensBreakdowns: false },
      { title: "Photoshoot / BTS", note: "On the shoot floor", body: "We direct the shoot for the artwork and share the behind-the-scenes moments.", icon: "camera", opensBreakdowns: false },
      { title: "Pipelines", note: "Brief to release", body: "Every project follows clear steps, so feedback always lands in the right stage.", icon: "pipeline", opensBreakdowns: false },
      { title: "Breakdowns", note: "Layers / Videos", body: "We show how the final art is built, layer by layer and in short videos.", icon: "layers", opensBreakdowns: true },
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

  // 6. THE NUMBERS — shown right under the agency statement.
  stats: [
    { value: 4, suffix: "+", label: "Years of experience" },
    { value: 10, suffix: "+", label: "Films" },
    { value: 10, suffix: "+", label: "Happy clients" },
  ],

  // 7. ABOUT THE FOUNDER — name and role come from site.ts.
  founder: {
    label: "About the Founder",
    /** A photo of the founder (empty = a monogram). */
    photo: "",
    /** What the photo shows, for screen readers and search engines. */
    photoAlt: "",
    /** The photo's shape: "round", "rounded" or "square". */
    photoShape: "round",
    /** How big it is on the card: "small", "medium" or "large". */
    photoSize: "medium",
    /** A short description shown on the glass profile card, under the name and role. */
    cardNote: "Designing film posters, title logos and typography for Telugu cinema.",
    /** [CLIENT TO CONFIRM] Add a fuller bio and a photo when ready. */
    paragraphs: [
      "Sasank Muppalla is the founder and creative director of Dolly Design Studio, designing film posters, title logos and typography from Bangalore.",
      "His work has taken him across production houses such as Annapurna Studios, Arka Media Works and People Media Factory, and filmmakers and actors including Adivi Sesh and Varun Tej.",
    ],
  },

  // 8. CLIENTS & COLLABORATIONS — scrolling names (they're in clients.ts).
  clients: {
    label: "Our Clients",
    title: "Clients & collaborations",
    rowLabels: { clients: "Production houses", collaborators: "Filmmakers & actors" },
    /** The shape of the round portraits in the Filmmakers & actors row: "round", "rounded" or "square". */
    portraitShape: "round",
    /** How big the portraits are: "small", "medium" or "large". */
    portraitSize: "large",
    /** How big the production-house logos are: "small", "medium" or "large". */
    logoSize: "large",
    /** Read out by screen readers before the list of names. */
    screenReaderIntro: "Clients and collaborators:",
  },

  // 9. CONTACT US — the enquiry form.
  contact: {
    label: "Contact Us",
    headline: "Let’s create something cinematic.",
    availability: "Available for feature films, OTT originals & campaign launches",
    whatsappLabel: "WhatsApp",
    form: {
      nameLabel: "Name",
      emailLabel: "Email",
      phoneLabel: "Phone number",
      companyLabel: "Company / Production",
      projectTypeLabel: "Project type",
      budgetLabel: "Budget range",
      timelineLabel: "Timeline",
      messageLabel: "Describe your project",
      messagePlaceholder: "What are you making, who is it for, and when do you need it?",
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
        missingFields: "Please check the highlighted fields and try again.",
        tooManyRequests: "Too many requests. Please try again later.",
        sendFailed: "Could not send your message right now. Please email us directly.",
        badRequest: "Invalid request body.",
      },
    },
  },
} as const;
