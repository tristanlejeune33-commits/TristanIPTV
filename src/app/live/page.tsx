"use client";

import { TypePage } from "@/components/type-page";

export default function LivePage() {
  return (
    <TypePage
      title="Chaînes en direct"
      subtitle="Live TV"
      type="live"
      emptyTitle="Aucune chaîne en direct"
      emptyDescription="Ta playlist ne contient pas de chaînes live détectables."
    />
  );
}
