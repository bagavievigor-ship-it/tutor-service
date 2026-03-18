"use client";

import { useState } from "react";
import OfferRequestModal from "@/components/OfferRequestModal";

export default function TutorOfferButton({
  toTutorUserId,
  tutorName,
  compact,
}: {
  toTutorUserId: number;
  tutorName?: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={compact ? "badge badgePrimary" : "btn btnPrimary"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Предложить репетитору откликнуться на вашу заявку"
      >
        Предложить заявку
      </button>

      <OfferRequestModal
        open={open}
        onClose={() => setOpen(false)}
        toTutorUserId={toTutorUserId}
        tutorName={tutorName}
      />
    </>
  );
}
