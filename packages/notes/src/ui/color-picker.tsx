import { CheckIcon } from "./icons";
import { colorValue, NOTE_COLOR_NAMES } from "./note-types";

export function ColorPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-edge bg-surface p-2 shadow-lg">
      {NOTE_COLOR_NAMES.map((name) => (
        <button
          aria-label={`Color ${name}`}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
            selected === name
              ? "border-[#a142f4]"
              : name === "default"
                ? "border-edge"
                : "border-transparent"
          }`}
          key={name}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(name);
          }}
          style={{ backgroundColor: colorValue(name) }}
          title={name}
          type="button"
        >
          {selected === name && <CheckIcon className="h-4 w-4 text-[#a142f4]" />}
        </button>
      ))}
    </div>
  );
}
