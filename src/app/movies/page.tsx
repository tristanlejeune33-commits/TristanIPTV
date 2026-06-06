"use client";

import { TypePage } from "@/components/type-page";

export default function MoviesPage() {
  return (
    <TypePage
      title="Films"
      subtitle="VOD"
      type="movie"
      emptyTitle="Aucun film"
      emptyDescription="Ta playlist ne contient pas de films détectables."
      posterStyle
    />
  );
}
