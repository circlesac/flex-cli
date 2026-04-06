export const commonArgs = {
  json: { type: "boolean" as const, description: "Output as JSON" },
  plain: { type: "boolean" as const, description: "Output as plain text (TSV)" },
};
