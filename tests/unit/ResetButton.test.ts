/**
 * @fileoverview Tests for ResetButton.vue — the large "start over" control
 * shown above and below the results. It owns no state: it renders a labelled
 * button and emits `reset`, so the page keeps the single resetAll() definition.
 */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ResetButton from "~/components/ResetButton.vue";

const global = { stubs: { UIcon: { template: "<i />" } } };

describe("ResetButton", () => {
  it("renders the default label", () => {
    const wrapper = mount(ResetButton, { global });
    expect(wrapper.text()).toContain("Start over");
  });

  it("accepts a custom label", () => {
    const wrapper = mount(ResetButton, { global, props: { label: "Clear everything" } });
    expect(wrapper.text()).toContain("Clear everything");
  });

  it("emits reset when clicked", async () => {
    const wrapper = mount(ResetButton, { global });
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("reset")).toHaveLength(1);
  });

  it("gives the button an accessible name that says what it does", () => {
    const wrapper = mount(ResetButton, { global });
    const label = wrapper.get("button").attributes("aria-label") ?? "";
    expect(label.toLowerCase()).toContain("clear");
  });

  it("shows the hint only when one is given", () => {
    const bare = mount(ResetButton, { global });
    expect(bare.find("[data-test='reset-hint']").exists()).toBe(false);

    const withHint = mount(ResetButton, {
      global,
      props: { hint: "Clears the URL, the pasted HTML, and every result." },
    });
    expect(withHint.get("[data-test='reset-hint']").text()).toContain(
      "Clears the URL",
    );
  });

  it("is a real button element, so keyboard and screen readers get it free", () => {
    const wrapper = mount(ResetButton, { global });
    const button = wrapper.get("button");
    expect(button.attributes("type")).toBe("button");
  });

  it("meets the 44px touch target the project requires", () => {
    const wrapper = mount(ResetButton, { global });
    // WCAG 2.5.5 / project accessibility standard — enforced by class, since
    // jsdom has no layout engine to measure against.
    expect(wrapper.get("button").classes().join(" ")).toMatch(/min-h-\[\d{2,}px\]/);
  });
});
