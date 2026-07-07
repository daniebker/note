"use client";

import { CheckIcon } from "./icons";
import { NOTE_COLORS } from "./note-types";

export function ColorPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-[#dadce0] bg-white p-2 shadow-lg">
      {NOTE_COLORS.map((c) => (
        <button
          aria-label={`Color ${c.name}`}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
            selected === c.name
              ? "border-[#a142f4]"
              : c.name === "default"
                ? "border-[#dadce0]"
                : "border-transparent"
          }`}
          key={c.name}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(c.name);
          }}
          style={{ backgroundColor: c.value }}
          title={c.name}
          type="button"
        >
          {selected === c.name && <CheckIcon className="h-4 w-4 text-[#a142f4]" />}
        </button>
      ))}
    </div>
  );
}
