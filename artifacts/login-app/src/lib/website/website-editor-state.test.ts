import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultWebsiteSections, placeWebsiteBlock, reorderChannels, reorderHeroSlots, reorderIndexed, sanitizeWebsiteContent } from "./website-model.js";
import { commitEditorChange, emptyEditorHistory, redoEditorChange, undoEditorChange, type WebsiteEditorSlice } from "./website-editor-state.js";

const slice = (headline: string): WebsiteEditorSlice => ({
  headline,
  description: "",
  sections: defaultWebsiteSections(),
  gallery: { direction: "left", position: "center", slides: [] },
  content: sanitizeWebsiteContent({}),
});

describe("website visual editor state", () => {
  it("undoes and redoes a text edit without dropping the other side", () => {
    let history = commitEditorChange(emptyEditorHistory(), slice("first"));
    history = commitEditorChange(history, slice("second"));
    const undone = undoEditorChange(history, slice("third"));
    assert.equal(undone?.value.headline, "second");
    const redone = redoEditorChange(undone!.history, undone!.value);
    assert.equal(redone?.value.headline, "third");
    assert.equal(undoEditorChange(emptyEditorHistory(), slice("only")), null);
  });

  it("places a gallery before services and refuses an unsupported block", () => {
    const content = sanitizeWebsiteContent({});
    const placed = placeWebsiteBlock(content.order, { ...defaultWebsiteSections(), gallery: false }, "gallery", "services");
    assert.equal(placed?.sections.gallery, true);
    assert.ok(placed && placed.order.indexOf("gallery") < placed.order.indexOf("services"));
    assert.equal(placeWebsiteBlock(content.order, placed!.sections, "faq", "about"), null);
  });

  it("keeps a header template and reorders social channels", () => {
    const content = sanitizeWebsiteContent({ appearance: { headerStyle: "transparent", iconShape: "square", iconFill: "outline" }, hero: { align: "center", emphasis: "italic" } });
    assert.equal(content.appearance.headerStyle, "transparent");
    assert.equal(content.appearance.iconShape, "square");
    assert.equal(content.hero.align, "center");
    assert.equal(content.hero.emphasis, "italic");
    const channels = reorderChannels(
      [{ id: "facebook", value: "https://facebook.com/a" }, { id: "instagram", value: "https://instagram.com/a" }, { id: "whatsapp", value: "201001112233" }],
      "whatsapp",
      "facebook",
    );
    assert.equal(channels[0]?.id, "whatsapp");
  });

  it("undoes a hero slot move and a feature reorder", () => {
    const start = slice("clinic");
    const moved = {
      ...start,
      content: {
        ...start.content,
        hero: { ...start.content.hero, stack: reorderHeroSlots(start.content.hero.stack, "buttons", "title") },
        features: { items: reorderIndexed([{ title: "A", text: "" }, { title: "B", text: "" }], 1, 0) },
      },
    };
    const history = commitEditorChange(emptyEditorHistory(), start);
    const undone = undoEditorChange(history, moved);
    assert.deepEqual(undone?.value.content.hero.stack, ["title", "text", "buttons"]);
    assert.equal(redoEditorChange(undone!.history, undone!.value)?.value.content.features.items[0]?.title, "B");
  });
});
