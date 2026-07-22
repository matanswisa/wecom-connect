export interface EmployeeColor {
  solid: string;
  soft: string;
}

const EMPLOYEE_COLORS: EmployeeColor[] = [
  { solid: "#2563eb", soft: "#eff6ff" },
  { solid: "#0f766e", soft: "#f0fdfa" },
  { solid: "#b45309", soft: "#fffbeb" },
  { solid: "#be123c", soft: "#fff1f2" },
  { solid: "#7c3aed", soft: "#f5f3ff" },
  { solid: "#047857", soft: "#ecfdf5" },
  { solid: "#c2410c", soft: "#fff7ed" },
  { solid: "#0369a1", soft: "#f0f9ff" }
];

export function getEmployeeColor(identifier: string): EmployeeColor {
  let hash = 0;
  for (const character of identifier) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return EMPLOYEE_COLORS[hash % EMPLOYEE_COLORS.length];
}
