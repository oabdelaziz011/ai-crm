import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInteractiveMenuOutbound,
  findPrimaryMenuNode,
  isInteractiveMenuNode,
  isPrimaryMenuNode,
  PRIMARY_MENU_CONFIG_KEY,
  shouldRedirectToPrimaryMenu,
} from "./main-menu.js";
import type { AutomationNodeRecord } from "../types.js";

const BUTTONS_NODE: AutomationNodeRecord = {
  id: "menu-1",
  flow_id: "flow-1",
  type: "action",
  config: {
    action: "send_buttons",
    message: "Main menu",
    buttons: [
      { id: "pricing", label: "Pricing" },
      { id: "support", label: "Support" },
    ],
    [PRIMARY_MENU_CONFIG_KEY]: true,
  },
  position_x: 0,
  position_y: 0,
};

describe("main menu runtime", () => {
  it("detects interactive menu nodes", () => {
    assert.equal(isInteractiveMenuNode(BUTTONS_NODE), true);
    assert.equal(
      isInteractiveMenuNode({ ...BUTTONS_NODE, config: { action: "send_message", message: "Hi" } }),
      false,
    );
  });

  it("detects primary menu nodes", () => {
    assert.equal(isPrimaryMenuNode(BUTTONS_NODE), true);
    assert.equal(
      isPrimaryMenuNode({
        ...BUTTONS_NODE,
        config: { ...BUTTONS_NODE.config, [PRIMARY_MENU_CONFIG_KEY]: false },
      }),
      false,
    );
  });

  it("finds the single primary menu in a published graph", () => {
    assert.equal(findPrimaryMenuNode([BUTTONS_NODE]).id, "menu-1");
    assert.throws(() => findPrimaryMenuNode([]), /no Primary Menu/);
    assert.throws(
      () =>
        findPrimaryMenuNode([
          BUTTONS_NODE,
          { ...BUTTONS_NODE, id: "menu-2" },
        ]),
      /multiple Primary Menu/,
    );
  });

  it("detects redirect output from return to main menu", () => {
    assert.equal(shouldRedirectToPrimaryMenu({ redirectToPrimaryMenu: true }), true);
    assert.equal(shouldRedirectToPrimaryMenu({}), false);
  });

  it("interpolates selected doctor name and price on follow-up buttons", () => {
    const { outbound, prompt } = buildInteractiveMenuOutbound(
      {
        ...BUTTONS_NODE,
        config: {
          action: "send_buttons",
          message: "تحب تحجز ميعاد مع د. {{selected_resource.name}}؟",
          buttons: [
            { id: "book", label: "حجز ميعاد" },
            { id: "no", label: "خلاص، شكراً" },
          ],
        },
      },
      {
        language: "ar",
        variables: {
          selected_resource: { id: "doc-1", name: "Youssef Kamal" },
          selected_service: { id: "svc-1", price_cents: 25000 },
        },
      },
    );

    assert.equal(prompt, "تحب تحجز ميعاد مع د. Youssef Kamal؟");
    assert.equal(outbound.kind, "buttons");
    assert.equal(outbound.text, "تحب تحجز ميعاد مع د. Youssef Kamal؟");
  });
});
