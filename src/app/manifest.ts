import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Waxstack",
    short_name: "Waxstack",
    description: "Find any record on your shelves.",
    start_url: "/",
    display: "standalone",
    background_color: "#110f0e",
    theme_color: "#110f0e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
