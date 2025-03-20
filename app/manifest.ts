import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Running Activity Tracker",
    short_name: "RunTracker",
    description: "Track your running activities with GPS, time, and pace",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    orientation: "portrait",
  };
}
