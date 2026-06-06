import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/tristan-iptv",
    name: "TRISTAN IPTV — Films, séries et chaînes",
    short_name: "TRISTAN IPTV",
    description:
      "Lecteur M3U / IPTV moderne. Catalogue de films, séries et chaînes en direct avec interface inspirée des grandes plateformes de streaming.",
    start_url: "/",
    scope: "/",
    // Fullscreen + standalone fallback chain — fullscreen kicks in on
    // Android TV / Chromecast with Google TV, standalone on phones, browser
    // on anything else.
    display: "standalone",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "fr",
    dir: "ltr",
    categories: ["entertainment", "video", "tv"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/apple-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/screenshot-wide.svg",
        sizes: "1280x720",
        type: "image/svg+xml",
        form_factor: "wide",
        label: "Accueil TRISTAN IPTV avec films et séries",
      },
    ],
    shortcuts: [
      {
        name: "Films",
        short_name: "Films",
        url: "/movies",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Séries",
        short_name: "Séries",
        url: "/series",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Live TV",
        short_name: "Live",
        url: "/live",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
  };
}
