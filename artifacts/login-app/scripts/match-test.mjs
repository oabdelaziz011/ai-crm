import { parse } from "regexparam";

const parser = (route, loose) => {
  const { pattern, keys } = parse(route, loose);
  return { pattern, keys };
};

function matchRoute(route, path, loose) {
  const { pattern, keys } = parser(route, loose);
  const result = pattern.exec(path) || [];
  const base = result[0];
  if (base === undefined) return { matches: false };
  return { matches: true, base, loose };
}

function relativePath(base, path) {
  const b = base === "/" ? "" : base;
  return !path.toLowerCase().indexOf(b.toLowerCase())
    ? path.slice(b.length) || "/"
    : "~" + path;
}

const nest = matchRoute("/dashboard", "/dashboard/customers", true);
console.log("nest parent", nest);
console.log("nested loc", relativePath(nest.base ?? "/dashboard", "/dashboard/customers"));

const inner = matchRoute("/customers", "/customers", false);
console.log("inner match", inner);

const innerWrong = matchRoute("/customers", "/dashboard/customers", false);
console.log("inner wrong path", innerWrong);
