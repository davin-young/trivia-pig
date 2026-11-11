import next from "eslint-config-next";

export default [
  { ignores: [".next/**", "dist/**", "node_modules/**", "next-env.d.ts", "uploads/**"] },
  ...next,
  {
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
];
