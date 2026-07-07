export type NoteData = {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  updatedAt: string;
};

// Google Keep's note palette
export const NOTE_COLORS: { name: string; value: string }[] = [
  { name: "default", value: "#ffffff" },
  { name: "coral", value: "#faafa8" },
  { name: "peach", value: "#f39f76" },
  { name: "sand", value: "#fff8b8" },
  { name: "mint", value: "#e2f6d3" },
  { name: "sage", value: "#b4ddd3" },
  { name: "fog", value: "#d4e4ed" },
  { name: "storm", value: "#aeccdc" },
  { name: "dusk", value: "#d3bfdb" },
  { name: "blossom", value: "#f6e2dd" },
  { name: "clay", value: "#e9e3d4" },
  { name: "chalk", value: "#efeff1" },
];

export function colorValue(name: string): string {
  return NOTE_COLORS.find((c) => c.name === name)?.value ?? "#ffffff";
}
