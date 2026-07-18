import { Window } from "happy-dom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Route, Router, Switch, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const win = new Window({ url: "http://localhost/dashboard/customers" });
Object.assign(globalThis, {
  window: win,
  document: win.document,
  location: win.location,
  history: win.history,
  navigator: win.navigator,
  sessionStorage: win.sessionStorage,
  Event: win.Event,
  HTMLElement: win.HTMLElement,
  addEventListener: win.addEventListener.bind(win),
  removeEventListener: win.removeEventListener.bind(win),
  dispatchEvent: win.dispatchEvent.bind(win),
});

const { hook, navigate, history: memHistory } = memoryLocation({
  path: "/dashboard/customers",
  static: false,
});

function Leaf() {
  const [loc] = useLocation();
  return React.createElement("div", { id: "leaf" }, loc);
}

function Inner() {
  const [loc] = useLocation();
  return React.createElement(
    "div",
    null,
    React.createElement("div", { id: "nested-loc" }, loc),
    React.createElement(
      Switch,
      null,
      React.createElement(Route, { path: "/customers" }, React.createElement(Leaf, null)),
      React.createElement(Route, { path: "/" }, React.createElement("div", { id: "root-redirect" }, "redirect")),
      React.createElement(Route, null, React.createElement("div", { id: "not-found" }, "404")),
    ),
  );
}

function App() {
  return React.createElement(
    Router,
    { hook },
    React.createElement(
      Switch,
      null,
      React.createElement(Route, { path: "/dashboard", nest: true, component: Inner }),
    ),
  );
}

const rootEl = document.createElement("div");
document.body.appendChild(rootEl);
const root = createRoot(rootEl);

await act(async () => {
  root.render(React.createElement(App));
});

console.log("customers:", JSON.stringify({
  fullPath: memHistory.at(-1),
  nestedLoc: document.getElementById("nested-loc")?.textContent,
  leaf: document.getElementById("leaf")?.textContent,
  notFound: document.getElementById("not-found")?.textContent,
}, null, 2));

await act(async () => {
  navigate("/dashboard");
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

console.log("dashboard root:", JSON.stringify({
  fullPath: memHistory.at(-1),
  nestedLoc: document.getElementById("nested-loc")?.textContent,
  redirect: document.getElementById("root-redirect")?.textContent,
  leaf: document.getElementById("leaf")?.textContent,
}, null, 2));

await act(async () => {
  navigate("/dashboard/customers");
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

console.log("customers again:", JSON.stringify({
  fullPath: memHistory.at(-1),
  nestedLoc: document.getElementById("nested-loc")?.textContent,
  leaf: document.getElementById("leaf")?.textContent,
}, null, 2));
