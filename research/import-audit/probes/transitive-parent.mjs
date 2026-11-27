// B3: clean entry file that imports a dirty dependency
import { dep } from "./transitive-dep.mjs";
export const parent = dep + 1;
