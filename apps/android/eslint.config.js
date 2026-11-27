import { config } from "@repo/eslint-config/react-internal";
import globals from "globals";

export default [
  ...config,
  { files: ["scripts/**"], languageOptions: { globals: globals.node } },
  { ignores: ["dist/**", "android/**", "www/**"] },
];
